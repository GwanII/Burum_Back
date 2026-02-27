const db = require('../database');
const dotenv = require('dotenv');

dotenv.config();

exports.createErrand = async (req, res) => {
  try {
    const { user_id, title, content, cost, deadline, tags, image_url } = req.body;
    // status는 방금 등록했으니 'WAITING'으로 고정.
    const sql = `
      INSERT INTO posts (
        user_id, title, content, cost, status, deadline, tags, image_url
      ) VALUES (?, ?, ?, ?, 'WAITING', ?, ?, ?)
    `;

    const values = [
      user_id, 
      title, 
      content, 
      cost, 
      deadline, 
      JSON.stringify(tags), // 배열이나 객체를 JSON 문자열로 변환.
      image_url
    ];

    // const [result] = await db.execute(sql, values);
    const [result] = await db.promise().execute(sql, values);

    res.status(201).json({
      success: true,
      message: "등록 성공",
      errandId: result.insertId // 새로 생성된 심부름의 ID.
    });

  } catch (error) {
    console.error("등록 실패", error);
    res.status(500).json({
      success: false,
      message: "서버 이상 있음"
    });
  }
};