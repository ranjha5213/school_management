const express = require('express');
const c = require('../controllers/parentController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/children', authorize('parent'), c.myChildren);

module.exports = router;
