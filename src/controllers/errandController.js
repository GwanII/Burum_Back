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