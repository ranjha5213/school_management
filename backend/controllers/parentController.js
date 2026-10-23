const { all } = require('../config/database');
const { apiResponse } = require('../utils/helpers');

const myChildren = async (req, res, next) => {
  try {
    const rows = await all(
      `SELECT s.id, u.name AS student_name, u.email,
              sec.section_name, c.class_name, s.admission_number, s.roll_number
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       JOIN parent_students ps ON ps.student_id = s.id
       WHERE ps.parent_user_id = ?`,
      [req.user.id]
    ).catch(() => []);
    return apiResponse(res, 200, true, 'Children', rows);
  } catch (e) { next(e); }
};

module.exports = { myChildren };
