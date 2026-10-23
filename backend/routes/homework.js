const express = require('express');
const c = require('../controllers/homeworkController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Read
router.get('/', c.listHomework);
router.get('/:id', c.getHomework);

// Write (admin + teacher)
router.post('/', authorize('admin', 'teacher'), c.createHomework);
router.patch('/:id', authorize('admin', 'teacher'), c.updateHomework);
router.delete('/:id', authorize('admin', 'teacher'), c.deleteHomework);

// Submissions
router.post('/:id/submit', authorize('student', 'admin', 'teacher'), c.submitHomework);
router.post('/:id/grade', authorize('admin', 'teacher'), c.gradeSubmission);

module.exports = router;
