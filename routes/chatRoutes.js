// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const { handleChat } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

// Protected route — sirf logged-in users (agent/manager/admin) chat access kar sakein
router.post('/', protect, handleChat);

module.exports = router;