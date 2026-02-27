const express = require('express');
const router = express.Router();

const errandController = require('../controllers/errandController');

router.post('/', errandController.createErrand);

// router.get('/', errandController.getErrands);

module.exports = router;