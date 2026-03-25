// backend/routes/postRoutes.js
const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');

const { verifyToken } = require('../middlewares/authMiddleware'); // 옮길거

// GET http://localhost:3000/api/posts/
router.get('/trending', postController.getTrendingTags);
router.get('/', postController.getAllPosts);

router.get('/profile', verifyToken, postController.getUserProfile); // 옮길거 

// 다은 작업, 채팅방-게시물 연동에 필요
router.get('/:id', postController.getPostDetail);

router.post('/applyErrand', postController.applyForErrand);

module.exports = router;