// src/database.js
const mysql = require('mysql2');
const dotenv = require('dotenv');

// .env 파일의 내용을 불러옵니다.
dotenv.config(); 

// 로그로 확인 (비밀번호는 보안상 출력 안 함)
// undefined라고 뜨면 .env 파일 위치가 잘못된 것입니다.
console.log('📡 DB 연결 시도:', process.env.DB_HOST); 

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: 10, // 최대 10개의 연결을 돌려가며 사용!
  queueLimit: 0
});


// 🌟 2. 서버가 켜질 때 연결이 잘 되는지 한 번 찔러보는 테스트!
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ AWS RDS Pool 연결 실패! (DB가 죽어있소!):', err);
    return;
  }
  console.log('✅ AWS RDS Pool 연결 성공! (이제 서버가 절대 뻗지 않소!)');
  connection.release(); // 테스트 끝났으니 연결을 다시 Pool에 반납!
});

// 🌟 3. 컨트롤러를 완벽하게 속이는 위장술!
// 기존 컨트롤러들은 자기가 쓰던 게 connection인 줄 알겠지만, 
// 사실은 pool.query()가 작동하여 알아서 연결을 맺고 끊어주오!
module.exports = pool;