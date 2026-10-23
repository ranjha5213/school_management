const { apiResponse } = require('./helpers');

// Ensures req.user is allowed to view the given student param.
// Admin/teacher can view any. Students/parents can view their own.
const requireStudentAccess = (paramName = 'studentId') => (req, res, next) => {
  const user = req.user;
  if (!user) return apiResponse(res, 401, false, 'Unauthorized');

  if (user.role === 'admin' || user.role === 'teacher') return next();

  const target = Number(req.params[paramName]);
  if (user.student_id && Number(user.student_id) === target) return next();
  if (user.children_ids && user.children_ids.includes(target)) return next();

  return apiResponse(res, 403, false, 'Forbidden');
};

module.exports = { requireStudentAccess };
