const { run, get, all } = require('../config/database');

const ClassModel = {
  // ─── Classes ───
  listClasses: () =>
    all(
      `SELECT c.id, c.class_name, c.class_code, c.created_at,
              COUNT(DISTINCT sec.id) AS section_count,
              COUNT(DISTINCT s.id)   AS student_count
       FROM classes c
       LEFT JOIN sections sec ON sec.class_id = c.id
       LEFT JOIN students s   ON s.section_id = sec.id
       GROUP BY c.id, c.class_name, c.class_code
       ORDER BY c.class_name`
    ),

  findClass: (id) => get(`SELECT * FROM classes WHERE id = ?`, [id]),

  classHasSections: (id) =>
    get(`SELECT COUNT(*) AS c FROM sections WHERE class_id = ?`, [id]).then((r) => (r?.c || 0) > 0),

  createClass: ({ class_name, class_code = null }) =>
    run(`INSERT INTO classes (class_name, class_code) VALUES (?, ?)`, [class_name, class_code]),

  updateClass: (id, { class_name, class_code }) =>
    run(`UPDATE classes SET class_name = ?, class_code = ? WHERE id = ?`,
        [class_name, class_code, id]),

  removeClass: (id) => run(`DELETE FROM classes WHERE id = ?`, [id]),

  // ─── Sections ───
  listSections: (class_id) =>
    all(
      `SELECT sec.id, sec.section_name, sec.room_number, sec.class_id,
              COUNT(s.id) AS student_count
       FROM sections sec
       LEFT JOIN students s ON s.section_id = sec.id
       WHERE sec.class_id = ?
       GROUP BY sec.id, sec.section_name, sec.room_number
       ORDER BY sec.section_name`,
      [class_id]
    ),

  findSection: (id) => get(`SELECT * FROM sections WHERE id = ?`, [id]),

  sectionHasStudents: (id) =>
    get(`SELECT COUNT(*) AS c FROM students WHERE section_id = ?`, [id]).then((r) => (r?.c || 0) > 0),

  sectionNameTaken: (class_id, section_name, except_id = null) =>
    get(
      `SELECT id FROM sections
       WHERE class_id = ? AND LOWER(section_name) = LOWER(?)
         AND (? IS NULL OR id != ?)`,
      [class_id, section_name, except_id, except_id]
    ),

  createSection: ({ class_id, section_name, room_number = null }) =>
    run(`INSERT INTO sections (class_id, section_name, room_number) VALUES (?, ?, ?)`,
        [class_id, section_name, room_number]),

  updateSection: (id, { section_name, room_number }) =>
    run(`UPDATE sections SET section_name = ?, room_number = ? WHERE id = ?`,
        [section_name, room_number, id]),

  removeSection: (id) => run(`DELETE FROM sections WHERE id = ?`, [id]),

  // ─── Bulk create sections (A, B, C ...) ───
  bulkCreateSections: async (class_id, names) => {
    const created = [];
    for (const name of names) {
      const trimmed = String(name).trim().toUpperCase();
      if (!trimmed) continue;
      const exists = await ClassModel.sectionNameTaken(class_id, trimmed);
      if (exists) continue;
      const { lastID } = await ClassModel.createSection({
        class_id, section_name: trimmed,
      });
      created.push({ id: lastID, section_name: trimmed });
    }
    return created;
  },

  // ─── Browse ───
  studentsInSection: (section_id) =>
    all(
      `SELECT s.id, u.name AS student_name, u.email,
              s.admission_number, s.roll_number, s.gender
       FROM students s
       JOIN users u ON s.user_id = u.id
       WHERE s.section_id = ?
       ORDER BY s.roll_number, u.name`,
      [section_id]
    ),
};

module.exports = ClassModel;
