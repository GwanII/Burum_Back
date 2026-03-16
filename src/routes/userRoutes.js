const express = require("express");
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const userController = require('../controllers/userController');

router.post('/login', userController.login);

router.post('/signup', userController.signup);

router.post('/logout', verifyToken, userController.logout);

router.post('/refresh', userController.refreshToken);

router.patch('/location', verifyToken, userController.updateLocation);

router.post('/google-login', userController.googleLogin);

router.post('/reset-password', userController.resetPassword);

module.exports = router;