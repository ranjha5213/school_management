#!/usr/bin/env python3
"""
Auth backend generator: registration approval, OTP password reset, change password.
Run from repo root: python scripts/generate_auth_backend.py
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
    print(f"\n── {m} " + "─" * max(0, 62 - len(m)))


# ════════════════════════════════════════════════════════════

def gen_migrations():
    banner("migration")

    write("migrations/012_auth_upgrade.sql", r"""
-- users.status: active | pending | rejected
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
UPDATE users SET status = 'active' WHERE status IS NULL;

-- OTP + reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(150) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    reset_token VARCHAR(255),
    attempts INTEGER DEFAULT 0,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);

-- audit columns on users (optional but useful)
ALTER TABLE users ADD COLUMN approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN approved_at DATETIME;
ALTER TABLE users ADD COLUMN rejection_reason VARCHAR(255);
""".strip())


def gen_utils():
    banner("utils")

    write("utils/otp.js", r"""
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const generate = () => {
  // 6-digit numeric code
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, '0');
};

const hash = (code) => bcrypt.hash(code, 8);
const verify = (code, hashed) => bcrypt.compare(code, hashed);

const generateResetToken = () => crypto.randomBytes(32).toString('hex');

module.exports = { generate, hash, verify, generateResetToken };
""".strip())

    write("utils/emailService.js", r"""
const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;

const isConfigured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (transporter) return transporter;
  if (!isConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
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
      to,
      subject,
      text,
      html,
    });
    logger.info(`[email] sent to=${to} id=${info.messageId}`);
    return { sent: true, id: info.messageId };
  } catch (e) {
    logger.error(`[email] failed to=${to}: ${e.message}`);
    logger.info(`[email:FALLBACK] to=${to} subject="${subject}"\n${text}`);
    return { failed: true, error: e.message };
  }
};

