const { run, get, all } = require('../config/database');

const StudentModel = {
  create: ({ user_id, admission_number, section_id = null, roll_number = null,
             gender = null, dob = null, guardian_name = null, guardian_phone = null }) =>
    run(
      `INSERT INTO students (user_id, admission_number, section_id, roll_number, gender, dob, guardian_name, guardian_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, admission_number, section_id, roll_number, gender, dob, guardian_name, guardian_phone]
    ),

  findById: (id) =>
    get(
      `SELECT s.*, u.name, u.email
       FROM students s JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`,
      [id]
    ),

  findByUserId: (user_id) => get(`SELECT * FROM students WHERE user_id = ?`, [user_id]),

  list: ({ section_id, class_id } = {}) => {
    let sql = `SELECT s.*, u.name AS student_name, u.email, sec.section_name, c.class_name
               FROM students s
               JOIN users u ON s.user_id = u.id
               LEFT JOIN sections sec ON s.section_id = sec.id
               LEFT JOIN classes c ON sec.class_id = c.id`;
    const where = [];
    const params = [];
    if (section_id) { where.push('s.section_id = ?'); params.push(section_id); }
    if (class_id)   { where.push('sec.class_id = ?'); params.push(class_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY u.name';
    return all(sql, params);
  },

  update: (id, patch) => {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE students SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  remove: (id) => run(`DELETE FROM students WHERE id = ?`, [id]),
};

module.exports = StudentModel;
