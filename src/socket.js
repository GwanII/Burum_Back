let io;

function initSocket(server) {
  const { Server } = require('socket.io');

  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    },
  });

  io.on('connection', (socket) => {
    console.log('소켓 연결됨:', socket.id);

    // 유저 개인 room
    socket.on('joinUser', (userId) => {
      socket.join(`user:${userId}`);
      console.log(`user:${userId} 입장`);
    });

    // 채팅방 room
    socket.on('joinRoom', (roomId) => {
      socket.join(`room:${roomId}`);
      console.log(`room:${roomId} 입장`);
    });

    socket.on('leaveRoom', (roomId) => {
      socket.leave(`room:${roomId}`);
      console.log(`room:${roomId} 퇴장`);
    });

    socket.on('disconnect', () => {
      console.log('소켓 연결 해제:', socket.id);
    });
  });

  return io;
}

function getIo() {
  if (!io) {
    throw new Error('Socket.IO가 아직 초기화되지 않았습니다.');
  }
  return io;
}

module.exports = { initSocket, getIo };