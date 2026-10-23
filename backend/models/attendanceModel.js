const { run, get, all } = require('../config/database');

const AttendanceModel = {
  insert: (d) =>
    run(
      `INSERT INTO attendance (student_id, date, status, remarks, marked_by, marked_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [d.student_id, d.date, d.status, d.remarks || null, d.marked_by || null]
    ),

  bulkInsert: async (records, marked_by) => {
    const out = [];
    for (const r of records) out.push(await AttendanceModel.insert({ ...r, marked_by }));
    return out;
  },

  sectionDateLocked: (section_id, date) =>
    get(
      `SELECT a.id, a.marked_by, a.marked_at, u.name AS marked_by_name
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       LEFT JOIN users u ON a.marked_by = u.id
       WHERE s.section_id = ? AND a.date = ? AND a.superseded_by IS NULL
       LIMIT 1`,
      [section_id, date]
    ),

  findByDate: (date, section_id) => {
    if (section_id) {
      return all(
        `SELECT a.*, u.name AS student_name, s.roll_number,
                m.name AS marked_by_name
         FROM attendance a
         JOIN students s ON a.student_id = s.id
         JOIN users u ON s.user_id = u.id
         LEFT JOIN users m ON a.marked_by = m.id
         WHERE a.date = ? AND s.section_id = ? AND a.superseded_by IS NULL
         ORDER BY u.name`,
        [date, section_id]
      );
    }
    return all(`SELECT * FROM attendance WHERE date = ?`, [date]);
  },

  updateRemarks: (student_id, date, remarks, user_id) =>
    run(
      `UPDATE attendance SET remarks = ?
       WHERE student_id = ? AND date = ?
         AND (marked_by = ?
              OR EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'admin'))`,
      [remarks || null, student_id, date, user_id, user_id]
    ),

  findByStudent: (student_id, { from, to, limit = 100 } = {}) => {
    let sql = `SELECT * FROM attendance WHERE student_id = ? AND superseded_by IS NULL AND superseded_by IS NULL`;
    const p = [student_id];
    if (from) { sql += ` AND date >= ?`; p.push(from); }
    if (to)   { sql += ` AND date <= ?`; p.push(to); }
    sql += ` ORDER BY date DESC LIMIT ?`;
    p.push(limit);
    return all(sql, p);
  },

  summary: (student_id) =>
    get(
      `SELECT COUNT(*) AS total_days,
              SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present_days,
              SUM(CASE WHEN status='absent'  THEN 1 ELSE 0 END) AS absent_days,
              SUM(CASE WHEN status='late'    THEN 1 ELSE 0 END) AS late_days,
              SUM(CASE WHEN status='excused' THEN 1 ELSE 0 END) AS excused_days,
              ROUND(SUM(CASE WHEN status IN ('present','late') THEN 1.0 ELSE 0 END)
                    * 100.0 / NULLIF(COUNT(*),0), 2) AS attendance_percentage
       FROM attendance WHERE student_id = ? AND superseded_by IS NULL`,
      [student_id]
    ),

  classSummary: (section_id, from, to) =>
    all(
      `SELECT s.id AS student_id, u.name AS student_name,
              SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present_days,
              SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END) AS absent_days,
              COUNT(a.id) AS total_days
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN attendance a ON s.id = a.student_id AND a.date BETWEEN ? AND ? AND a.superseded_by IS NULL
       WHERE s.section_id = ?
       GROUP BY s.id, u.name`,
      [from, to, section_id]
    ),

  today: () =>
    get(
      `SELECT SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN status='absent'  THEN 1 ELSE 0 END) AS absent,
              COUNT(*) AS total
       FROM attendance WHERE date = DATE('now') AND superseded_by IS NULL`
    ),

  supersedeBySectionDate: async (section_id, date, by_user_id) => {
    const row = await get(
      `SELECT COUNT(*) AS c FROM attendance a
         JOIN students s ON a.student_id = s.id
        WHERE s.section_id = ? AND a.date = ? AND a.superseded_by IS NULL`,
      [section_id, date]
    );
    await run(
      `UPDATE attendance
          SET superseded_by = ?, superseded_at = CURRENT_TIMESTAMP
        WHERE date = ?
          AND superseded_by IS NULL
          AND student_id IN (SELECT id FROM students WHERE section_id = ?)`,
      [by_user_id || null, date, section_id]
    );
    return row?.c || 0;
  },

  findByStudentAndDate: (student_id, date) =>
    get(
      `SELECT * FROM attendance
        WHERE student_id = ? AND date = ? AND superseded_by IS NULL`,
      [student_id, date]
    ),

  updateStatusRemarks: (student_id, date, status, remarks, by_user_id) =>
    run(
      `UPDATE attendance
          SET status = ?, remarks = ?
        WHERE student_id = ? AND date = ? AND superseded_by IS NULL`,
      [status, remarks, student_id, date]
    ),
};

module.exports = AttendanceModel;
