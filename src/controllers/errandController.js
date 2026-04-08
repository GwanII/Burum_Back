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
    const tags = req.body.tags || null;
    const image_url = req.body.image_url || null;

    const sql = `
      INSERT INTO posts (
        user_id, title, content, location, cost, status, deadline, tags, image_url
      ) VALUES (?, ?, ?, ?, ?, 'WAITING', ?, ?, ?)
    `;

    const values = [
      user_id,
      title,
      content,
      location,
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
    const sql = `
      UPDATE applications 
      SET status = 'ACCEPTED' 
      WHERE post_id = ? AND user_id = ?
    `;

    // 쿼리 실행 (파라미터 순서 주의: postId, assignedUserId 순서대로 배열에 넣습니다)
    const [result] = await db.promise().execute(sql, [postId, assignedUserId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "해당 지원 내역을 찾을 수 없습니다." });
    }

    // 💡 (선택 사항) 만약 게시글 자체의 상태도 'IN_PROGRESS(진행중)'로 바꾸고 싶다면 아래 코드를 추가하세요.
    // (단, 여러 명을 구하는 글이라면 1명만 선택해도 '진행중'으로 바뀔지, 아니면 다 구해야 바뀔지 기획에 따라 결정하시면 됩니다!)
    const postSql = `UPDATE posts SET status = 'IN_PROGRESS' WHERE id = ?`;
    await db.promise().execute(postSql, [postId]);

    res.status(200).json({
      success: true,
      message: "지원자가 성공적으로 선택되었습니다!"
    });

  } catch (error) {
    console.error("지원자 선택 실패:", error);
    res.status(500).json({ success: false, message: "서버 에러가 발생했습니다." });
  }
};



//선택 취소하기
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

    res.status(200).json({
      success: true,
      message: "지원자 선택이 취소되었습니다."
    });

  } catch (error) {
    console.error("지원자 선택 취소 실패:", error);
    res.status(500).json({ success: false, message: "서버 에러가 발생했습니다." });
  }
};