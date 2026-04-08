const express = require('express');
const router = express.Router();
const errandController = require('../controllers/errandController');
const recommendController = require('../controllers/recommendController');
const multer = require('multer');

const { verifyToken } = require('../middlewares/authMiddleware');

const upload = multer({dest: 'upload/' });

router.post('/', verifyToken, upload.array('images', 10), errandController.createErrand);
router.post('/recommend-price', verifyToken, recommendController.recommendPrice);
router.put('/:postId/assign', verifyToken, errandController.assignErrand);
router.put('/:postId/cancelAssign', verifyToken, errandController.cancelAssignErrand);

// router.get('/', errandController.getErrands);

module.exports = router;