const express = require('express');
const router = express.Router();
const errandController = require('../controllers/errandController');
const multer = require('multer');

const { verifyToken } = require('../middlewares/authMiddleware');

const upload = multer({dest: 'upload/' });

router.post('/', verifyToken, upload.array('images', 10), errandController.createErrand);

// router.get('/', errandController.getErrands);

module.exports = router;