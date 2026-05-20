const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const errandController = require('../controllers/errandController'); 

// =====================================================
// 🌟 용사님께서 직접 발굴하신 전설의 문지기 정령 소환!
// =====================================================
const { verifyToken } = require('../middlewares/authMiddleware');

// =====================================================
// 📦 멀터(Multer) 이미지 저장 설정
// =====================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } 
});

// =====================================================
// 🛣️ 라우트 정의 (verifyToken 문지기가 철통 방어합니다!)
// =====================================================

// 🚀 1. 게시글 생성 (토큰 검증 -> 이미지 10장 업로드 -> 컨트롤러 실행)
router.post('/', verifyToken, upload.array('images', 10), errandController.createErrand);

// 🤝 2. 지원자 선택
router.post('/:postId/assign', verifyToken, errandController.assignErrand);

// ❌ 3. 선택 취소
router.post('/:postId/cancelAssign', verifyToken, errandController.cancelAssignErrand);

// 🎉 4. 심부름 완료 처리
router.post('/:postId/complete', verifyToken, errandController.completeErrand);
router.put('/:postId/read-applicants', verifyToken, errandController.markApplicantsAsRead);
router.put('/:postId/read-assigned', verifyToken, errandController.markAssignedNoticeAsRead);

module.exports = router;