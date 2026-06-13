const db = require('../database');
const dotenv = require('dotenv');

dotenv.config();

exports.createErrand = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: "로그인이 된 상태여야 합니다." });
    }

    const user_id = req.user.id;
    const title = req.body.title || '제목 없음';
    const content = req.body.content || '';
    const location = req.body.location || '';
    const cost = req.body.cost || 0;
    const deadline = req.body.deadline || null;
    let tags = req.body.tags || null;
    
    // 🌟 잃어버렸던 위도, 경도 데이터 구출 완료!
    const latitude = req.body.latitude || null;
    const longitude = req.body.longitude || null;

    // 🌟 multer가 안전하게 받아준 이미지 파일들을 JSON 문자열로 변환!
    let image_url = null;
    if (req.files && req.files.length > 0) {
      const imageUrls = req.files.map(file => {
        return `/uploads/${file.filename}`;
      });
      image_url = JSON.stringify(imageUrls);
    }

    // 🌟 태그가 배열(Array)로 들어온다면 DB 저장을 위해 문자열로 변환합니다.
    if (tags && typeof tags !== 'string') {
      tags = JSON.stringify(tags);
    }

    // 🌟 SQL 쿼리에 latitude, longitude 컬럼 완벽 추가!
    const sql = `
      INSERT INTO posts (
        user_id, title, content, location, latitude, longitude, cost, status, deadline, tags, image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?, ?)
    `;

    const values = [
      user_id,
      title,
      content,
      location,
      latitude,
      longitude,
      cost,
      deadline,
      tags,
      image_url
    ];

    const [result] = await db.promise().execute(sql, values);

    res.status(201).json({
      success: true,
      message: "등록 성공",
      errandId: result.insertId,
      imageUrls: image_url ? JSON.parse(image_url) : [],
    });

  } catch (error) {
    console.error("등록실패 : ", error);
    res.status(500).json({
      success: false,
      message: "서버 이상 있음"
    });
  }
};

exports.assignErrand = async (req, res) => {
  try {
    const postId = req.params.postId; // URL에서 글 번호 가져오기
    const assignedUserId = req.body.userId; // 프론트에서 보낸 지원자 ID

    // 🌟 핵심 변경: posts 테이블이 아니라 applications 테이블의 status를 'ACCEPTED'로 바꿉니다!
    const appSql = `
      UPDATE applications
      SET status = 'ACCEPTED'
      WHERE post_id = ? AND user_id = ?
    `;
    // 쿼리 실행 (파라미터 순서 주의: postId, assignedUserId 순서대로 배열에 넣습니다)
    const [appResult] = await db.promise().execute(appSql, [postId, assignedUserId]);

    if (appResult.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "해당 지원 내역을 찾을 수 없습니다." });
    }

    // 💡 (선택 사항) 만약 게시글 자체의 상태도 'IN_PROGRESS(진행중)'로 바꾸고 싶다면 아래 코드를 추가하세요.
    const postSql = `
      UPDATE posts
      SET status = 'MATCHED',
          assigned_user_id = ?,
          assigned_notice_read = 0
      WHERE id = ?
    `;
    // 다은 assigned_user_id 추가 
    await db.promise().execute(postSql, [assignedUserId, postId]);

    res.status(200).json({
      success: true,
      message: "지원자가 성공적으로 선택되었습니다!"
    });
  } catch (error) {
    console.error("지원자 선택 실패:", error);
    res.status(500).json({ success: false, message: "서버 에러가 발생했습니다." });
  }
};

// 선택 취소 
exports.cancelAssignErrand = async (req, res) => {
  try {
    const postId = req.params.postId;
    const assignedUserId = req.body.userId;
    
    // 🌟 상태를 다시 'PENDING(대기중)'으로 되돌립니다.
    const sql = `
      UPDATE applications
      SET status = 'PENDING'
      WHERE post_id = ? AND user_id = ?
    `;
    const [result] = await db.promise().execute(sql, [postId, assignedUserId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "해당 지원 내역을 찾을 수 없습니다." });
    }

    const postSql = `
      UPDATE posts
      SET status = 'WAITING',
          assigned_user_id = NULL
      WHERE id = ?
    `;
    // 다은 추가, 취소하면 맡은 사람도 데이터 비워지게
    await db.promise().execute(postSql, [postId]);

    res.status(200).json({
      success: true,
      message: "지원자 선택이 취소되었습니다."
    });
  } catch (error) {
    console.error("지원자 선택 취소 실패:", error);
    res.status(500).json({ success: false, message: "서버 에러가 발생했습니다." });
  }
};

exports.completeErrand = async (req, res) => {
  try {
    const postId = req.params.postId;

    // 1. 배정된 유저 정보를 미리 조회 (카운트 증가를 위해)
    const [postRows] = await db.promise().execute(
      'SELECT assigned_user_id FROM posts WHERE id = ?',
      [postId]
    );

    if (postRows.length === 0) return res.status(404).json({ success: false, message: '게시물을 찾을 수 없습니다.' });

    const sql = `
      UPDATE posts
      SET status = 'COMPLETE'
      WHERE id = ?
    `;

    const [result] = await db.promise().execute(sql, [postId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '게시물을 찾을 수 없습니다.' });
    }

    // 2. 배정된 유저가 있다면 해당 유저의 completed_errand_count를 1 증가시킴
    const assignedUserId = postRows[0].assigned_user_id;
    if (assignedUserId) {
      const updateUserSql = `
        UPDATE users 
        SET completed_errand_count = completed_errand_count + 1,
            grade = CASE 
                WHEN (completed_errand_count + 1) >= 100 THEN 'S'
                WHEN (completed_errand_count + 1) >= 50 THEN 'A'
                WHEN (completed_errand_count + 1) >= 10 THEN 'B'
                ELSE grade 
            END
        WHERE id = ?
      `;
      await db.promise().execute(updateUserSql, [assignedUserId]);
    }

    res.status(200).json({
      success: true,
      message: '심부름이 완료 처리되었습니다.'
    });
  } catch (error) {
    console.error('심부름 완료 처리 실패:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
};

exports.markApplicantsAsRead = async (req, res) => {
  try {
    const postId = req.params.postId;

    await db.promise().execute(
      `UPDATE applications 
       SET is_read_by_writer = 1 
       WHERE post_id = ?`,
      [postId]
    );

    res.status(200).json({
      success: true,
      message: '지원자 알림 확인 처리 완료'
    });
  } catch (error) {
    console.error('지원자 알림 확인 실패:', error);
    res.status(500).json({ success: false, message: '서버 에러' });
  }
};

exports.markAssignedNoticeAsRead = async (req, res) => {
  try {
    const postId = req.params.postId;

    await db.promise().execute(
      `UPDATE posts 
       SET assigned_notice_read = 1 
       WHERE id = ?`,
      [postId]
    );

    res.status(200).json({
      success: true,
      message: '배정 알림 확인 처리 완료'
    });
  } catch (error) {
    console.error('배정 알림 확인 실패:', error);
    res.status(500).json({ success: false, message: '서버 에러' });
  }
};