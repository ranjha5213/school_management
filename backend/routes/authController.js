const UserModel = require('../models/userModel');
const RefreshTokenModel = require('../models/refreshTokenModel');
const StudentModel = require('../models/studentModel');
const TeacherModel = require('../models/teacherModel');
const PasswordResetModel = require('../models/passwordResetModel');
const { hash, compare } = require('../utils/password');
const { sign, signRefresh } = require('../utils/jwt');
const { apiResponse } = require('../utils/helpers');
const otp = require('../utils/otp');
const emailService = require('../utils/emailService');
const logger = require('../utils/logger');

const OTP_EXPIRES_MIN = 10;
const OTP_MAX_ATTEMPTS = 3;
const OTP_RESEND_COOLDOWN_SEC = 60;

// ─── Register (Step 1: create unverified + send OTP) ───
const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'student' } = req.body;
    if (!['student', 'parent'].includes(role))
      return apiResponse(res, 400, false, 'Role must be student or parent');

    const existing = await UserModel.findByEmail(email);

    // Case A: email already exists and verified/pending → reject
    if (existing && existing.status !== 'unverified') {
      return apiResponse(res, 409, false, 'Email already registered');
    }

    // Case B: exists but unverified → allow re-register (refresh OTP + data)
    let user_id;
    if (existing) {
      const password_hash = await hash(password);
      await UserModel.update(existing.id, { name, password_hash, role });
      user_id = existing.id;
    } else {
      const password_hash = await hash(password);
      const { lastID } = await UserModel.create({
        name, email, password_hash, role, status: 'unverified',
      });
      user_id = lastID;

      if (role === 'student') {
        const admission_number = `ADM${String(user_id).padStart(5, '0')}`;
        await StudentModel.create({ user_id, admission_number });
      }
    }

    // Clear old OTPs and issue new one
    await PasswordResetModel.clearExisting(email, 'register');
    const code = otp.generate();
    const otp_hash = await otp.hash(code);
    const expires_at = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await PasswordResetModel.create({
      email, otp_hash, expires_at, purpose: 'register',
    });
    await PasswordResetModel.cleanup();

    const result = await emailService.sendRegistrationOtp(email, name, code);
    const devHint = result?.dev ? ' (dev: check backend log)' : '';
    logger.audit(`New registration OTP sent to ${email}${devHint}`);

    return apiResponse(res, 201, true,
      `We sent a 6-digit code to ${email}. Enter it to verify your email.${devHint}`,
      { email, requires_otp: true });
  } catch (e) { next(e); }
};

// ─── Verify registration OTP (Step 2: mark pending) ───
const verifyRegisterOtp = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return apiResponse(res, 400, false, 'Email and code required');

    const user = await UserModel.findByEmail(email);
    if (!user) return apiResponse(res, 404, false, 'Registration not found');
    if (user.status === 'active') return apiResponse(res, 400, false, 'Already verified');
    if (user.status === 'pending')
      return apiResponse(res, 400, false, 'Already verified — waiting for admin approval');
    if (user.status === 'rejected')
      return apiResponse(res, 403, false, 'Your registration was rejected. Contact admin.');

    const rec = await PasswordResetModel.findLatestActive(email, 'register');
    if (!rec) return apiResponse(res, 400, false, 'Code expired or not found. Request a new one.');

    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      await PasswordResetModel.markUsed(rec.id);
      return apiResponse(res, 429, false, 'Too many attempts. Please register again.');
    }

    const ok = await otp.verify(code, rec.otp_hash);
    if (!ok) {
      await PasswordResetModel.incrementAttempts(rec.id);
      const remaining = OTP_MAX_ATTEMPTS - (rec.attempts + 1);
      return apiResponse(res, 400, false,
        `Invalid code. ${remaining} attempt(s) left.`);
    }

    await PasswordResetModel.markUsed(rec.id);
    await UserModel.setStatus(user.id, 'pending');

    // Notify admin (best-effort)
    try {
      await emailService.sendAdminNewUserAlert({
        name: user.name, email: user.email, role: user.role,
      });
    } catch {}

    logger.audit(`Email verified: ${email} (now pending admin approval)`);

    return apiResponse(res, 200, true,
      'Email verified! Your account is now pending admin approval.',
      { email, next: 'wait_for_approval' });
  } catch (e) { next(e); }
};

