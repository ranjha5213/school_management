const express = require('express');
const c = require('../controllers/settingsController'); 
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Public — no auth needed
router.get('/public', c.getPublicSettings);

// Fetch a specific setting by key (e.g., /settings/default_periods)
router.get('/:key', c.getSetting);

// Save / Update a setting
router.post('/', authenticate, authorize('admin'), c.saveSetting);

// Admin Settings
router.get('/', authenticate, authorize('admin'), c.getAllSettings);
router.patch('/', authenticate, authorize('admin'), c.updateSetting);

module.exports = router;

