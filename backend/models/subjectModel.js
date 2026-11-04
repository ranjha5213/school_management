// models/subjectModel.js
const { run, get, all } = require('../config/database');

const SubjectModel = {
  list: () =>
    all(
      `SELECT s.*, c.class_name
         FROM subjects s
         LEFT JOIN classes c ON c.id = s.class_id
        ORDER BY s.class_id, s.subject_name`
    ),

  findById: (id) =>
    get(
      `SELECT s.*, c.class_name
         FROM subjects s
         LEFT JOIN classes c ON c.id = s.class_id
        WHERE s.id = ?`,
      [id]
    ),

  findByClass: (class_id) =>
    all(
      `SELECT s.*
         FROM subjects s
        WHERE s.class_id = ? OR s.class_id IS NULL
        ORDER BY s.subject_name`,
      [class_id]
    ),

  findByName: (name, class_id = null) =>
    get(
      `SELECT * FROM subjects
        WHERE LOWER(subject_name) = LOWER(?)
          AND (class_id IS ? OR class_id = ?)`,
      [name, class_id, class_id]
    ),

  create: (d) =>
    run(
      `INSERT INTO subjects (subject_name, subject_code, class_id)
       VALUES (?, ?, ?)`,
      [d.subject_name, d.subject_code || null, d.class_id || null]
    ),

  update: (id, patch) => {
    const allowed = ['subject_name', 'subject_code', 'class_id'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE subjects SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  remove: (id) => run(`DELETE FROM subjects WHERE id = ?`, [id]),
};

module.exports = SubjectModel;
