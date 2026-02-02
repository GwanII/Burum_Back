// src/database.js
const mysql = require('mysql2');
const dotenv = require('dotenv');

// .env 파일의 내용을 불러옵니다.
dotenv.config(); 

// 로그로 확인 (비밀번호는 보안상 출력 안 함)
// undefined라고 뜨면 .env 파일 위치가 잘못된 것입니다.
console.log('📡 DB 연결 시도:', process.env.DB_HOST); 

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  multipleStatements: true,
});

connection.connect((err) => {
  if (err) {
    console.error('❌ AWS RDS 연결 실패:', err);
    return;
  }
  console.log('✅ AWS RDS 연결 성공! (보안 모드)');
});

module.exports = connection;