const sendOtp = (to, code) =>
  send(
    to,
    'Your password reset code',
    `Your password reset code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, ignore this email.`,
    `<div style="font-family:sans-serif;max-width:420px;margin:auto">
       <h2>Password Reset</h2>
       <p>Your code is:</p>
       <div style="font-size:32px;font-weight:bold;letter-spacing:6px;background:#f3f4f6;padding:16px;text-align:center;border-radius:8px">
         ${code}
       </div>
       <p style="color:#6b7280;font-size:13px;margin-top:16px">Expires in 10 minutes.</p>
     </div>`
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

module.exports = { send, sendOtp, sendApprovalEmail, sendRejectionEmail, isConfigured };
""".strip())


def gen_model():
    banner("models")

    write("models/passwordResetModel.js", r"""
const { run, get, all } = require('../config/database');

const PasswordResetModel = {
  create: ({ email, otp_hash, expires_at }) =>
    run(
      `INSERT INTO password_resets (email, otp_hash, expires_at) VALUES (?, ?, ?)`,
      [email, otp_hash, expires_at]
    ),

  findLatestActive: (email) =>
    get(
      `SELECT * FROM password_resets
       WHERE email = ? AND used = 0 AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`,
      [email]
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

  cleanup: () =>
    run(`DELETE FROM password_resets WHERE expires_at < datetime('now', '-1 day')`),
};

module.exports = PasswordResetModel;
""".strip())

    # patch UserModel with status helpers
    write("models/userModel.js", r"""
const { run, get, all } = require('../config/database');

const UserModel = {
  create: ({ name, email, password_hash, role, phone = null, avatar_url = null, status = 'active' }) =>
    run(
      `INSERT INTO users (name, email, password_hash, role, phone, avatar_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, email, password_hash, role, phone, avatar_url, status]
    ),

  findByEmail: (email) => get(`SELECT * FROM users WHERE email = ?`, [email]),

  findById: (id) =>
    get(
      `SELECT id, name, email, role, phone, avatar_url, status, created_at
       FROM users WHERE id = ?`,
      [id]
    ),

  list: () => all(`SELECT id, name, email, role, status FROM users ORDER BY name`),

  listPending: () =>
    all(
      `SELECT id, name, email, role, created_at
       FROM users WHERE status = 'pending'
       ORDER BY created_at DESC`
    ),

  setStatus: (id, status, approved_by = null, reason = null) =>
    run(
      `UPDATE users
       SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, rejection_reason = ?
       WHERE id = ?`,
      [status, approved_by, reason, id]
    ),

  update: (id, patch) => {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  setPassword: (id, password_hash) =>
    run(`UPDATE users SET password_hash = ? WHERE id = ?`, [password_hash, id]),
};

module.exports = UserModel;
""".strip())


def gen_controllers():
    banner("controllers")

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

// ─── Register ───
const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'student' } = req.body;
    if (!['student', 'parent'].includes(role))
      return apiResponse(res, 400, false, 'Role must be student or parent');

    if (await UserModel.findByEmail(email))
      return apiResponse(res, 409, false, 'Email already registered');

    const password_hash = await hash(password);
    const { lastID } = await UserModel.create({
      name, email, password_hash, role, status: 'pending',
    });

    // Optional: create student stub with admission number
    if (role === 'student') {
      const admission_number = `ADM${String(lastID).padStart(5, '0')}`;
      await StudentModel.create({ user_id: lastID, admission_number });
    }

    logger.audit(`New pending registration: ${email} (${role})`);

    return apiResponse(res, 201, true,
      'Registration submitted. An admin will review your account shortly.');
  } catch (e) { next(e); }
};

// ─── Login ───
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await UserModel.findByEmail(email);
    if (!user) return apiResponse(res, 401, false, 'Invalid credentials');

    if (user.status === 'pending')
      return apiResponse(res, 403, false,
        'Your account is pending admin approval. Please wait.');
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
    const user = await UserModel.findByEmail(req.user.email);
    if (!user) return apiResponse(res, 404, false, 'User not found');

    const ok = await compare(oldPassword, user.password_hash);
    if (!ok) return apiResponse(res, 401, false, 'Current password is incorrect');

    const password_hash = await hash(newPassword);
    await UserModel.setPassword(user.id, password_hash);

    logger.audit(`Password changed by user ${user.email}`);
    return apiResponse(res, 200, true, 'Password changed successfully');
  } catch (e) { next(e); }
};

// ─── OTP: send ───
const sendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await UserModel.findByEmail(email);
    if (!user) {
      // don't leak existence — respond success
      return apiResponse(res, 200, true, 'If this email exists, an OTP has been sent');
    }

    // Rate limit: 1 send per 60s
    const last = await PasswordResetModel.findLatestActive(email);
    if (last) {
      const ageSec = Math.floor((Date.now() - new Date(last.created_at + 'Z').getTime()) / 1000);
      if (ageSec < OTP_RESEND_COOLDOWN_SEC) {
        const wait = OTP_RESEND_COOLDOWN_SEC - ageSec;
        return apiResponse(res, 429, false, `Please wait ${wait}s before requesting another code`);
      }
    }

    const code = otp.generate();
    const otp_hash = await otp.hash(code);
    const expires_at = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await PasswordResetModel.create({ email, otp_hash, expires_at });
    await PasswordResetModel.cleanup();

    const result = await emailService.sendOtp(email, code);
    const devHint = result?.dev ? ' (dev: check backend log)' : '';
    logger.info(`OTP sent to ${email}${devHint}`);

    return apiResponse(res, 200, true,
      `OTP sent to your email. It expires in ${OTP_EXPIRES_MIN} minutes.${devHint}`);
  } catch (e) { next(e); }
};

// ─── OTP: verify ───
const verifyOtp = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return apiResponse(res, 400, false, 'Email and code required');

    const rec = await PasswordResetModel.findLatestActive(email);
    if (!rec) return apiResponse(res, 400, false, 'OTP expired or not found. Request a new one.');

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

// ─── Reset password ───
const resetPassword = async (req, res, next) => {
  try {
    const { reset_token, newPassword } = req.body;
    if (!reset_token || !newPassword)
      return apiResponse(res, 400, false, 'reset_token and newPassword required');

    const rec = await PasswordResetModel.findByResetToken(reset_token);
    if (!rec) return apiResponse(res, 400, false, 'Invalid or expired reset token');

    const user = await UserModel.findByEmail(rec.email);
    if (!user) return apiResponse(res, 404, false, 'User not found');

    const password_hash = await hash(newPassword);
    await UserModel.setPassword(user.id, password_hash);
    await PasswordResetModel.markUsed(rec.id);

    logger.audit(`Password reset completed for ${rec.email}`);
    return apiResponse(res, 200, true, 'Password reset successfully. You can now sign in.');
  } catch (e) { next(e); }
};

// ─── Admin: list pending ───
const listPending = async (_req, res, next) => {
  try {
    const rows = await UserModel.listPending();
    return apiResponse(res, 200, true, 'Pending users', rows);
  } catch (e) { next(e); }
};

// ─── Admin: approve ───
const approveUser = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const user = await UserModel.findById(id);
    if (!user) return apiResponse(res, 404, false, 'User not found');
    if (user.status === 'active') return apiResponse(res, 400, false, 'Already active');

    await UserModel.setStatus(id, 'active', req.user.id);
    await emailService.sendApprovalEmail(user.email, user.name);
    logger.audit(`User approved: ${user.email} by ${req.user.email}`);
    return apiResponse(res, 200, true, 'User approved');
  } catch (e) { next(e); }
};

// ─── Admin: reject ───
const rejectUser = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body;
    const user = await UserModel.findById(id);
    if (!user) return apiResponse(res, 404, false, 'User not found');

    await UserModel.setStatus(id, 'rejected', req.user.id, reason || null);
    await emailService.sendRejectionEmail(user.email, user.name, reason);
    logger.audit(`User rejected: ${user.email} by ${req.user.email}`);
    return apiResponse(res, 200, true, 'User rejected');
  } catch (e) { next(e); }
};

module.exports = {
  register, login, me, refresh, logout, changePassword,
  sendOtp, verifyOtp, resetPassword,
  listPending, approveUser, rejectUser,
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
} = require('../middleware/validators');

const router = express.Router();

// Public
router.post('/register', validateRegister, c.register);
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


def gen_validators():
    banner("validators patch")

    write("middleware/validators.js", r"""
const { body, param, query, validationResult } = require('express-validator');
const { apiResponse } = require('../utils/helpers');
const {
  PUBLIC_ROLES, STAFF_ROLES, ATTENDANCE_STATUSES, GENDERS,
  PAYMENT_METHODS, DAYS_OF_WEEK, MESSAGES, PAGINATION,
} = require('../config/constants');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return apiResponse(res, 400, false, MESSAGES.VALIDATION_FAILED, errors.array());
  next();
};

const validateRegister = [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  body('role').optional().isIn(PUBLIC_ROLES),
  handleValidation,
];

const validateLogin = [
  body('email').isEmail(),
  body('password').notEmpty(),
  handleValidation,
];

const validateStaffRegister = [
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(STAFF_ROLES),
  handleValidation,
];

const validateChangePassword = [
  body('oldPassword').notEmpty().withMessage('Old password required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password min 6 chars'),
  handleValidation,
];

const validateSendOtp = [
  body('email').isEmail().withMessage('Valid email required'),
  handleValidation,
];

const validateVerifyOtp = [
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 }).withMessage('6-digit code required'),
  handleValidation,
];

const validateResetPassword = [
  body('reset_token').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
  handleValidation,
];

const validateStudent = [
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('gender').optional().isIn(GENDERS),
  handleValidation,
];

const validateTeacher = [
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('employee_code').optional().trim(),
  handleValidation,
];

const validateAttendance = [
  body('student_id').isInt(),
  body('date').isISO8601(),
  body('status').isIn(ATTENDANCE_STATUSES),
  handleValidation,
];

const validateRemarksUpdate = [
  body('student_id').isInt(),
  body('date').isISO8601(),
  body('remarks').optional({ nullable: true }).isLength({ max: 500 }),
  handleValidation,
];

const validatePayment = [
  body('invoice_id').isInt(),
  body('amount_paid').isFloat({ gt: 0 }),
  body('payment_method').isIn(PAYMENT_METHODS),
  handleValidation,
];

const validateTimetable = [
  body('section_id').isInt(),
  body('subject_id').isInt(),
  body('day_of_week').isIn(DAYS_OF_WEEK),
  body('start_time').matches(/^\d{2}:\d{2}/),
  body('end_time').matches(/^\d{2}:\d{2}/),
  handleValidation,
];

const validateId = [param('id').isInt(), handleValidation];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: PAGINATION.MAX_LIMIT }),
  handleValidation,
];

module.exports = {
  validateRegister, validateLogin, validateStaffRegister, validateChangePassword,
  validateSendOtp, validateVerifyOtp, validateResetPassword,
  validateStudent, validateTeacher, validateAttendance, validateRemarksUpdate,
  validatePayment, validateTimetable, validateId, validatePagination,
};
""".strip())


def gen_env_and_pkg():
    banner("env + package")

    # append SMTP vars to .env if missing
    env = BE / ".env"
    if env.exists():
        text = env.read_text()
        added = []
        for line in [
            "",
            "# ─── SMTP (Gmail) ───",
            "SMTP_HOST=smtp.gmail.com",
            "SMTP_PORT=587",
            "SMTP_SECURE=false",
            "SMTP_USER=ranjha5213@gmail.com",
            "SMTP_PASS=your-16-char-app-password",
            "SMTP_FROM=School MS <ranjha5213@gmail.com>",
        ]:
            key = line.split('=')[0].strip()
            if key and '=' in line and f"{key}=" in text:
                continue
            if line not in text:
                text += line + "\n"
                added.append(line)
        env.write_text(text)
        if added:
            print(f"  ✓ appended {len(added)} lines to backend/.env")
            print("     ⚠️  Edit SMTP_PASS — use a Gmail App Password, not your login password")

    # patch package.json to add nodemailer
    import json
    pkg_file = BE / "package.json"
    if pkg_file.exists():
        pkg = json.loads(pkg_file.read_text())
        pkg.setdefault('dependencies', {})['nodemailer'] = '^6.9.13'
        pkg_file.write_text(json.dumps(pkg, indent=2) + "\n")
        print("  ✓ added nodemailer to backend/package.json")


def main():
    print(f"Generating auth backend in {BE}")
    gen_migrations()
    gen_utils()
    gen_model()
    gen_controllers()
    gen_routes()
    gen_validators()
    gen_env_and_pkg()

    print("\n" + "═" * 66)
    print("✅ Auth backend generated.")
    print("═" * 66)
    print("\nNext steps:")
    print("  1. cd ~/school/backend")
    print("  2. Edit .env → set SMTP_PASS (Gmail app password)")
    print("  3. npm install")
    print("  4. npm run migrate")
    print("  5. npm run dev")


if __name__ == "__main__":
    main()
