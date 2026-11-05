// models/timetableModel.js
const { run, get, all } = require('../config/database');

// ─── Day-of-week normalizer ───
// DB CHECK constraint only accepts lowercase full words:
//   'monday','tuesday','wednesday','thursday','friday','saturday','sunday'
// Accepts 'Monday', 'MON', 'mon', 'tue', 'Wed', etc. and returns the canonical form.
const DAY_ALIASES = {
  mon: 'monday', tue: 'tuesday', wed: 'wednesday',
  thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday',
  monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday',
  thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday',
};

const normalizeDay = (d) => {
  if (d == null) return d;
  const key = String(d).trim().toLowerCase();
  return DAY_ALIASES[key] || key;
};

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
    if (filters.day)        { where.push('LOWER(t.day_of_week) = ?'); params.push(normalizeDay(filters.day)); }

    if (where.length) sql += ' WHERE ' + where.join(' AND ');

    sql += ` ORDER BY CASE LOWER(t.day_of_week)
        WHEN 'monday'    THEN 1
        WHEN 'tuesday'   THEN 2
        WHEN 'wednesday' THEN 3
        WHEN 'thursday'  THEN 4
        WHEN 'friday'    THEN 5
        WHEN 'saturday'  THEN 6
        WHEN 'sunday'    THEN 7
        ELSE 8 END, t.start_time`;

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
  sectionConflict: ({ section_id, day_of_week, start_time, end_time, except_id = null }) =>
    get(
      `SELECT id, start_time, end_time
       FROM timetables
       WHERE section_id = ? AND LOWER(day_of_week) = ? AND is_active = 1
         AND (? IS NULL OR id != ?)
         AND (start_time < ? AND end_time > ?)`,
      [section_id, normalizeDay(day_of_week), except_id, except_id, end_time, start_time]
    ),

  teacherConflict: ({ teacher_id, day_of_week, start_time, end_time, except_id = null }) => {
    if (!teacher_id) return Promise.resolve(null);
    return get(
      `SELECT t.id, t.start_time, t.end_time, sec.section_name, c.class_name
       FROM timetables t
       LEFT JOIN sections sec ON t.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       WHERE t.teacher_id = ? AND LOWER(t.day_of_week) = ? AND t.is_active = 1
         AND (? IS NULL OR t.id != ?)
         AND (t.start_time < ? AND t.end_time > ?)`,
      [teacher_id, normalizeDay(day_of_week), except_id, except_id, end_time, start_time]
    );
  },

  // ─── Write ───
  create: ({ section_id, subject_id, teacher_id = null, day_of_week,
             start_time, end_time }) =>
    run(
      `INSERT INTO timetables
         (section_id, subject_id, teacher_id, day_of_week, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [section_id, subject_id, teacher_id,
       normalizeDay(day_of_week), start_time, end_time]
    ),

  update: (id, patch) => {
    const allowed = ['section_id', 'subject_id', 'teacher_id',
                     'day_of_week', 'start_time', 'end_time', 'is_active'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });

    const values = keys.map((k) =>
      k === 'day_of_week' ? normalizeDay(patch[k]) : patch[k]
    );
    const sql = `UPDATE timetables SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...values, id]);
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

  teachersForSection: (section_id) =>
    all(
      `SELECT t.id, t.employee_code, u.name, u.email
         FROM teachers t
         JOIN users u ON u.id = t.user_id
         JOIN sections sec ON sec.id = ?
         JOIN classes c ON c.id = sec.class_id
        WHERE t.employee_code LIKE 'TCH-' || printf('%02d', c.id) || '-%'
        ORDER BY t.employee_code`,
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
  byTeacher: (teacher_id) =>
    all(
      `SELECT t.id, t.day_of_week, t.start_time, t.end_time,
              sub.id AS subject_id, sub.subject_name,
              sec.id AS section_id, sec.section_name,
              c.id AS class_id, c.class_name
         FROM timetables t
         LEFT JOIN subjects sub ON sub.id = t.subject_id
         LEFT JOIN sections sec ON sec.id = t.section_id
         LEFT JOIN classes c   ON c.id = sec.class_id
        WHERE t.teacher_id = ? AND t.is_active = 1
        ORDER BY CASE LOWER(t.day_of_week)
          WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
          WHEN 'sunday' THEN 7 ELSE 8 END,
          t.start_time`,
      [teacher_id]
    ),

  searchSlots: (filters = {}) => {
    let sql = `
      SELECT c.id AS class_id, c.class_name,
             sec.id AS section_id, sec.section_name,
             t.id, t.day_of_week, t.start_time, t.end_time,
             sub.subject_name, sub.subject_code,
             u.name AS teacher_name, te.employee_code
        FROM timetables t
        LEFT JOIN sections sec ON sec.id = t.section_id
        LEFT JOIN classes c   ON c.id = sec.class_id
        LEFT JOIN subjects sub ON sub.id = t.subject_id
        LEFT JOIN teachers te ON te.id = t.teacher_id
        LEFT JOIN users u    ON u.id = te.user_id
       WHERE t.is_active = 1`;
    const where = [];
    const params = [];
    if (filters.class_id)   { where.push('c.id = ?');                params.push(filters.class_id); }
    if (filters.section_id) { where.push('sec.id = ?');              params.push(filters.section_id); }
    if (filters.teacher_id) { where.push('te.id = ?');               params.push(filters.teacher_id); }
    if (filters.subject_id) { where.push('sub.id = ?');              params.push(filters.subject_id); }
    if (filters.day)        { where.push('LOWER(t.day_of_week) = ?'); params.push(String(filters.day).toLowerCase()); }
    if (filters.period)     { where.push('t.start_time = ?');        params.push(filters.period); }
    if (filters.q) {
      where.push('(u.name LIKE ? OR sub.subject_name LIKE ? OR c.class_name LIKE ?)');
      const like = '%' + filters.q + '%';
      params.push(like, like, like);
    }
    if (where.length) sql += ' AND ' + where.join(' AND ');
    sql += ` ORDER BY c.id, sec.section_name,
      CASE LOWER(t.day_of_week)
        WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
        WHEN 'sunday' THEN 7 ELSE 8 END,
      t.start_time`;
    return all(sql, params);
  },

  schoolGrid: () =>
    all(
      `SELECT c.id AS class_id, c.class_name,
              sec.id AS section_id, sec.section_name,
              t.id, t.day_of_week, t.start_time, t.end_time,
              sub.subject_name,
              u.name AS teacher_name
         FROM timetables t
         LEFT JOIN sections sec ON sec.id = t.section_id
         LEFT JOIN classes c   ON c.id = sec.class_id
         LEFT JOIN subjects sub ON sub.id = t.subject_id
         LEFT JOIN teachers te ON te.id = t.teacher_id
         LEFT JOIN users u    ON u.id = te.user_id
        WHERE t.is_active = 1
        ORDER BY c.id, sec.section_name,
          CASE LOWER(t.day_of_week)
            WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
            WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
            WHEN 'sunday' THEN 7 ELSE 8 END,
          t.start_time`
    ),

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
       ORDER BY CASE LOWER(t.day_of_week)
        WHEN 'monday'    THEN 1
        WHEN 'tuesday'   THEN 2
        WHEN 'wednesday' THEN 3
        WHEN 'thursday'  THEN 4
        WHEN 'friday'    THEN 5
        WHEN 'saturday'  THEN 6
        WHEN 'sunday'    THEN 7
        ELSE 8 END, t.start_time`,
      [section_id]
    ),
};

module.exports = TimetableModel;
