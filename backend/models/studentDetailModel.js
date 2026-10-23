const { get, all } = require('../config/database');

const StudentDetailModel = {
  profile: (student_id) =>
    get(
      `SELECT s.*, u.name, u.email, u.phone, u.avatar_url,
              c.id AS class_id, c.class_name, c.class_code,
              sec.id AS section_id, sec.section_name, sec.room_number
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       WHERE s.id = ?`,
      [student_id]
    ),

  fees: (student_id) =>
    all(
      `SELECT * FROM invoices WHERE student_id = ? ORDER BY created_at DESC LIMIT 100`,
      [student_id]
    ).catch(() => []),

  homework: (student_id) =>
    all(
      `SELECT h.id AS homework_id, h.title, h.description, h.due_date,
              h.attachment_url, h.created_at,
              hs.submission_date, hs.attachment_url AS submitted_file,
              hs.remarks AS submission_remarks,
              sub.subject_name
       FROM homework h
       JOIN sections sec ON h.class_id = sec.class_id
       JOIN students s ON s.section_id = sec.id AND s.id = ?
       LEFT JOIN homework_submissions hs ON hs.homework_id = h.id AND hs.student_id = s.id
       LEFT JOIN subjects sub ON h.subject_id = sub.id
       ORDER BY h.due_date DESC LIMIT 200`,
      [student_id]
    ).catch(() => []),

  exams: (student_id) =>
    all(
      `SELECT em.id, em.marks_obtained, em.total_marks, em.remarks,
              em.entered_at,
              e.exam_name, e.start_date, e.end_date,
              sub.subject_name, et.type_name
       FROM exam_marks em
       JOIN exams e ON em.exam_id = e.id
       LEFT JOIN exam_types et ON e.exam_type_id = et.id
       LEFT JOIN subjects sub ON em.subject_id = sub.id
       WHERE em.student_id = ?
       ORDER BY e.start_date DESC LIMIT 200`,
      [student_id]
    ).catch(() => []),
};

module.exports = StudentDetailModel;
