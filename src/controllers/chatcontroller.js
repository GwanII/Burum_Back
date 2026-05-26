const db = require('../database');
const multer = require('multer');
const { getIo } = require('../socket');
const path = require('path');
const fs = require('fs');

/**
 * 특정 채팅방에 속한 모든 사용자에게
 * 채팅목록 갱신용 이벤트를 보냄
 */
function emitChatRoomUpdatedToUsers(roomId) {
  const sql = `
    SELECT user_id
    FROM chat_room_users
    WHERE chat_room_id = ?
  `;

  db.query(sql, [roomId], (err, users) => {
    if (err) {
      console.error('emitChatRoomUpdatedToUsers 조회 오류:', err);
      return;
    }

    try {
      const io = getIo();

      users.forEach((user) => {
        io.to(`user:${user.user_id}`).emit('chatRoomUpdated', {
          roomId: Number(roomId),
        });
      });
    } catch (socketErr) {
      console.error(
        'emitChatRoomUpdatedToUsers socket 오류:',
        socketErr.message
      );
    }
  });
}
// 1. 채팅방 생성
exports.createChatRoom = (req, res) => {
  const { user1, user2, postId } = req.body;
  
  // postId가 없거나 undefined일 때를 위한 처리
  const normalizedPostId = postId || null;

  // 🌟 db.getConnection 없이 db에서 바로 트랜잭션을 시작합니다.
  db.beginTransaction((txErr) => {
    if (txErr) {
      console.error('트랜잭션 시작 실패:', txErr);
      return res.status(500).json({ message: '트랜잭션 시작 실패' });
    }

    const checkSql = `
      SELECT cr.id
      FROM chat_rooms cr
      JOIN chat_room_users u1 ON cr.id = u1.chat_room_id
      JOIN chat_room_users u2 ON cr.id = u2.chat_room_id
      WHERE u1.user_id = ?
        AND u2.user_id = ?
        AND (
          (cr.post_id = ?)
          OR (cr.post_id IS NULL AND ? IS NULL)
        )
      LIMIT 1
    `;

    // 🌟 connection.query 대신 db.query를 직접 사용합니다.
    db.query(
      checkSql,
      [user1, user2, normalizedPostId, normalizedPostId],
      (checkErr, rooms) => {
        if (checkErr) {
          return db.rollback(() => {
            console.error('채팅방 중복 체크 오류:', checkErr);
            res.status(500).json({ message: '채팅방 확인 실패' });
          });
        }

        // 이미 방이 존재하는 경우
        if (rooms.length > 0) {
          return db.commit(() => {
            res.json({
              message: '이미 존재하는 채팅방',
              roomId: rooms[0].id,
            });
          });
        }

        // 새로운 채팅방 생성
        const createRoomSql = `
          INSERT INTO chat_rooms (post_id)
          VALUES (?)
        `;

        db.query(createRoomSql, [normalizedPostId], (roomErr, result) => {
          if (roomErr) {
            return db.rollback(() => {
              console.error('채팅방 생성 오류:', roomErr);
              res.status(500).json({ message: '채팅방 생성 실패' });
            });
          }

          const roomId = result.insertId;

          // 채팅방에 유저 두 명 추가
          const addUsersSql = `
            INSERT INTO chat_room_users (chat_room_id, user_id)
            VALUES (?, ?), (?, ?)
          `;

          db.query(
            addUsersSql,
            [roomId, user1, roomId, user2],
            (userErr) => {
              if (userErr) {
                return db.rollback(() => {
                  console.error('채팅방 유저 연결 오류:', userErr);
                  res.status(500).json({ message: '채팅방 참여자 등록 실패' });
                });
              }

              // 모든 작업이 성공하면 최종 커밋
              db.commit((commitErr) => {
                if (commitErr) {
                  return db.rollback(() => {
                    res.status(500).json({ message: '채팅방 생성 저장 실패' });
                  });
                }

                // 실시간 소켓 알림
                try {
                  const io = getIo();
                  io.to(`user:${user1}`).emit('chatRoomCreated', { roomId });
                  io.to(`user:${user2}`).emit('chatRoomCreated', { roomId });
                } catch (socketErr) {
                  console.error('socket emit 오류(createChatRoom):', socketErr.message);
                }

                res.json({
                  message: '채팅방 새로 생성',
                  roomId,
                });
              });
            }
          );
        });
      }
    );
  });
};

