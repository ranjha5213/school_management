const express = require('express');
const { apiResponse } = require('../utils/helpers');

const router = express.Router();

// Public — no auth needed so the login page can show it too
router.get('/public', (_req, res) => {
  return apiResponse(res, 200, true, 'Public settings', {
    school_name: process.env.SCHOOL_NAME || 'School Management',
    school_address: process.env.SCHOOL_ADDRESS || '',
    school_phone: process.env.SCHOOL_PHONE || '',
    school_email: process.env.SCHOOL_EMAIL || '',
    school_logo_url: process.env.SCHOOL_LOGO_URL || null,
  });
});

module.exports = router;
