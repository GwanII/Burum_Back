// src/init_db.js
const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

// 1. DB 연결 (일단 'sys' 시스템 DB로 접속해서 판을 깝니다)
const connection = mysql.createConnection({
  host: process.env.DB_HOST,      // .env에서 가져옴
  user: process.env.DB_USER,      // .env에서 가져옴
  password: process.env.DB_PASSWORD, // .env에서 가져옴
  port: process.env.DB_PORT,
  database: 'sys', // ⚠️ 중요: 처음엔 burum_db가 없으니까 sys로 접속!
  multipleStatements: true
});

// 2. 실행할 SQL 명령어
const sql = `
  CREATE DATABASE IF NOT EXISTS burum_db;
  USE burum_db;

  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role ENUM('USER', 'ADMIN') DEFAULT 'USER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    cost INT DEFAULT 0,
    status ENUM('WAITING', 'MATCHED', 'COMPLETE') DEFAULT 'WAITING',
    view_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`;

connection.connect((err) => {
  if (err) return console.error('❌ 접속 실패 (비번 확인 필요):', err);
  
  console.log('✅ 접속 성공! burum_db 생성을 시작합니다...');
  
  connection.query(sql, (err, result) => {
    if (err) {
      console.error('❌ 생성 실패:', err);
    } else {
      console.log('🎉 DB 생성 완료! 이제 서버를 켜도 됩니다.');
    }
    connection.end();
  });
});