// 2. 메시지 전송
exports.sendMessage = (req, res) => {
  const { chatRoomId, senderId, content } = req.body;

  const sql = `
    INSERT INTO messages (chat_room_id, sender_id, content, type)
    VALUES (?, ?, ?, 'text')
  `;

  db.query(sql, [chatRoomId, senderId, content], (err, result) => {
    if (err) return res.status(500).json(err);

    const messageId = result.insertId;

    const messageSql = `
      SELECT 
        m.*,
        u.nickname,
        u.profile_image_url
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
      LIMIT 1
    `;

    db.query(messageSql, [messageId], (err2, rows) => {
      if (err2) return res.status(500).json(err2);

      const newMessage = rows[0];

      try {
        const io = getIo();

        // 채팅방 안 사용자들에게 새 메시지 실시간 전송
        io.to(`room:${chatRoomId}`).emit('newMessage', newMessage);
      } catch (socketErr) {
        console.error('socket emit 오류(sendMessage):', socketErr.message);
      }

      // 채팅목록 갱신은 각 사용자 개인 room으로 전송
      emitChatRoomUpdatedToUsers(chatRoomId);

      res.json({
        message: '메시지 전송 성공',
        messageId,
        data: newMessage,
      });
    });
  });
};

// 3. 채팅방 메시지 조회
exports.getMessages = (req, res) => {
  const roomId = req.params.roomId;

  const sql = `
    SELECT 
      m.*,
      u.nickname,
      u.profile_image_url
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.chat_room_id = ?
    ORDER BY m.created_at ASC, m.id ASC
  `;

  db.query(sql, [roomId], (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
};

// 4. 채팅방 목록 조회
exports.getMyChatRooms = (req, res) => {
  const userId = req.params.userId;

  const sql = `
    SELECT 
      cr.id AS roomId,
      cr.created_at AS roomCreatedAt,

      cru.is_pinned AS isPinned,

      u.id AS otherUserId,
      u.nickname AS otherUserNickname,
      u.profile_image_url AS otherUserProfileImage,
      u.user_title AS otherUserTitle,
      u.grade AS otherUserGrade,

      p.id AS postId,
      p.title AS postTitle,
      p.image_url AS postImage,
      p.content AS postContent,
      p.cost AS postCost,
      p.status AS postStatus,
      p.deadline AS postDeadline,
      p.user_id AS postWriterId,
      p.tags As postTags,
      
      writer.nickname AS postWriterNickname,
      writer.profile_image_url AS postWriterProfileImage,
      writer.user_title AS postWriterTitle,
      writer.grade AS postWriterGrade,

      m.content AS lastMessage,
      m.type AS lastMessageType,
      m.image_url AS lastImageUrl,
      m.created_at AS lastMessageTime,

      (
        SELECT COUNT(*)
        FROM messages msg
        WHERE msg.chat_room_id = cr.id
          AND msg.sender_id != ?
          AND msg.is_read = 0
      ) AS unreadCount

    FROM chat_rooms cr

    JOIN chat_room_users cru
      ON cr.id = cru.chat_room_id

    JOIN chat_room_users other
      ON other.chat_room_id = cr.id
      AND other.user_id != ?

    JOIN users u
      ON u.id = other.user_id

    LEFT JOIN posts p
      ON p.id = cr.post_id

    LEFT JOIN users writer
    ON writer.id = p.user_id

    LEFT JOIN messages m
      ON m.id = (
        SELECT id
        FROM messages
        WHERE chat_room_id = cr.id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      )

    WHERE cru.user_id = ?
    ORDER BY cru.is_pinned DESC, COALESCE(m.created_at, cr.created_at) DESC, cr.id DESC
  `;

  db.query(sql, [userId, userId, userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: '에러 발생' });
    }

    res.json(results);
  });
};

// 5. 읽음 처리
exports.markAsRead = (req, res) => {
  const { roomId, userId } = req.body;

  const sql = `
    UPDATE messages
    SET is_read = 1
    WHERE chat_room_id = ?
      AND sender_id != ?
      AND is_read = 0
  `;

  db.query(sql, [roomId, userId], (err) => {
    if (err) return res.status(500).json(err);

    try {
      const io = getIo();

      // 채팅방 안에 있는 사용자들에게 읽음 처리 알림
      io.to(`room:${roomId}`).emit('messagesRead', {
        roomId: Number(roomId),
        userId: Number(userId),
      });
    } catch (socketErr) {
      console.error('socket emit 오류(markAsRead):', socketErr.message);
    }

    // 채팅목록 unreadCount 갱신
    emitChatRoomUpdatedToUsers(roomId);

    res.json({ message: '읽음 처리 완료' });
  });
};

