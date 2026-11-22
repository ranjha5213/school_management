// models/studentModel.js
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
      `SELECT s.*, u.name, u.email, u.phone
       FROM students s JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`,
      [id]
    ),

  findByUserId: (user_id) =>
    get(`SELECT * FROM students WHERE user_id = ?`, [user_id]),

  list: ({ section_id, class_id, sort } = {}) => {
    let sql = `SELECT s.*, u.name AS student_name, u.email, u.phone, sec.section_name, c.class_name
               FROM students s
               JOIN users u ON s.user_id = u.id
               LEFT JOIN sections sec ON s.section_id = sec.id
               LEFT JOIN classes c ON sec.class_id = c.id`;
    const where = [];
    const params = [];
    if (section_id) { where.push('s.section_id = ?'); params.push(section_id); }
    if (class_id)   { where.push('sec.class_id = ?'); params.push(class_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');

    if (sort === 'name') {
      sql += ' ORDER BY u.name ASC';
    } else {
      sql += ' ORDER BY CAST(s.roll_number AS INTEGER) ASC, u.name ASC';
    }

    return all(sql, params);
  },

  update: async (id, patch) => {
    const {
      name, email, phone,          // → users
      ...studentPatch
    } = patch;

    // ✅ status / is_active included so suspend/readmit work
    const STUDENT_COLS = [
      'section_id', 'roll_number', 'gender', 'dob',
      'guardian_name', 'guardian_phone',
      'name_en', 'guardian_name_en',
      'status', 'is_active',
    ];
    const validKeys = Object.keys(studentPatch).filter((k) => STUDENT_COLS.includes(k));

    // ── users table (name / email / phone) ──
    const userSets = [];
    const userVals = [];
    if (name !== undefined && name !== null && String(name).trim() !== '') {
      userSets.push('name = ?');
      userVals.push(String(name).trim());
    }
    if (email !== undefined && email !== null && String(email).trim() !== '') {
      const trimmedEmail = String(email).trim();
      // ✅ uniqueness check on update
      const conflict = await get(
        `SELECT u.id FROM users u
         JOIN students s ON s.user_id = u.id
         WHERE u.email = ? AND s.id != ?`,
        [trimmedEmail, id]
      );
      if (conflict) {
        const err = new Error('Email is already in use by another user');
        err.status = 409;
        err.code = 'EMAIL_IN_USE';
        throw err;
      }
      userSets.push('email = ?');
      userVals.push(trimmedEmail);
    }
    if (phone !== undefined) {
      userSets.push('phone = ?');
      userVals.push(phone ? String(phone).trim() : null);
    }
    if (userSets.length) {
      userVals.push(id);
      await run(
        `UPDATE users SET ${userSets.join(', ')}
          WHERE id = (SELECT user_id FROM students WHERE id = ?)`,
        userVals
      );
    }

    // ── students table ──
    if (!validKeys.length) return { changes: 0 };
    const sql = `UPDATE students SET ${validKeys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...validKeys.map((k) => studentPatch[k]), id]);
  },

  remove: async (id, cascade = false) => {
    const student = await get(`SELECT user_id FROM students WHERE id = ?`, [id]);
    if (!student) return { changes: 0, found: false };

    if (cascade) {
      // Tolerate missing optional tables; surface any other error
      const safeRun = async (sql, params) => {
        try { await run(sql, params); }
        catch (e) {
          if (String(e.message).includes('no such table')) return;
          throw e;
        }
      };

      await safeRun(`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE student_id = ?)`, [id]);
      await safeRun(`DELETE FROM invoices WHERE student_id = ?`, [id]);
      await safeRun(`DELETE FROM attendance WHERE student_id = ?`, [id]);
      await safeRun(`DELETE FROM exam_marks WHERE student_id = ?`, [id]);
      await safeRun(`DELETE FROM homework_submissions WHERE student_id = ?`, [id]);
      await safeRun(`DELETE FROM mcq_attempts WHERE student_id = ?`, [id]);
      await safeRun(`DELETE FROM mcq_submissions WHERE student_id = ?`, [id]);
      await safeRun(`DELETE FROM book_issues WHERE student_id = ?`, [id]);
      await safeRun(`DELETE FROM parent_students WHERE student_id = ?`, [id]);
    }

    const result = await run(`DELETE FROM students WHERE id = ?`, [id]);
    await run(`DELETE FROM users WHERE id = ?`, [student.user_id]);

    return { ...result, found: true };
  },
};

module.exports = StudentModel;
