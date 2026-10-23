const { all } = require('../config/database');
const { apiResponse } = require('../utils/helpers');

const search = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2)
      return apiResponse(res, 200, true, 'Search', { students: [], teachers: [] });

    const like = `%${q}%`;
    const students = await all(
      `SELECT s.id, u.name, u.email, s.admission_number, s.roll_number,
              sec.section_name, c.class_name
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       WHERE u.name LIKE ? OR u.email LIKE ? OR s.admission_number LIKE ?
       LIMIT 15`,
      [like, like, like]
    );
    const teachers = await all(
      `SELECT t.id, u.name, u.email, t.employee_code
       FROM teachers t JOIN users u ON t.user_id = u.id
       WHERE u.name LIKE ? OR u.email LIKE ? OR t.employee_code LIKE ?
       LIMIT 15`,
      [like, like, like]
    );
    return apiResponse(res, 200, true, 'Search', { students, teachers });
  } catch (e) { next(e); }
};

module.exports = { search };
