const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');

// 🌟 아까 우리가 완벽하게 고친 그 수문장을 데려오오! (경로 주의!)
const { verifyToken } = require('../middlewares/authMiddleware'); 

// 🚀 일정 생성 대포 길목! (반드시 수문장을 먼저 거치게 하시오!)
router.post('/', verifyToken, calendarController.createCalendarEvent);

// 🚀 나중에 달력에 일정을 쫙 뿌려줄 조회 길목!
router.get('/', verifyToken, calendarController.getCalendarEvents);

module.exports = router;