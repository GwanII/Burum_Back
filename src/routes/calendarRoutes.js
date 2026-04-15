const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');

const { verifyToken } = require('../middlewares/authMiddleware'); 

router.post('/', verifyToken, calendarController.createCalendarEvent);
router.get('/', verifyToken, calendarController.getCalendarEvents);
router.delete('/', verifyToken, calendarController.deleteCalendarEvents);

module.exports = router;