// 6. 안읽음 개수
exports.getUnreadCount = (req, res) => {
  const userId = req.params.userId;

  const sql = `
    SELECT 
      m.chat_room_id,
      COUNT(*) AS unreadCount
    FROM messages m
    JOIN chat_room_users cru
      ON cru.chat_room_id = m.chat_room_id
    WHERE cru.user_id = ?
      AND m.sender_id != ?
      AND m.is_read = 0
    GROUP BY m.chat_room_id
  `;

  db.query(sql, [userId, userId], (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
};

// 7. 채팅방 나가기
exports.leaveChatRoom = (req, res) => {
  const { roomId } = req.params;
  const userId = req.query.userId || req.body.userId;

  if (!userId) {
    return res.status(400).json({ message: 'userId가 필요합니다.' });
  }

  const deleteSql = `
    DELETE FROM chat_room_users
    WHERE chat_room_id = ? AND user_id = ?
  `;

  db.query(deleteSql, [roomId, userId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: '에러 발생' });
    }

    try {
      const io = getIo();

      // 나간 사람 본인 목록에서 방 제거
      io.to(`user:${userId}`).emit('chatRoomDeleted', {
        roomId: Number(roomId),
      });
    } catch (socketErr) {
      console.error('socket emit 오류(leaveChatRoom):', socketErr.message);
    }

    // 남아있는 사용자들의 채팅목록도 갱신
    emitChatRoomUpdatedToUsers(roomId);

    res.json({ message: '채팅방에서 나갔습니다.' });
  });
};

// 8. 채팅방 고정/해제
exports.togglePinRoom = (req, res) => {
  const { roomId } = req.params;
  const { userId, isPinned } = req.body;

  const sql = `
    UPDATE chat_room_users
    SET is_pinned = ?
    WHERE chat_room_id = ? AND user_id = ?
  `;

  db.query(sql, [isPinned ? 1 : 0, roomId, userId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: '고정 처리 중 에러 발생' });
    }

    try {
      const io = getIo();

      // 핀 고정은 본인 목록만 바뀌면 됨
      io.to(`user:${userId}`).emit('chatRoomPinned', {
        roomId: Number(roomId),
        isPinned: !!isPinned,
      });
    } catch (socketErr) {
      console.error('socket emit 오류(togglePinRoom):', socketErr.message);
    }

    res.json({
      message: isPinned ? '채팅방 고정 완료' : '채팅방 고정 해제 완료',
    });
  });
};

// 9. 이미지 전송
const uploadDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage });
exports.upload = upload;

exports.sendImageMessage = (req, res) => {
  const { chatRoomId, senderId } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: '이미지 파일이 필요합니다.' });
  }

  const imageUrl = `/uploads/${req.file.filename}`;

  const sql = `
    INSERT INTO messages (chat_room_id, sender_id, type, image_url)
    VALUES (?, ?, 'image', ?)
  `;

  db.query(sql, [chatRoomId, senderId, imageUrl], (err, result) => {
    if (err) return res.status(500).json(err);

    const messageId = result.insertId;

    const messageSql = `
      SELECT 
        m.*,
        u.nickname,
        u.profile_image_url
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
      LIMIT 1
    `;

    db.query(messageSql, [messageId], (err2, rows) => {
      if (err2) return res.status(500).json(err2);

      const newMessage = rows[0];

      try {
        const io = getIo();

        // 채팅방 안 사용자들에게 새 이미지 메시지 실시간 전송
        io.to(`room:${chatRoomId}`).emit('newMessage', newMessage);
      } catch (socketErr) {
        console.error(
          'socket emit 오류(sendImageMessage):',
          socketErr.message
        );
      }

      // 채팅목록 갱신
      emitChatRoomUpdatedToUsers(chatRoomId);

      res.json({
        message: '이미지 전송 성공',
        messageId,
        imageUrl,
        data: newMessage,
      });
    });
  });
};