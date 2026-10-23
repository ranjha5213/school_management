const { run, get, all } = require('../config/database');

const TimetableModel = {
  // ─── Read ───
  list: (filters = {}) => {
    let sql = `
      SELECT t.*,
             sub.subject_name, sub.subject_code,
             sec.section_name, sec.room_number,
             c.id AS class_id, c.class_name, c.class_code,
             u.name AS teacher_name, te.employee_code
      FROM timetables t
      LEFT JOIN subjects sub ON t.subject_id = sub.id
      LEFT JOIN sections sec ON t.section_id = sec.id
      LEFT JOIN classes c ON sec.class_id = c.id
      LEFT JOIN teachers te ON t.teacher_id = te.id
      LEFT JOIN users u ON te.user_id = u.id
    `;
    const where = [];
    const params = [];
    if (filters.section_id) { where.push('t.section_id = ?'); params.push(filters.section_id); }
    if (filters.teacher_id) { where.push('t.teacher_id = ?'); params.push(filters.teacher_id); }
    if (filters.class_id)   { where.push('c.id = ?');         params.push(filters.class_id); }
    if (filters.day)        { where.push('t.day_of_week = ?'); params.push(filters.day); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ` ORDER BY CASE t.day_of_week
        WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
        WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6
        ELSE 7 END, t.start_time`;
    return all(sql, params);
  },

  findById: (id) =>
    get(
      `SELECT t.*,
              sub.subject_name, sub.subject_code,
              sec.section_name, c.class_name,
              u.name AS teacher_name
       FROM timetables t
       LEFT JOIN subjects sub ON t.subject_id = sub.id
       LEFT JOIN sections sec ON t.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       LEFT JOIN teachers te ON t.teacher_id = te.id
       LEFT JOIN users u ON te.user_id = u.id
       WHERE t.id = ?`,
      [id]
    ),

  // ─── Conflict detection ───
  // Same section + same day + overlapping time
  sectionConflict: ({ section_id, day_of_week, start_time, end_time, except_id = null }) =>
    get(
      `SELECT id, start_time, end_time
       FROM timetables
       WHERE section_id = ? AND day_of_week = ? AND is_active = 1
         AND (? IS NULL OR id != ?)
         AND (start_time < ? AND end_time > ?)`,
      [section_id, day_of_week, except_id, except_id, end_time, start_time]
    ),

  // Same teacher + same day + overlapping time
  teacherConflict: ({ teacher_id, day_of_week, start_time, end_time, except_id = null }) => {
    if (!teacher_id) return Promise.resolve(null);
    return get(
      `SELECT t.id, t.start_time, t.end_time, sec.section_name, c.class_name
       FROM timetables t
       LEFT JOIN sections sec ON t.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       WHERE t.teacher_id = ? AND t.day_of_week = ? AND t.is_active = 1
         AND (? IS NULL OR t.id != ?)
         AND (t.start_time < ? AND t.end_time > ?)`,
      [teacher_id, day_of_week, except_id, except_id, end_time, start_time]
    );
  },

  // ─── Write ───
  create: ({ section_id, subject_id, teacher_id = null, day_of_week,
             start_time, end_time, room_number = null }) =>
    run(
      `INSERT INTO timetables
         (section_id, subject_id, teacher_id, day_of_week, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [section_id, subject_id, teacher_id, day_of_week, start_time, end_time]
    ),

  update: (id, patch) => {
    const allowed = ['section_id', 'subject_id', 'teacher_id',
                     'day_of_week', 'start_time', 'end_time', 'is_active'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE timetables SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  remove: (id) => run(`DELETE FROM timetables WHERE id = ?`, [id]),

  // ─── Lookups for the form ───
  subjectsForSection: (section_id) =>
    all(
      `SELECT sub.id, sub.subject_name, sub.subject_code
       FROM subjects sub
       JOIN sections sec ON sec.id = ?
       WHERE sub.class_id = sec.class_id OR sub.class_id IS NULL
       ORDER BY sub.subject_name`,
      [section_id]
    ),

  teachersList: () =>
    all(
      `SELECT t.id, t.employee_code, u.name, u.email
       FROM teachers t
       JOIN users u ON t.user_id = u.id
       ORDER BY u.name`
    ),

  // ─── Weekly grid (per section) ───
  weeklyForSection: (section_id) =>
    all(
      `SELECT t.id, t.day_of_week, t.start_time, t.end_time,
              sub.id AS subject_id, sub.subject_name,
              te.id AS teacher_id, u.name AS teacher_name
       FROM timetables t
       LEFT JOIN subjects sub ON t.subject_id = sub.id
       LEFT JOIN teachers te ON t.teacher_id = te.id
       LEFT JOIN users u ON te.user_id = u.id
       WHERE t.section_id = ? AND t.is_active = 1
       ORDER BY t.start_time`,
      [section_id]
    ),
};

module.exports = TimetableModel;
