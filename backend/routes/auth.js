const express = require('express');
const c = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');
const {
  validateRegister, validateLogin, validateChangePassword,
  validateSendOtp, validateVerifyOtp, validateResetPassword,
  validateVerifyRegisterOtp,
} = require('../middleware/validators');

const router = express.Router();

// Public
router.post('/register', validateRegister, c.register);
router.post('/verify-register-otp', validateVerifyRegisterOtp, c.verifyRegisterOtp);
router.post('/resend-register-otp', validateSendOtp, c.resendRegisterOtp);
router.post('/login', validateLogin, c.login);
router.post('/send-otp', validateSendOtp, c.sendOtp);
router.post('/verify-otp', validateVerifyOtp, c.verifyOtp);
router.post('/reset-password', validateResetPassword, c.resetPassword);
router.post('/refresh', c.refresh);
router.post('/logout', c.logout);

// Authenticated
router.get('/me', authenticate, c.me);
router.patch('/change-password', authenticate, validateChangePassword, c.changePassword);

// Admin
router.get('/pending', authenticate, authorize('admin'), c.listPending);
router.post('/approve/:id', authenticate, authorize('admin'), c.approveUser);
router.post('/reject/:id', authenticate, authorize('admin'), c.rejectUser);

module.exports = router;
