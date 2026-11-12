const express = require('express');
const c = require('../controllers/studentController');
const { authenticate, authorize, checkPermission } = require('../middleware/auth');
const { validateStudent, validateId } = require('../middleware/validators');
const { requireStudentAccess } = require('../utils/policies');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize('admin', 'teacher'),checkPermission('view_student'), c.listStudents);

// 👇 Updated: Admins bypass, Teachers need 'add_student' permission
router.post('/', 
  authorize('admin', 'teacher'), 
  checkPermission('add_student'), 
  validateStudent, 
  c.createStudent
);

router.get('/:studentId/overview', authorize('admin', 'teacher'), c.getStudentOverview);
router.get('/:studentId/attendance', requireStudentAccess('studentId'), c.getStudentAttendance);

// 👇 Updated: Admins bypass, Teachers need 'edit_student' permission
router.patch('/:studentId', 
  authorize('admin', 'teacher'), 
  checkPermission('edit_student'), 
  c.updateStudent
);

// 👇 Updated: Admins bypass, Teachers need 'delete_student' permission
router.delete('/:id', 
  authorize('admin', 'teacher'), 
  checkPermission('delete_student'), 
  validateId, 
  c.deleteStudent
);

module.exports = router;
