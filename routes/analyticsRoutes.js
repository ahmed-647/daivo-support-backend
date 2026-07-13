// routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const { getSummary, getTopQuestions, getPeakHours } = require('../controllers/analyticsController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Analytics sirf admin/manager dekh sakein (agent ko nahi chahiye)
router.get('/summary', protect, authorizeRoles('admin', 'manager'), getSummary);
router.get('/top-questions', protect, authorizeRoles('admin', 'manager'), getTopQuestions);
router.get('/peak-hours', protect, authorizeRoles('admin', 'manager'), getPeakHours);

module.exports = router;