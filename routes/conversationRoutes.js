// routes/conversationRoutes.js
const express = require('express');
const router = express.Router();
const { getConversations, exportConversations } = require('../controllers/conversationController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.get('/', protect, getConversations); // sab roles dekh sakte hain
router.get('/export', protect, authorizeRoles('admin', 'manager'), exportConversations);

module.exports = router;