const express = require('express');
const c = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { avatarUpload } = require('../middleware/upload');

const router = express.Router();
router.use(authenticate);

router.post('/avatar', avatarUpload, c.uploadAvatar);
router.delete('/avatar', c.removeAvatar);

module.exports = router;
