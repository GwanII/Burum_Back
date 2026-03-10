const db = require('../database');
const multer = require("multer");

// 1️1. 채팅방 생성
exports.createChatRoom = (req, res) => {
  const { user1, user2 } = req.body;

  // 이미 같은 방이 있는지 검사
  const checkSql = `
    SELECT cr.id
    FROM chat_rooms cr
    JOIN chat_room_users u1 ON cr.id = u1.chat_room_id
    JOIN chat_room_users u2 ON cr.id = u2.chat_room_id
    WHERE u1.user_id = ? AND u2.user_id = ?
    LIMIT 1
  `;

  db.query(checkSql, [user1, user2], (err, rooms) => {
    if (err) return res.status(500).json(err);

    // 이미 방이 존재하면
    if (rooms.length > 0) {
      return res.json({
        message: "이미 존재하는 채팅방",
        roomId: rooms[0].id,
      });
    }

    // 없으면 새로 생성
    const createRoomSql = `INSERT INTO chat_rooms () VALUES ()`;

    db.query(createRoomSql, (err2, result) => {
      if (err2) return res.status(500).json(err2);

      const roomId = result.insertId;

      const addUsersSql = `
        INSERT INTO chat_room_users (chat_room_id, user_id)
        VALUES (?, ?), (?, ?)
      `;

      db.query(addUsersSql, [roomId, user1, roomId, user2], (err3) => {
        if (err3) return res.status(500).json(err3);

        res.json({
          message: "채팅방 새로 생성",
          roomId,
        });
      });
    });
  });
};

// 2. 메시지 전송
exports.sendMessage = (req, res) => {
  const { chatRoomId, senderId, content } = req.body;

  const sql = `
    INSERT INTO messages (chat_room_id, sender_id, content)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [chatRoomId, senderId, content], (err, result) => {
    if (err) return res.status(500).json(err);

    res.json({
      message: '메시지 전송 성공',
      messageId: result.insertId,
    });
  });
};

// 3. 채팅방 메시지 조회
exports.getMessages = (req, res) => {
  const roomId = req.params.roomId;

  const sql = `
    SELECT m.*, u.nickname
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE chat_room_id = ?
    ORDER BY m.created_at ASC
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

      m.content AS lastMessage,
      m.created_at AS lastMessageTime,

      (
        SELECT COUNT(*) 
        FROM messages 
        WHERE chat_room_id = cr.id
        AND sender_id != ?
        AND is_read = 0
      ) AS unreadCount

    FROM chat_rooms cr
    JOIN chat_room_users cru 
      ON cr.id = cru.chat_room_id

    LEFT JOIN messages m 
      ON m.id = (
        SELECT id FROM messages 
        WHERE chat_room_id = cr.id
        ORDER BY created_at DESC
        LIMIT 1
      )

    WHERE cru.user_id = ?
    ORDER BY lastMessageTime DESC
  `;

  db.query(sql, [userId, userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "에러 발생" });
    }

    res.json(results);
  });
};

// 5. 읽음 처리
exports.markAsRead = (req, res) => {
  const { roomId, userId } = req.body;

  const sql = `
    UPDATE messages
    SET is_read = TRUE
    WHERE chat_room_id = ?
    AND sender_id != ?
  `;

  db.query(sql, [roomId, userId], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "읽음 처리 완료" });
  });
};
// 6. 안읽음 개수 
exports.getUnreadCount = (req, res) => {
  const userId = req.params.userId;

  const sql = `
    SELECT chat_room_id, COUNT(*) as unreadCount
    FROM messages
    WHERE sender_id != ?
    AND is_read = FALSE
    GROUP BY chat_room_id
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).json(err);

    res.json(results);
  });
};

// 7. 채팅방 나가기
exports.leaveChatRoom = async (req, res) => {
  const userId = req.user.id;
  const { roomId } = req.params;

  try {
    await db.query(
      `DELETE FROM chat_room_users 
       WHERE chat_room_id = ? AND user_id = ?`,
      [roomId, userId]
    );

    res.json({ message: "채팅방에서 나갔습니다." });
  } catch (err) {
    res.status(500).json({ message: "에러 발생" });
  }
};

// 8. 이미지 전송
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

exports.upload = upload;

exports.sendImageMessage = (req, res) => {
  const { chatRoomId, senderId } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: "이미지 파일이 필요합니다." });
  }

  const imageUrl = `/uploads/${req.file.filename}`;

  const sql = `
    INSERT INTO messages 
    (chat_room_id, sender_id, type, image_url)
    VALUES (?, ?, 'image', ?)
  `;

  db.query(sql, [chatRoomId, senderId, imageUrl], (err, result) => {
    if (err) return res.status(500).json(err);

    res.json({
      message: "이미지 전송 성공",
      messageId: result.insertId,
      imageUrl
    });
  });
};