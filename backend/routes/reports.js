const express = require('express');
const c = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard', c.dashboard);
router.get('/attendance', authorize('admin', 'teacher'), c.attendanceReport);
router.get('/student/:studentId/report-card.pdf', authorize('admin', 'teacher', 'parent', 'student'), c.downloadReportCardPdf);
router.get('/student/:studentId/report-card',
  authorize('admin', 'teacher', 'parent', 'student'),
  c.studentReportCard);

module.exports = router;
