const express = require('express');
const router = express.Router();
const errandController = require('../controllers/errandController'); // 이걸로 사용
const multer = require('multer');
const { verifyToken } = require('../middlewares/authMiddleware');

const upload = multer({ dest: 'upload/' });

// 게시글 생성
router.post('/', verifyToken, upload.array('images', 10), errandController.createErrand);

// 🌟 선택 및 선택 취소 (함수가 errandController에 있으므로 수정!)
router.put('/:postId/assign', verifyToken, errandController.assignErrand);
router.put('/:postId/cancelAssign', verifyToken, errandController.cancelAssignErrand);

module.exports = router;