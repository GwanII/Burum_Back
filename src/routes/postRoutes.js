const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { verifyToken } = require('../middlewares/authMiddleware');

// 조회 관련
router.get('/trending', postController.getTrendingTags);
router.get('/', postController.getAllPosts);
router.get('/profile', verifyToken, postController.getUserProfile);

//다은 작업
router.get('/:id', postController.getPostDetail);
router.get('/:postId/applicants', postController.getApplicants);

// 🌟 지원 및 지원 취소
// (postController에 정의된 applyForErrand와 cancelErrand를 호출)
router.post('/applyErrand', verifyToken, postController.applyForErrand);
router.post('/cancelErrand', verifyToken, postController.cancelErrand);

module.exports = router;