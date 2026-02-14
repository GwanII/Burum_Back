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
  USE burum_db;

  -- 1. 기존 테이블이 있다면 삭제 (구조 변경을 위해)
  DROP TABLE IF EXISTS posts;
  DROP TABLE IF EXISTS users;

  -- 2. 유저 테이블 생성
  CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role ENUM('USER', 'ADMIN') DEFAULT 'USER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- 3. 게시글 테이블 생성 (deadline, tags 추가됨!) 
  CREATE TABLE posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    cost INT DEFAULT 0,
    status ENUM('WAITING', 'MATCHED', 'COMPLETE') DEFAULT 'WAITING',
    deadline DATETIME,        -- 👈 마감 기한 (날짜+시간)
    tags JSON,                -- 👈 해시태그 (리스트 형태 저장)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- 4. 테스트 데이터 넣기
  INSERT INTO users (nickname, email, password, phone) 
  VALUES ('케로로', 'keroro@test.com', '1234', '010-1234-5678');

  -- tags는 '["#태그1", "#태그2"]' 형태로 넣습니다.
  INSERT INTO posts (user_id, title, content, cost, status, deadline, tags) VALUES 
  (4, '카레 가져다주기', '고씨네에서 카레 포장 부탁해요!', 5000, 'WAITING', '2024-02-20 18:00:00', '["#배달", "#음식"]'),
  (4, '수리검 표적지 만들기', '표적지 50장 인쇄 부탁합니다.', 7000, 'WAITING', '2024-02-21 12:00:00', '["#제작", "#문구", "#급함"]'),
  (4, '편의점 택배 수령', '집 앞 편의점 택배 좀 찾아주세요.', 3000, 'WAITING', '2024-02-15 10:00:00', '["#심부름"]');
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