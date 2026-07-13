// routes/conversationRoutes.js
const express = require('express');
const router = express.Router();
const {
    getConversations,
    exportConversations,
    assignAgentToChat
} = require('../controllers/conversationController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.get('/', protect, getConversations); // all roles can view
router.get('/export', protect, authorizeRoles('admin', 'manager'), exportConversations);
router.post('/assign-agent', protect, authorizeRoles('admin', 'manager', 'agent'), assignAgentToChat);

module.exports = router;