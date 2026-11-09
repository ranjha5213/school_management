// middleware/validators.js
const { body, param, query, validationResult } = require('express-validator');
const { apiResponse } = require('../utils/helpers');
const {
  PUBLIC_ROLES, STAFF_ROLES, ATTENDANCE_STATUSES, GENDERS,
  PAYMENT_METHODS, DAYS_OF_WEEK, MESSAGES, PAGINATION,
} = require('../config/constants');

// ─── helpers ────────────────────────────────────────────────────────────
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return apiResponse(res, 400, false, MESSAGES.VALIDATION_FAILED, errors.array());
  next();
};

// Case-insensitive day-of-week normalizer.
// Accepts 'Monday', 'MONDAY', 'mon', 'Mon', 'monday' and returns the
// canonical capitalized form that DAYS_OF_WEEK contains:
// ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].
const DAY_ALIASES = {
  mon: 'Monday',    tue: 'Tuesday',  wed: 'Wednesday',
  thu: 'Thursday',  fri: 'Friday',   sat: 'Saturday',  sun: 'Sunday',
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

const normalizeDayForValidation = (d) => {
  if (d == null) return d;
  const key = String(d).trim().toLowerCase();
  return DAY_ALIASES[key] || d;
};

// ─── auth ───────────────────────────────────────────────────────────────
const validateRegister = [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
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
  body('password').isLength({ min:8 }),
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

const validateVerifyRegisterOtp = [
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 }),
  handleValidation,
];

// ─── students / teachers ────────────────────────────────────────────────
const validateStudent = [
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('gender').optional().isIn(GENDERS),
  handleValidation,
];

const validateTeacher = [
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('employee_code').optional().trim(),
  handleValidation,
];

// ─── attendance ─────────────────────────────────────────────────────────
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

// ─── payments ───────────────────────────────────────────────────────────
const validatePayment = [
  body('invoice_id').isInt(),
  body('amount_paid').isFloat({ gt: 0 }),
  body('payment_method').isIn(PAYMENT_METHODS),
  handleValidation,
];

// ─── timetable ──────────────────────────────────────────────────────────
// day_of_week is normalized to the canonical capitalized form before the
// .isIn(DAYS_OF_WEEK) check, so 'Monday', 'MONDAY', 'mon', 'Mon', 'monday'
// are all accepted. The model (TimetableModel.create / .update) then
// normalizes once more to the lowercase form the DB CHECK expects.
const validateTimetable = [
  body('section_id').isInt(),
  body('subject_id').isInt(),
  body('day_of_week')
    .customSanitizer(normalizeDayForValidation)
    .isIn(DAYS_OF_WEEK)
    .withMessage(`day_of_week must be one of ${DAYS_OF_WEEK.join(', ')}`),
  body('start_time').matches(/^\d{2}:\d{2}/),
  body('end_time').matches(/^\d{2}:\d{2}/),
  handleValidation,
];

// ─── id / pagination ────────────────────────────────────────────────────
const validateId = [param('id').isInt(), handleValidation];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: PAGINATION.MAX_LIMIT }),
  handleValidation,
];

// ─── exports ────────────────────────────────────────────────────────────
module.exports = {
  handleValidation,
  validateRegister, validateLogin, validateStaffRegister, validateChangePassword,
  validateSendOtp, validateVerifyOtp, validateResetPassword, validateVerifyRegisterOtp,
  validateStudent, validateTeacher, validateAttendance, validateRemarksUpdate,
  validatePayment, validateTimetable, validateId, validatePagination,
};
