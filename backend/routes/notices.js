const express = require('express');
const c = require('../controllers/noticeController');
const approvals = require('../controllers/approvalController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ─── Approvals (must come before /:id) ───
router.get('/approvals/queue',
  authorize('admin'),
  (req, res, next) => { req.query.resource_type = 'notice'; next(); },
  approvals.listQueue);
router.get('/approvals/my',
  authorize('admin', 'teacher'),
  approvals.myRequests);
router.post('/approvals/:id/approve', authorize('admin'), approvals.approve);
router.post('/approvals/:id/reject',  authorize('admin'), approvals.reject);

// ─── Personal inbox ───
router.get('/inbox', c.myInbox);
router.post('/:id/read', c.markNoticeRead);

// ─── CRUD ───
router.get('/', c.listNotices);
router.get('/:id', c.getNotice);
router.post('/',      authorize('admin', 'teacher'), c.createNotice);
router.patch('/:id',  authorize('admin', 'teacher'), c.updateNotice);
router.delete('/:id', authorize('admin'), c.deleteNotice);

module.exports = router;
