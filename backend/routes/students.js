const express = require('express');
const c = require('../controllers/studentController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateStudent, validateId } = require('../middleware/validators');
const { requireStudentAccess } = require('../utils/policies');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize('admin', 'teacher'), c.listStudents);
router.post('/', authorize('admin'), validateStudent, c.createStudent);
router.get('/:studentId/overview', authorize('admin', 'teacher'), c.getStudentOverview);
router.get('/:studentId/attendance', requireStudentAccess('studentId'), c.getStudentAttendance);
router.patch('/:studentId', authorize('admin'), c.updateStudent);
router.delete('/:studentId', authorize('admin'), validateId, c.deleteStudent);

module.exports = router;
