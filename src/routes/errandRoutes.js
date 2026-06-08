const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const errandController = require('../controllers/errandController'); 
const axios = require('axios'); // ai 

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

router.post('/predict-price', async (req, res) => {
    try {
        // 1. Flutter 용사님이 보낸 의뢰 내용 받기
        const { title, content, hashtags, location } = req.body;

        // 2. 8000번 포트에서 깨어난 파이썬 AI에게 예측을 부탁함
        // Node.js 서버와 Python 서버는 같은 컴퓨터(localhost)에 있으므로 127.0.0.1 사용
        const aiResponse = await axios.post('http://127.0.0.1:8000/predict', {
            title: title || "",
            content: content || "",
            hashtags: hashtags || "",
            location: location || ""
        });

        // 3. AI가 응답한 가격을 꺼냄
        const predictedPrice = aiResponse.data.predicted_price;

        // 4. Flutter로 성공적인 결과 전송
        return res.status(200).json({
            success: true,
            message: "AI 가격 책정 완료!",
            recommended_price: predictedPrice
        });

    } catch (error) {
        console.error("🔥 AI 서버 통신 에러:", error.message);
        return res.status(500).json({ 
            success: false, 
            message: "AI 서버가 응답하지 않소! (파이썬 서버 켜져 있는지 확인)" 
        });
    }
});

module.exports = router;