const { run, get, all } = require('../config/database');

const ExamModel = {
  // ─── Exam types ───
  listTypes: () =>
    all(`SELECT * FROM exam_types ORDER BY type_name`),

  createType: ({ type_name, weightage = null }) =>
    run(`INSERT INTO exam_types (type_name, weightage) VALUES (?, ?)`,
        [type_name, weightage]),

  // ─── Exams ───
  list: (filters = {}) => {
    let sql = `
      SELECT e.*, et.type_name, c.class_name, c.class_code
      FROM exams e
      LEFT JOIN exam_types et ON e.exam_type_id = et.id
      LEFT JOIN classes c ON e.class_id = c.id
    `;
    const where = [];
    const params = [];
    if (filters.class_id) { where.push('e.class_id = ?'); params.push(filters.class_id); }
    if (filters.is_active !== undefined) { where.push('e.is_active = ?'); params.push(filters.is_active); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY e.start_date DESC, e.id DESC';
    return all(sql, params);
  },

  findById: (id) =>
    get(
      `SELECT e.*, et.type_name, c.class_name
       FROM exams e
       LEFT JOIN exam_types et ON e.exam_type_id = et.id
       LEFT JOIN classes c ON e.class_id = c.id
       WHERE e.id = ?`,
      [id]
    ),

  create: ({ exam_name, exam_type_id = null, class_id = null,
             start_date = null, end_date = null,
             total_marks = null, passing_marks = null }) =>
    run(
      `INSERT INTO exams
         (exam_name, exam_type_id, class_id, start_date, end_date, total_marks, passing_marks, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [exam_name, exam_type_id, class_id, start_date, end_date, total_marks, passing_marks]
    ),

  update: (id, patch) => {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE exams SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  remove: (id) => run(`DELETE FROM exams WHERE id = ?`, [id]),

  // ─── Marks ───
  marksForExam: (exam_id) =>
    all(
      `SELECT em.*, u.name AS student_name, s.roll_number, s.admission_number,
              sub.subject_name, sub.id AS subject_id
       FROM exam_marks em
       JOIN students s ON em.student_id = s.id
       JOIN users u ON s.user_id = u.id
       LEFT JOIN subjects sub ON em.subject_id = sub.id
       WHERE em.exam_id = ?
       ORDER BY u.name, sub.subject_name`,
      [exam_id]
    ),

  marksForStudent: (student_id) =>
    all(
      `SELECT em.*, e.exam_name, e.start_date, e.total_marks AS exam_total,
              sub.subject_name, et.type_name
       FROM exam_marks em
       JOIN exams e ON em.exam_id = e.id
       LEFT JOIN exam_types et ON e.exam_type_id = et.id
       LEFT JOIN subjects sub ON em.subject_id = sub.id
       WHERE em.student_id = ?
       ORDER BY e.start_date DESC`,
      [student_id]
    ),

  upsertMark: ({ exam_id, student_id, subject_id, marks_obtained, total_marks, remarks = null, entered_by = null }) =>
    run(
      `INSERT INTO exam_marks
         (exam_id, student_id, subject_id, marks_obtained, total_marks, remarks, entered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(exam_id, student_id, subject_id) DO UPDATE SET
         marks_obtained = excluded.marks_obtained,
         total_marks = excluded.total_marks,
         remarks = excluded.remarks,
         entered_by = excluded.entered_by,
         entered_at = CURRENT_TIMESTAMP`,
      [exam_id, student_id, subject_id, marks_obtained, total_marks, remarks, entered_by]
    ),

  removeMark: (id) => run(`DELETE FROM exam_marks WHERE id = ?`, [id]),

  // ─── Subjects (for the marks grid) ───
  subjectsForClass: (class_id) =>
    all(
      `SELECT id, subject_name, subject_code
       FROM subjects
       WHERE class_id = ? OR class_id IS NULL
       ORDER BY subject_name`,
      [class_id]
    ),

  // ─── Students of a class (across sections) ───
  studentsForClass: (class_id) =>
    all(
      `SELECT s.id, u.name AS student_name, s.roll_number, s.admission_number,
              sec.section_name, sec.id AS section_id
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN sections sec ON s.section_id = sec.id
       WHERE sec.class_id = ?
       ORDER BY sec.section_name, s.roll_number, u.name`,
      [class_id]
    ),

  // ─── Exam summary ───
  summary: (exam_id) =>
    get(
      `SELECT
         COUNT(DISTINCT em.student_id) AS student_count,
         COUNT(em.id) AS marks_count,
         AVG(em.marks_obtained * 1.0 / NULLIF(em.total_marks, 0)) AS avg_percentage,
         MAX(em.marks_obtained * 1.0 / NULLIF(em.total_marks, 0)) AS max_percentage,
         MIN(em.marks_obtained * 1.0 / NULLIF(em.total_marks, 0)) AS min_percentage
       FROM exam_marks em
       WHERE em.exam_id = ?`,
      [exam_id]
    ),
};

module.exports = ExamModel;
