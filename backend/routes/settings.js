// routes/settings.js
const express = require('express');
const c = require('../controllers/settingsController'); // 👈 Import the controller
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Public — no auth needed so the login page can show it too
router.get('/public', c.getPublicSettings);

// Admin Settings
router.get('/', authenticate, authorize('admin'), c.getAllSettings);
router.patch('/', authenticate, authorize('admin'), c.updateSetting);

module.exports = router;
