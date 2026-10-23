const express = require('express');
const c = require('../controllers/attendanceController');
const { authenticate, authorize, attachStudentId } = require('../middleware/auth');
const { validateAttendance, validateRemarksUpdate } = require('../middleware/validators');
const { requireStudentAccess } = require('../utils/policies');

const router = express.Router();
router.use(authenticate);

router.post('/', authorize('admin', 'teacher'), validateAttendance, c.markAttendance);
router.post('/bulk', authorize('admin', 'teacher'), c.bulkMarkAttendance);
router.patch('/remarks', authorize('admin', 'teacher'), validateRemarksUpdate, c.updateRemarks);
router.patch('/', authorize('admin', 'teacher'), c.updateAttendance);
router.get('/date', authorize('admin', 'teacher'), c.getAttendanceByDate);
router.get('/student/:studentId', requireStudentAccess('studentId'), c.getStudentAttendance);
router.get('/summary/:studentId', requireStudentAccess('studentId'), c.getStudentSummary);
router.get('/class-summary', authorize('admin', 'teacher'), c.getClassSummary);

// ─── Student self-service ───
router.get('/me',
  authorize('student'), attachStudentId, c.getMyAttendance);
router.get('/me/summary',
  authorize('student'), attachStudentId, c.getMySummary);

// ─── Admin override ───
router.post('/unlock', authorize('admin'), c.unlockSectionDate);

module.exports = router;
