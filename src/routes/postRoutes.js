// backend/routes/postRoutes.js
const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');

const { verifyToken } = require('../middlewares/authMiddleware'); // 옮길거

// GET http://localhost:3000/api/posts/
router.get('/trending', postController.getTrendingTags);
router.get('/', postController.getAllPosts);

router.get('/profile', verifyToken, postController.getUserProfile); // 옮길거 

module.exports = router;