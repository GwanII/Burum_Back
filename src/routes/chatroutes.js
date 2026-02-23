const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// 채팅방 생성
router.post('/room', chatController.createChatRoom);

// 메시지 전송
router.post('/message', chatController.sendMessage);

// 채팅방 메시지 조회
router.get('/messages/:roomId', chatController.getMessages);
// 채팅 목록 조회
router.get("/rooms/:userId", chatController.getMyChatRooms);
// 읽음 처리 
router.post("/read", chatController.markAsRead);
router.get("/unread/:userId", chatController.getUnreadCount);
module.exports = router;