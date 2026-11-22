const express = require('express');
const c = require('../controllers/studentController');
const { authenticate, authorize, checkPermission } = require('../middleware/auth');
const { validateStudent, validateParamId } = require('../middleware/validators');
const { requireStudentAccess } = require('../utils/policies');

const router = express.Router();
router.use(authenticate);

/* ─────────── List & create ─────────── */
router.get('/',
  authorize('admin', 'teacher'),
  checkPermission('view_student'),
  c.listStudents);

router.post('/',
  authorize('admin', 'teacher'),
  checkPermission('add_student'),
  validateStudent,
  c.createStudent);

/* ─────────── Read (overview & attendance) ─────────── */
router.get('/:studentId/overview',
  authorize('admin', 'teacher'),
  c.getStudentOverview);

router.get('/:studentId/attendance',
  authorize('admin', 'teacher'),
  requireStudentAccess('studentId'),
  c.getStudentAttendance);

/* ─────────── Update ─────────── */
router.patch('/:studentId',
  authorize('admin', 'teacher'),
  checkPermission('edit_student'),
  c.updateStudent);

/* ─────────── Suspend & readmit ─────────── */
router.patch('/:studentId/suspend',
  authorize('admin', 'teacher'),
  checkPermission('edit_student'),
  c.suspendStudent);

router.patch('/:studentId/readmit',
  authorize('admin', 'teacher'),
  checkPermission('edit_student'),
  c.readmitStudent);

/* ─────────── Delete ─────────── */
router.delete('/:studentId',
  authorize('admin', 'teacher'),
  checkPermission('delete_student'),
  validateParamId('studentId'),
  c.deleteStudent);

module.exports = router;
