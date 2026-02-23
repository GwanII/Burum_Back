// backend/routes/postRoutes.js
const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');

// GET http://localhost:3000/api/posts/
router.get('/trending', postController.getTrendingTags);
router.get('/', postController.getAllPosts);

module.exports = router;