const { run, get, all } = require('../config/database');

const TeacherModel = {
  // ─── Read ───
  list: () =>
    all(
      `SELECT t.id, t.employee_code, t.department_id, t.qualification,
              t.join_date, t.salary_cents, t.created_at,
              u.id AS user_id, u.name, u.email, u.phone, u.avatar_url, u.status,
              d.department_name
       FROM teachers t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN departments d ON t.department_id = d.id
       ORDER BY u.name`
    ),

  findById: (id) =>
    get(
      `SELECT t.*, u.id AS user_id, u.name, u.email, u.phone, u.avatar_url, u.status,
              d.department_name
       FROM teachers t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN departments d ON t.department_id = d.id
       WHERE t.id = ?`,
      [id]
    ),

  findByUserId: (user_id) =>
    get(`SELECT * FROM teachers WHERE user_id = ?`, [user_id]),

  employeeCodeTaken: (code, exceptId = null) =>
    get(
      `SELECT id FROM teachers
       WHERE employee_code = ? AND (? IS NULL OR id != ?)`,
      [code, exceptId, exceptId]
    ),

  // ─── Write ───
  // Inputs: salary is PKR (decimal), stored as salary_cents (integer)
  create: ({ user_id, employee_code, department_id = null,
             qualification = null, join_date = null, salary = null }) => {
    const salary_cents = salary == null ? 0 : Math.round(Number(salary) * 100);
    return run(
      `INSERT INTO teachers (user_id, employee_code, department_id, qualification, join_date, salary_cents)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, employee_code, department_id, qualification, join_date, salary_cents]
    );
  },

  update: (id, patch) => {
    // Translate salary (PKR) → salary_cents if present
    const clean = { ...patch };
    if (clean.salary != null) {
      clean.salary_cents = Math.round(Number(clean.salary) * 100);
      delete clean.salary;
    }
    const keys = Object.keys(clean);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE teachers SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => clean[k]), id]);
  },

  remove: (id) => run(`DELETE FROM teachers WHERE id = ?`, [id]),

  // ─── Departments lookup ───
  listDepartments: () => all(`SELECT * FROM departments ORDER BY department_name`),

  // ─── Sections handled (from timetable) ───
  sections: (teacher_id) =>
    all(
      `SELECT DISTINCT sec.id AS section_id, sec.section_name,
              c.id AS class_id, c.class_name, c.class_code
       FROM timetables tt
       JOIN sections sec ON tt.section_id = sec.id
       JOIN classes c ON sec.class_id = c.id
       WHERE tt.teacher_id = ?
       ORDER BY c.class_name, sec.section_name`,
      [teacher_id]
    ),
};

module.exports = TeacherModel;
