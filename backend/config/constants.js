module.exports = {
  PUBLIC_ROLES: ['student', 'parent', 'teacher', 'accountant'],
  STAFF_ROLES: ['admin', 'teacher', 'accountant'],
  ALL_ROLES: ['admin', 'teacher', 'accountant', 'student', 'parent'],
  ATTENDANCE_STATUSES: ['present', 'absent', 'late', 'excused'],
  GENDERS: ['male', 'female', 'other'],
  PAYMENT_METHODS: ['cash', 'card', 'bank_transfer', 'online', 'cheque'],
  DAYS_OF_WEEK: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  MESSAGES: {
    VALIDATION_FAILED: 'Validation failed',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    NOT_FOUND: 'Not found',
    SERVER_ERROR: 'Internal server error',
  },
  PAGINATION: { DEFAULT_LIMIT: 20, MAX_LIMIT: 200 },
};
