const { get, all } = require('../config/database');

const TeacherDetailModel = {
  profile: (teacher_id) =>
    get(
      `SELECT t.*, u.name, u.email, u.phone, u.avatar_url
       FROM teachers t JOIN users u ON t.user_id = u.id
       WHERE t.id = ?`,
      [teacher_id]
    ),

  sections: (teacher_id) =>
    all(
      `SELECT DISTINCT sec.id AS section_id, sec.section_name,
              c.id AS class_id, c.class_name, c.class_code
       FROM timetables t
       JOIN sections sec ON t.section_id = sec.id
       JOIN classes c ON sec.class_id = c.id
       WHERE t.teacher_id = ?
       ORDER BY c.class_name, sec.section_name`,
      [teacher_id]
    ).catch(() => []),

  timetable: (teacher_id) =>
    all(
      `SELECT t.*, sub.subject_name, sec.section_name, c.class_name
       FROM timetables t
       LEFT JOIN subjects sub ON t.subject_id = sub.id
       LEFT JOIN sections sec ON t.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       WHERE t.teacher_id = ?
       ORDER BY CASE t.day_of_week
         WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
         WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6
         ELSE 7 END, t.start_time`,
      [teacher_id]
    ).catch(() => []),

  homeworkPosted: (teacher_id) =>
    all(
      `SELECT h.*, sub.subject_name, c.class_name
       FROM homework h
       LEFT JOIN subjects sub ON h.subject_id = sub.id
       LEFT JOIN classes c ON sub.class_id = c.id
       WHERE h.teacher_id = ?
       ORDER BY h.created_at DESC LIMIT 200`,
      [teacher_id]
    ).catch(() => []),

  attendanceMarked: (teacher_id) =>
    all(
      `SELECT a.date,
              COUNT(*) AS total,
              SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END) AS absent
       FROM attendance a
       WHERE a.marked_by = ?
       GROUP BY a.date
       ORDER BY a.date DESC LIMIT 60`,
      [teacher_id]
    ).catch(() => []),
};

module.exports = TeacherDetailModel;
