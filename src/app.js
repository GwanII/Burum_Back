const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./database');
const path = require('path');
const http = require('http');

const userRouter = require("./routes/userRoutes");
const postRouter = require("./routes/postRoutes");
const chatRouter = require("./routes/chatRoutes");
const errandRouter = require("./routes/errandRoutes");
const calendarRouter = require("./routes/calendarRoutes");
const { initSocket } = require('./socket');

// 환경변수(.env) 로딩
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// http server 생성
const server = http.createServer(app);

// socket.io 연결
initSocket(server);

console.log('📷 이미지 폴더 실제 경로:', path.join(__dirname, 'uploads'));

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// uploads 정적 공개
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/users', userRouter);
app.use('/api/posts', postRouter);
app.use('/api/chat', chatRouter);
app.use('/api/createErrand', errandRouter);
app.use('/api/calendar', calendarRouter);

// 기본 접속 테스트
app.get('/', (req, res) => {
  res.send('🚧 BURUM(JS버전) 서버 정상 가동 중! 🚧');
});

/*
// 서버 시작
server.listen(PORT, () => {
  console.log(`
  🚀 Server listening on port: ${PORT}
  🚀 http://localhost:${PORT}
  `);
});
*/


//--성빈: 외부(스마트폰)의 접속을 10000% 허락하는 위대한 개방 마법
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 위대한 서버가 포트 ${PORT} 에서 깨어났소!!!!!
  🚀 외부 기기(스마트폰) 접속 대문 완벽 개방 완료!!!!! (0.0.0.0)
  `);
});