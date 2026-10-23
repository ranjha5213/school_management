const express = require('express');
const c = require('../controllers/examController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Exam types
router.get('/types', authorize('admin', 'teacher'), c.listTypes);
router.post('/types', authorize('admin'), c.createType);

// Exams
router.get('/', authorize('admin', 'teacher', 'accountant'), c.listExams);
router.post('/', authorize('admin', 'teacher'), c.createExam);
router.get('/:id', authorize('admin', 'teacher', 'accountant'), c.getExam);
router.patch('/:id', authorize('admin', 'teacher'), c.updateExam);
router.delete('/:id', authorize('admin'), c.deleteExam);

// Marks
router.post('/marks', authorize('admin', 'teacher'), c.saveMarks);
router.delete('/marks/:markId', authorize('admin', 'teacher'), c.deleteMark);
router.get('/student/:studentId', authorize('admin', 'teacher', 'student', 'parent'), c.getStudentMarks);

module.exports = router;
