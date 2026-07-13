// routes/kbRoutes.js
const express = require('express');
const router = express.Router();
const upload = require('../utils/s3Upload');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const {
    uploadDocument,
    getAllDocuments,
    deleteDocument,
    trainDocuments,
    searchKnowledgeBase
} = require('../controllers/kbController');

// Admin & Manager upload kar sakte hain
router.post('/upload', protect, authorizeRoles('admin', 'manager'), upload.single('file'), uploadDocument);

// Sabhi logged-in users list dekh sakte hain
router.get('/', protect, getAllDocuments);

// Semantic search — sabhi logged-in roles use kar sakte hain (agent bhi test kar sake)
router.get('/search', protect, searchKnowledgeBase);

// Sirf Admin delete kar sake
router.delete('/:id', protect, authorizeRoles('admin'), deleteDocument);

// Sirf Admin training trigger kar sake
router.post('/train', protect, authorizeRoles('admin'), trainDocuments);

module.exports = router;