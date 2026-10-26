const { run, get, all } = require('../config/database');

const HomeworkModel = {
  list: (filters = {}) => {
    let sql = `
      SELECT h.*,
             sub.subject_name,
             sub.class_id,
             c.class_name, c.class_code,
             tu.name AS teacher_name,
             uu.name AS updated_by_name
      FROM homework h
      LEFT JOIN subjects sub ON h.subject_id = sub.id
      LEFT JOIN classes c ON sub.class_id = c.id
      LEFT JOIN teachers t ON h.teacher_id = t.id
      LEFT JOIN users tu ON t.user_id = tu.id
      LEFT JOIN users uu ON h.updated_by = uu.id
    `;
    const where = [];
    const params = [];
    if (filters.class_id)   { where.push('sub.class_id = ?');   params.push(filters.class_id); }
    if (filters.teacher_id) { where.push('h.teacher_id = ?');   params.push(filters.teacher_id); }
    if (filters.subject_id) { where.push('h.subject_id = ?');   params.push(filters.subject_id); }
    if (filters.q)          { where.push('(h.title LIKE ? OR h.description LIKE ?)');
                              params.push(`%${filters.q}%`, `%${filters.q}%`); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY h.created_at DESC, h.id DESC LIMIT 500';
    return all(sql, params);
  },

  findById: (id) =>
    get(
      `SELECT h.*,
              sub.subject_name,
              sub.class_id,
              c.class_name, c.class_code,
              tu.name AS teacher_name,
              uu.name AS updated_by_name
       FROM homework h
       LEFT JOIN subjects sub ON h.subject_id = sub.id
       LEFT JOIN classes c ON sub.class_id = c.id
       LEFT JOIN teachers t ON h.teacher_id = t.id
       LEFT JOIN users tu ON t.user_id = tu.id
       LEFT JOIN users uu ON h.updated_by = uu.id
       WHERE h.id = ?`,
      [id]
    ),

  create: ({ subject_id, teacher_id = null,
             title, description = null, due_date,
             attachment_url = null }) =>
    run(
      `INSERT INTO homework
        (subject_id, teacher_id, title, description, due_date, attachment_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [subject_id, teacher_id, title, description, due_date, attachment_url]
    ),

  update: (id, patch, updated_by) => {
    const allowed = ['subject_id', 'teacher_id',
                     'title', 'description', 'due_date', 'attachment_url'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const set = keys.map((k) => `${k} = ?`).join(', ');
    const sql = `UPDATE homework SET ${set}, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), updated_by, id]);
  },

  remove: (id) => run(`DELETE FROM homework WHERE id = ?`, [id]),

  submissionsFor: (homework_id) =>
    all(
      `SELECT hs.*,
              u.name AS student_name,
              s.roll_number, s.admission_number,
              gu.name AS graded_by_name
       FROM homework_submissions hs
       JOIN students s ON hs.student_id = s.id
       JOIN users u ON s.user_id = u.id
       LEFT JOIN users gu ON hs.graded_by = gu.id
       WHERE hs.homework_id = ?
       ORDER BY hs.submission_date DESC`,
      [homework_id]
    ),

  submit: ({ homework_id, student_id, attachment_url = null, remarks = null }) =>
    run(
      `INSERT INTO homework_submissions (homework_id, student_id, attachment_url, remarks)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(homework_id, student_id) DO UPDATE SET
         attachment_url = excluded.attachment_url,
         remarks = excluded.remarks,
         submission_date = CURRENT_TIMESTAMP`,
      [homework_id, student_id, attachment_url, remarks]
    ),

  gradeSubmission: ({ homework_id, student_id, grade, remarks, graded_by }) =>
    run(
      `UPDATE homework_submissions
       SET grade = ?, remarks = ?, graded_by = ?, graded_at = CURRENT_TIMESTAMP
       WHERE homework_id = ? AND student_id = ?`,
      [grade, remarks || null, graded_by, homework_id, student_id]
    ),

  studentsInClass: (class_id) =>
    all(
      `SELECT s.id, u.name AS student_name, s.roll_number, s.admission_number,
              sec.section_name
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN sections sec ON s.section_id = sec.id
       WHERE sec.class_id = ?
       ORDER BY sec.section_name, s.roll_number, u.name`,
      [class_id]
    ),
};

module.exports = HomeworkModel;
