// routes/subjects.js
const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');
const { authenticate, authorize, checkPermission } = require('../middleware/auth');

// Public/Staff GET routes
router.get('/', authenticate, subjectController.list);
router.get('/:id', authenticate, subjectController.getById);

// Admin/Staff management routes (protected by role or permissions)
router.post('/', authenticate, authorize('admin', 'teacher'), subjectController.create);
router.put('/:id', authenticate, authorize('admin', 'teacher'), subjectController.update);
router.delete('/:id', authenticate, authorize('admin'), subjectController.remove);

module.exports = router;

