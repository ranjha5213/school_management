#!/usr/bin/env python3
"""
Adds OTP-verified registration on top of existing approval flow.
Run from ~/school:  python scripts/generate_register_otp.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BE = ROOT / "backend"


def write(rel, content):
    p = BE / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")
    print(f"  ✓ backend/{rel}")


def banner(m):
    print(f"\n── {m} " + "─" * max(0, 60 - len(m)))


# ════════════════════════════════════════════════════════════

def gen_migration():
    banner("migration")

    write("migrations/013_register_otp.sql", r"""
-- Reuse password_resets table for registration OTPs by
-- tagging the purpose. Add a purpose column.
ALTER TABLE password_resets ADD COLUMN purpose VARCHAR(20) DEFAULT 'password_reset';

-- New status values: unverified (email not confirmed) -> pending (awaiting admin)
-- existing users already have 'active'. No data change needed.
""".strip())


def gen_model():
    banner("models")

    write("models/passwordResetModel.js", r"""
const { run, get, all } = require('../config/database');

const PasswordResetModel = {
  create: ({ email, otp_hash, expires_at, purpose = 'password_reset' }) =>
    run(
      `INSERT INTO password_resets (email, otp_hash, expires_at, purpose)
       VALUES (?, ?, ?, ?)`,
      [email, otp_hash, expires_at, purpose]
    ),

  findLatestActive: (email, purpose = 'password_reset') =>
    get(
      `SELECT * FROM password_resets
       WHERE email = ? AND purpose = ? AND used = 0 AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`,
      [email, purpose]
    ),

  findByResetToken: (token) =>
    get(
      `SELECT * FROM password_resets
       WHERE reset_token = ? AND used = 0 AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`,
      [token]
    ),

  incrementAttempts: (id) =>
    run(`UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?`, [id]),

  setResetToken: (id, token) =>
    run(`UPDATE password_resets SET reset_token = ? WHERE id = ?`, [token, id]),

  markUsed: (id) =>
    run(`UPDATE password_resets SET used = 1 WHERE id = ?`, [id]),

  // Clear old unused OTPs for the same email + purpose (fresh start)
  clearExisting: (email, purpose) =>
    run(
      `UPDATE password_resets SET used = 1
       WHERE email = ? AND purpose = ? AND used = 0`,
      [email, purpose]
    ),

  cleanup: () =>
    run(`DELETE FROM password_resets WHERE expires_at < datetime('now', '-1 day')`),
};

module.exports = PasswordResetModel;
""".strip())


def gen_controller():
    banner("authController")

    write("controllers/authController.js", r"""
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
""".strip())


def gen_email():
    banner("emailService")

    write("utils/emailService.js", r"""
const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;

const isConfigured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
      && !process.env.SMTP_PASS.startsWith('PUT_'));

const getTransporter = () => {
  if (transporter) return transporter;
  if (!isConfigured()) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
};

const send = async (to, subject, text, html) => {
  const tx = getTransporter();
  if (!tx) {
    logger.info(`[email:DEV] to=${to} subject="${subject}"\n${text}`);
    return { dev: true };
  }
  try {
    const info = await tx.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to, subject, text, html,
    });
    logger.info(`[email] sent to=${to} id=${info.messageId}`);
    return { sent: true, id: info.messageId };
  } catch (e) {
    logger.error(`[email] failed to=${to}: ${e.message}`);
    logger.info(`[email:FALLBACK] to=${to} subject="${subject}"\n${text}`);
    return { failed: true, error: e.message };
  }
};

const otpHtml = (code, title, blurb) => `
  <div style="font-family:sans-serif;max-width:420px;margin:auto">
    <h2>${title}</h2>
    <p>${blurb}</p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:6px;
                background:#f3f4f6;padding:16px;text-align:center;border-radius:8px">
      ${code}
    </div>
    <p style="color:#6b7280;font-size:13px;margin-top:16px">Expires in 10 minutes.</p>
  </div>`;

const sendRegistrationOtp = (to, name, code) =>
  send(
    to,
    'Verify your email — School MS',
    `Hi ${name},\n\nYour verification code is: ${code}\n\nExpires in 10 minutes.`,
    otpHtml(code, `Hi ${name},`, 'Use this code to verify your email:')
  );

const sendOtp = (to, code) =>
  send(
    to,
    'Password reset code',
    `Your password reset code is: ${code}\n\nExpires in 10 minutes.`,
    otpHtml(code, 'Password Reset', 'Your code is:')
  );

const sendApprovalEmail = (to, name) =>
  send(
    to,
    'Your account has been approved',
    `Hi ${name},\n\nYour account has been approved. You can now sign in.`,
    `<p>Hi ${name},</p><p>Your account has been approved. You can now sign in.</p>`
  );

const sendRejectionEmail = (to, name, reason) =>
  send(
    to,
    'Registration update',
    `Hi ${name},\n\nYour registration was not approved.${reason ? `\nReason: ${reason}` : ''}`,
    `<p>Hi ${name},</p><p>Your registration was not approved.</p>${reason ? `<p><b>Reason:</b> ${reason}</p>` : ''}`
  );

const sendAdminNewUserAlert = (user) =>
  send(
    process.env.SMTP_USER || 'admin@school.local',
    `New user awaiting approval: ${user.name}`,
    `A new ${user.role} "${user.name}" (${user.email}) verified their email and is awaiting approval.`,
    `<p>New <b>${user.role}</b>: <b>${user.name}</b> (${user.email}) has verified their email and awaits admin approval.</p>`
  );

module.exports = {
  send, sendOtp, sendRegistrationOtp,
  sendApprovalEmail, sendRejectionEmail, sendAdminNewUserAlert,
  isConfigured,
};
""".strip())


def gen_routes():
    banner("routes")

    write("routes/auth.js", r"""
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
""".strip())


def gen_validators_patch():
    banner("validators")

    # only append the new validator; existing file already has the others
    import re
    path = BE / "middleware/validators.js"
    if not path.exists():
        print("  ! validators.js missing — skipping (will be created if generator's earlier run succeeded)")
        return

    text = path.read_text()
    if "validateVerifyRegisterOtp" in text:
        print("  · validateVerifyRegisterOtp already present")
        return

    block = """
const validateVerifyRegisterOtp = [
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 }),
  handleValidation,
];
"""
    # insert before "module.exports = {"
    idx = text.find("module.exports = {")
    if idx == -1:
        print("  ! couldn't find module.exports — aborting validator patch")
        return

    new_text = text[:idx] + block + "\n" + text[idx:]

    # add to exports
    new_text = new_text.replace(
        "validateVerifyOtp, validateResetPassword,",
        "validateVerifyOtp, validateResetPassword, validateVerifyRegisterOtp,"
    )
    path.write_text(new_text)
    print("  ✓ patched backend/middleware/validators.js")


def main():
    print(f"Adding OTP-verified registration to {BE}")
    gen_migration()
    gen_model()
    gen_controller()
    gen_email()
    gen_routes()
    gen_validators_patch()
    print("\n" + "═" * 66)
    print("✅ Backend register-with-OTP generated.")
    print("═" * 66)
    print("\nNext:")
    print("  cd ~/school/backend")
    print("  sqlite3 school_management.db \"ALTER TABLE password_resets ADD COLUMN purpose VARCHAR(20) DEFAULT 'password_reset';\"")
    print("  pkill -f node && npm run dev")


if __name__ == "__main__":
    main()
