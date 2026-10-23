const express = require('express');
const c = require('../controllers/searchController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', c.search);

module.exports = router;
