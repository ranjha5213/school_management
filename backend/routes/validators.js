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


const validateVerifyRegisterOtp = [
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 }),
  handleValidation,
];

module.exports = {
  validateRegister, validateLogin, validateStaffRegister, validateChangePassword,
  validateSendOtp, validateVerifyOtp, validateResetPassword, validateVerifyRegisterOtp,
  validateStudent, validateTeacher, validateAttendance, validateRemarksUpdate,
  validatePayment, validateTimetable, validateId, validatePagination,
};