// ─── Resend registration OTP ───
const resendRegisterOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await UserModel.findByEmail(email);
    if (!user) return apiResponse(res, 404, false, 'Registration not found');
    if (user.status !== 'unverified')
      return apiResponse(res, 400, false, 'Already verified');

    // Rate limit
    const last = await PasswordResetModel.findLatestActive(email, 'register');
    if (last) {
      const ageSec = Math.floor((Date.now() - new Date(last.created_at + 'Z').getTime()) / 1000);
      if (ageSec < OTP_RESEND_COOLDOWN_SEC) {
        const wait = OTP_RESEND_COOLDOWN_SEC - ageSec;
        return apiResponse(res, 429, false, `Please wait ${wait}s before requesting another code`);
      }
    }

    await PasswordResetModel.clearExisting(email, 'register');
    const code = otp.generate();
    const otp_hash = await otp.hash(code);
    const expires_at = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await PasswordResetModel.create({ email, otp_hash, expires_at, purpose: 'register' });
    const result = await emailService.sendRegistrationOtp(email, user.name, code);
    const devHint = result?.dev ? ' (dev: check backend log)' : '';

    return apiResponse(res, 200, true,
      `New code sent to ${email}.${devHint}`);
  } catch (e) { next(e); }
};

// ─── Login (block if unverified) ───
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await UserModel.findByEmail(email);
    if (!user) return apiResponse(res, 401, false, 'Invalid credentials');

    if (user.status === 'unverified')
      return apiResponse(res, 403, false,
        'Please verify your email first. Check your inbox for the code.',
        { status: 'unverified', email: user.email });
    if (user.status === 'pending')
      return apiResponse(res, 403, false,
        'Your email is verified. Waiting for admin approval.');
    if (user.status === 'rejected')
      return apiResponse(res, 403, false,
        'Your registration was rejected. Contact administration.');

    const ok = await compare(password, user.password_hash);
    if (!ok) return apiResponse(res, 401, false, 'Invalid credentials');

    const token = sign({ id: user.id, role: user.role, name: user.name });
    const refresh = signRefresh({ id: user.id });
    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await RefreshTokenModel.create(user.id, refresh, expires);

    return apiResponse(res, 200, true, 'Login successful', {
      token, refresh,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e) { next(e); }
};

// ─── Me ───
const me = async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) return apiResponse(res, 404, false, 'User not found');
    const body = {
      id: user.id, name: user.name, email: user.email,
      role: user.role, status: user.status,
    };
    if (user.role === 'student') {
      const s = await StudentModel.findByUserId(user.id);
      if (s) body.student_id = s.id;
    } else if (user.role === 'teacher') {
      const t = await TeacherModel.findByUserId(user.id);
      if (t) body.teacher_id = t.id;
    }
    return apiResponse(res, 200, true, 'Me', body);
  } catch (e) { next(e); }
};

// ─── Refresh / Logout ───
const refresh = async (req, res, next) => {
  try {
    const { refresh: token } = req.body;
    const rec = await RefreshTokenModel.findValid(token);
    if (!rec) return apiResponse(res, 401, false, 'Invalid refresh token');
    const newToken = sign({ id: rec.user_id });
    return apiResponse(res, 200, true, 'Refreshed', { token: newToken });
  } catch (e) { next(e); }
};

const logout = async (req, res, next) => {
  try {
    const { refresh: token } = req.body;
    if (token) await RefreshTokenModel.revoke(token);
    return apiResponse(res, 200, true, 'Logged out');
  } catch (e) { next(e); }
};

// ─── Change password (authenticated) ───
const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await UserModel.findByIdWithHash(req.user.id);
    if (!user) return apiResponse(res, 404, false, 'User not found');

    const ok = await compare(oldPassword, user.password_hash);
    if (!ok) return apiResponse(res, 401, false, 'Current password is incorrect');

    const password_hash = await hash(newPassword);
    await UserModel.setPassword(user.id, password_hash);
    logger.audit(`Password changed: ${user.email}`);
    return apiResponse(res, 200, true, 'Password changed successfully');
  } catch (e) { next(e); }
};

