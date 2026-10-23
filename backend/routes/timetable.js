const express = require('express');
const c = require('../controllers/timetableController');
const approvals = require('../controllers/approvalController');
const { authenticate, authorize, attachStudentId } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ─── Approvals (must come before /:id) ───
router.get('/approvals/queue',
  authorize('admin'),
  (req, res, next) => { req.query.resource_type = 'timetable'; next(); },
  approvals.listQueue);
router.get('/approvals/my',
  authorize('admin', 'teacher'),
  approvals.myRequests);
router.post('/approvals/:id/approve', authorize('admin'), approvals.approve);
router.post('/approvals/:id/reject',  authorize('admin'), approvals.reject);
router.get('/approvals/pending-count', authorize('admin'), approvals.pendingCount);

// ─── Reads ───
router.get('/',
  authorize('admin', 'teacher', 'accountant', 'student'),
  attachStudentId, c.listTimetable);
router.get('/section/:sectionId',
  authorize('admin', 'teacher', 'accountant', 'student'),
  attachStudentId, c.weeklyGrid);
router.get('/:id',
  authorize('admin', 'teacher', 'accountant'),
  c.getSlot);

// ─── Writes (admin applies directly; teacher submits for approval) ───
router.post('/',      authorize('admin', 'teacher'), c.createSlot);
router.patch('/:id',  authorize('admin', 'teacher'), c.updateSlot);
router.delete('/:id', authorize('admin', 'teacher'), c.deleteSlot);

module.exports = router;
