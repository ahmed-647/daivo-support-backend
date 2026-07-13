// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { register, login, getAllUsers, updateRole } = require('../controllers/authController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Public Routes
router.post('/register', register);
router.post('/login', login);

// Admin Only Routes (Protected)
router.get('/users', protect, authorizeRoles('admin'), getAllUsers);
router.patch('/users/:id/role', protect, authorizeRoles('admin'), updateRole);

module.exports = router;