const express = require('express');
const router = express.Router();
const errandController = require('../controllers/errandController');
const multer = require('multer');
const recommendController = require('../controllers/recommendController');

const { verifyToken } = require('../middlewares/authMiddleware');

const upload = multer({dest: 'upload/' });

router.post('/', verifyToken, upload.array('images', 10), errandController.createErrand);

// router.get('/', errandController.getErrands);
router.post('/recommend-price', verifyToken, recommendController.recommendPrice);
router.put('/:postId/assign', verifyToken, errandController.assignErrand);
router.put('/:postId/cancelAssign', verifyToken, errandController.cancelAssignErrand);
router.put('/:postId/complete', verifyToken, errandController.completeErrand);

module.exports = router;
module.exports = router;