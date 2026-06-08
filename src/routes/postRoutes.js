const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { verifyToken } = require('../middlewares/authMiddleware');
const multer = require('multer');
const path = require('path');

// 📦 멀터(Multer) 이미지 저장 설정 (수정 시 이미지 처리용)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// 조회 관련
router.get('/trending', postController.getTrendingTags);
router.get('/', postController.getAllPosts);
router.get('/profile', verifyToken, postController.getUserProfile);

//다은 작업
router.get('/:id', postController.getPostDetail);
router.get('/:postId/applicants', postController.getApplicants);

// 기현 작업
router.put('/:id', verifyToken, upload.array('images', 10), postController.updatePost); // 게시물 수정
router.post('/:id/view', postController.increaseViewCount); // 조회수 증가

// 🌟 지원 및 지원 취소
// (postController에 정의된 applyForErrand와 cancelErrand를 호출)
router.post('/applyErrand', verifyToken, postController.applyForErrand);
router.post('/cancelErrand', verifyToken, postController.cancelErrand);

router.post('/price', verifyToken, postController.recommendPrice);

module.exports = router;