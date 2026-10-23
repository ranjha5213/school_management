const express = require('express');
const c = require('../controllers/auditController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize('admin'), c.listLogs);

module.exports = router;