// ─── Forgot-password OTP (unchanged) ───
const sendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await UserModel.findByEmail(email);
    if (!user)
      return apiResponse(res, 200, true, 'If this email exists, an OTP has been sent');

    const last = await PasswordResetModel.findLatestActive(email, 'password_reset');
    if (last) {
      const ageSec = Math.floor((Date.now() - new Date(last.created_at + 'Z').getTime()) / 1000);
      if (ageSec < OTP_RESEND_COOLDOWN_SEC) {
        const wait = OTP_RESEND_COOLDOWN_SEC - ageSec;
        return apiResponse(res, 429, false, `Please wait ${wait}s before requesting another code`);
      }
    }

    await PasswordResetModel.clearExisting(email, 'password_reset');
    const code = otp.generate();
    const otp_hash = await otp.hash(code);
    const expires_at = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await PasswordResetModel.create({
      email, otp_hash, expires_at, purpose: 'password_reset',
    });
    await PasswordResetModel.cleanup();

    const result = await emailService.sendOtp(email, code);
    const devHint = result?.dev ? ' (dev: check backend log)' : '';
    return apiResponse(res, 200, true,
      `OTP sent to your email. Expires in ${OTP_EXPIRES_MIN} minutes.${devHint}`);
  } catch (e) { next(e); }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const rec = await PasswordResetModel.findLatestActive(email, 'password_reset');
    if (!rec) return apiResponse(res, 400, false, 'OTP expired or not found');

    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      await PasswordResetModel.markUsed(rec.id);
      return apiResponse(res, 429, false, 'Too many attempts. Request a new code.');
    }
    const ok = await otp.verify(code, rec.otp_hash);
    if (!ok) {
      await PasswordResetModel.incrementAttempts(rec.id);
      const remaining = OTP_MAX_ATTEMPTS - (rec.attempts + 1);
      return apiResponse(res, 400, false, `Invalid code. ${remaining} attempt(s) left.`);
    }
    const reset_token = otp.generateResetToken();
    await PasswordResetModel.setResetToken(rec.id, reset_token);
    return apiResponse(res, 200, true, 'OTP verified', { reset_token });
  } catch (e) { next(e); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { reset_token, newPassword } = req.body;
    const rec = await PasswordResetModel.findByResetToken(reset_token);
    if (!rec) return apiResponse(res, 400, false, 'Invalid or expired reset token');
    const user = await UserModel.findByEmail(rec.email);
    if (!user) return apiResponse(res, 404, false, 'User not found');
    const password_hash = await hash(newPassword);
    await UserModel.setPassword(user.id, password_hash);
    await PasswordResetModel.markUsed(rec.id);
    return apiResponse(res, 200, true, 'Password reset. You can now sign in.');
  } catch (e) { next(e); }
};

// ─── Admin: pending list / approve / reject ───
const listPending = async (_req, res, next) => {
  try {
    return apiResponse(res, 200, true, 'Pending users', await UserModel.listPending());
  } catch (e) { next(e); }
};

const approveUser = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const user = await UserModel.findById(id);
    if (!user) return apiResponse(res, 404, false, 'User not found');
    if (user.status === 'active') return apiResponse(res, 400, false, 'Already active');
    await UserModel.setStatus(id, 'active', req.user.id);
    await emailService.sendApprovalEmail(user.email, user.name);
    logger.audit(`User approved: ${user.email} by ${req.user.name}`);
    return apiResponse(res, 200, true, 'User approved');
  } catch (e) { next(e); }
};

const rejectUser = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body;
    const user = await UserModel.findById(id);
    if (!user) return apiResponse(res, 404, false, 'User not found');
    await UserModel.setStatus(id, 'rejected', req.user.id, reason || null);
    await emailService.sendRejectionEmail(user.email, user.name, reason);
    logger.audit(`User rejected: ${user.email} by ${req.user.name}`);
    return apiResponse(res, 200, true, 'User rejected');
  } catch (e) { next(e); }
};

module.exports = {
  register, verifyRegisterOtp, resendRegisterOtp,
  login, me, refresh, logout, changePassword,
  sendOtp, verifyOtp, resetPassword,
  listPending, approveUser, rejectUser,
};
