const { verify } = require('../utils/jwt');
const { apiResponse } = require('../utils/helpers');

const authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return apiResponse(res, 401, false, 'Missing token');

  try {
    req.user = verify(token);
    next();
  } catch {
    return apiResponse(res, 401, false, 'Invalid or expired token');
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return apiResponse(res, 401, false, 'Unauthorized');
  if (!roles.includes(req.user.role)) return apiResponse(res, 403, false, 'Forbidden');
  next();
};

// ─── attachStudentId ───
// If the authenticated user is a student, look up their row and attach
// req.studentId, req.studentSectionId, req.studentClassId.
// No-op for other roles.
const attachStudentId = async (req, res, next) => {
  try {
    if (req.user?.role === 'student') {
      const { get } = require('../config/database');
      const s = await get(
        `SELECT s.id, s.section_id, sec.class_id
           FROM students s
           LEFT JOIN sections sec ON s.section_id = sec.id
          WHERE s.user_id = ?`,
        [req.user.id]
      );
      if (s) {
        req.studentId        = s.id;
        req.studentSectionId = s.section_id;
        req.studentClassId   = s.class_id;
      } else {
        req.studentId = null;
      }
    }
    next();
  } catch (e) { next(e); }
};

module.exports = { authenticate, authorize, attachStudentId };
