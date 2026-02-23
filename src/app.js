const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./database');
const path = require('path');
const userRouter = require("./routes/userRoutes");
const postRouter = require("./routes/postRoutes");
const chatRouter = require("./routes/chatRoutes");

// 환경변수(.env) 로딩
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log('📷 이미지 폴더 실제 경로:', path.join(__dirname, '../uploads'));

// 미들웨어 설정
app.use(cors()); // 모든 도메인 요청 허용 (플러터 앱 연동 필수)
app.use(express.json()); // JSON 데이터 해석
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/users', userRouter);
app.use('/api/posts', postRouter);
app.use('/api/chat', chatRouter);


// 기본 접속 테스트
app.get('/', (req, res) => {
  res.send('🚧 BURUM(JS버전) 서버 정상 가동 중! 🚧');
});

// 서버 시작
app.listen(PORT, () => {
  console.log(
  `
  🚀  Server listening on port: ${PORT}
  🚀  http://localhost:${PORT}
  `);
});