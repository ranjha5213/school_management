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

  // 👇 UPDATED: Added 'sort' to the destructured parameters
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
    
    // 👇 UPDATED: Dynamic ORDER BY logic
    if (sort === 'name') {
      sql += ' ORDER BY u.name ASC';
    } else {
      // Default: Sort by roll number numerically (CAST to INTEGER ensures 2 comes before 10)
      sql += ' ORDER BY CAST(s.roll_number AS INTEGER) ASC, u.name ASC';
    }

    return all(sql, params);
  },

  update: async (id, patch) => {
    // Split: users-table fields go to users; everything else on students.
    const {
      name, email, phone,          // → users
      ...studentPatch
    } = patch;

    const STUDENT_COLS = [
      'section_id', 'roll_number', 'gender', 'dob',
      'guardian_name', 'guardian_phone',
      'name_en', 'guardian_name_en',
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
      userSets.push('email = ?');
      userVals.push(String(email).trim());
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
    // 1. Check if student exists first
    const student = await get(`SELECT user_id FROM students WHERE id = ?`, [id]);
    if (!student) return { changes: 0 };

    if (cascade) {
      // 2. Delete child records first to satisfy Foreign Keys
      
      // Fees/Payments: Delete payments first (linked to invoice), then invoices
      await run(`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE student_id = ?)`, [id]);
      await run(`DELETE FROM invoices WHERE student_id = ?`, [id]);
      
      // Academics & Attendance
      await run(`DELETE FROM attendance WHERE student_id = ?`, [id]);
      await run(`DELETE FROM exam_marks WHERE student_id = ?`, [id]);
      
      // Homework
      await run(`DELETE FROM homework_submissions WHERE student_id = ?`, [id]);
      
      // MCQ / Online Exams
      await run(`DELETE FROM mcq_attempts WHERE student_id = ?`, [id]);
      await run(`DELETE FROM mcq_submissions WHERE student_id = ?`, [id]);
      
      // Library
      await run(`DELETE FROM book_issues WHERE student_id = ?`, [id]);
      
      // Parent Links
      await run(`DELETE FROM parent_students WHERE student_id = ?`, [id]);
    }

    // 3. Delete the student record
    const result = await run(`DELETE FROM students WHERE id = ?`, [id]);

    // 4. Delete the parent user record (this is what they log in with)
    await run(`DELETE FROM users WHERE id = ?`, [student.user_id]);

    return result;
  },
};

module.exports = StudentModel;
