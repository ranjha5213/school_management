const express = require('express');
const c = require('../controllers/teacherController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateTeacher, validateId } = require('../middleware/validators');

const router = express.Router();
router.use(authenticate);

// Read
router.get('/', authorize('admin', 'teacher', 'accountant'), c.listTeachers);
router.get('/departments', authorize('admin', 'teacher'), c.listDepartments);
router.get('/:teacherId', authorize('admin', 'teacher', 'accountant'), c.getTeacher);
router.get('/:teacherId/overview', authorize('admin', 'teacher'), c.getTeacherOverview);

// Write (admin only)
router.post('/', authorize('admin'), validateTeacher, c.createTeacher);
router.patch('/:teacherId', authorize('admin'), c.updateTeacher);
router.delete('/:teacherId', authorize('admin'), validateId, c.deleteTeacher);

module.exports = router;
