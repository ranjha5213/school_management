const { run, get, all } = require('../config/database');

const McqModel = {
  // ─── Exams ───
  listExams: () =>
    all(
      `SELECT e.*, c.class_name, sec.section_name, sub.subject_name,
              u.name AS created_by_name,
              (SELECT COUNT(*) FROM mcq_questions WHERE mcq_exam_id = e.id) AS question_count,
              (SELECT COUNT(*) FROM mcq_submissions WHERE mcq_exam_id = e.id) AS submission_count
       FROM mcq_exams e
       LEFT JOIN classes c ON e.class_id = c.id
       LEFT JOIN sections sec ON e.section_id = sec.id
       LEFT JOIN subjects sub ON e.subject_id = sub.id
       LEFT JOIN users u ON e.created_by = u.id
       ORDER BY e.created_at DESC`
    ),

  findExam: (id) =>
    get(
      `SELECT e.*, c.class_name, sec.section_name, sub.subject_name
       FROM mcq_exams e
       LEFT JOIN classes c ON e.class_id = c.id
       LEFT JOIN sections sec ON e.section_id = sec.id
       LEFT JOIN subjects sub ON e.subject_id = sub.id
       WHERE e.id = ?`,
      [id]
    ),

  createExam: (d) =>
    run(
      `INSERT INTO mcq_exams
        (title, class_id, section_id, subject_id,
         total_questions, marks_per_question, negative_marks, exam_date, created_by, sheet_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.title, d.class_id, d.section_id, d.subject_id,
       d.total_questions, d.marks_per_question, d.negative_marks, d.exam_date, d.created_by,
       d.sheet_mode || 'full']
    ),

  // FIX: column whitelist — prevents SQL injection via `keys` AND guarantees
  // `schedule_state` can be updated by updateExam (needed by the controller
  // when publishing an exam).
  updateExam: (id, patch) => {
    const allowed = [
      'title', 'class_id', 'section_id', 'subject_id',
      'total_questions', 'marks_per_question', 'negative_marks',
      'exam_date', 'sheet_mode', 'is_published', 'access_code',
      'time_limit_minutes', 'proctoring_enabled',
      'scheduled_start_at', 'scheduled_end_at', 'schedule_state',
    ];
    const keys = Object.keys(patch).filter((k) => allowed.includes(k));
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE mcq_exams SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  removeExam: (id) => run(`DELETE FROM mcq_exams WHERE id = ?`, [id]),

  // ─── Questions ───
  listQuestions: (exam_id) =>
    all(
      `SELECT * FROM mcq_questions WHERE mcq_exam_id = ? ORDER BY q_number`,
      [exam_id]
    ),

  upsertQuestion: (exam_id, q) =>
    run(
      `INSERT INTO mcq_questions
        (mcq_exam_id, q_number, question_text, option_a, option_b, option_c, option_d, correct_option)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mcq_exam_id, q_number) DO UPDATE SET
         question_text = excluded.question_text,
         option_a = excluded.option_a,
         option_b = excluded.option_b,
         option_c = excluded.option_c,
         option_d = excluded.option_d,
         correct_option = excluded.correct_option`,
      [exam_id, q.q_number, q.question_text || null,
       q.option_a || null, q.option_b || null, q.option_c || null, q.option_d || null,
       q.correct_option]
    ),

  removeQuestion: (exam_id, q_number) =>
    run(`DELETE FROM mcq_questions WHERE mcq_exam_id = ? AND q_number = ?`, [exam_id, q_number]),

  // ─── Submissions ───
  listSubmissions: (exam_id) =>
    all(
      `SELECT s.*, st.roll_number AS student_roll, st.admission_number,
              u.name AS student_name_db, sec.section_name
       FROM mcq_submissions s
       LEFT JOIN students st ON s.student_id = st.id
       LEFT JOIN users u ON st.user_id = u.id
       LEFT JOIN sections sec ON st.section_id = sec.id
       WHERE s.mcq_exam_id = ?
       ORDER BY s.created_at DESC`,
      [exam_id]
    ),

  findSubmission: (id) => get(`SELECT * FROM mcq_submissions WHERE id = ?`, [id]),

  createSubmission: (d) =>
    run(
      `INSERT INTO mcq_submissions
        (mcq_exam_id, student_id, detected_roll, detected_name,
         extracted_answers, score, correct_count, wrong_count, blank_count,
         image_path, raw_gemini_response, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.mcq_exam_id, d.student_id || null, d.detected_roll || null, d.detected_name || null,
       d.extracted_answers || null, d.score ?? null, d.correct_count ?? 0, d.wrong_count ?? 0, d.blank_count ?? 0,
       d.image_path || null, d.raw_gemini_response || null, d.status || 'pending']
    ),

  updateSubmission: (id, patch) => {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE mcq_submissions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  // ─── Student matching ───
  findStudentByRollOrName: (roll, name) => {
    if (roll) {
      const byRoll = get(
        `SELECT s.id, u.name AS student_name, s.roll_number, s.admission_number
         FROM students s JOIN users u ON s.user_id = u.id
         WHERE s.roll_number = ? OR s.admission_number = ?`,
        [roll, roll]
      );
      if (byRoll) return byRoll;
    }
    if (name) {
      const byName = get(
        `SELECT s.id, u.name AS student_name, s.roll_number, s.admission_number
         FROM students s JOIN users u ON s.user_id = u.id
         WHERE LOWER(u.name) = LOWER(?) LIMIT 1`,
        [name]
      );
      if (byName) return byName;
    }
    return null;
  },

  studentsInClass: (class_id, section_id) => {
    let sql = `
      SELECT s.id, u.name AS student_name, s.roll_number, s.admission_number,
             sec.section_name, sec.id AS section_id
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN sections sec ON s.section_id = sec.id
      WHERE sec.class_id = ?
    `;
    const params = [class_id];
    if (section_id) { sql += ' AND sec.id = ?'; params.push(section_id); }
    sql += ' ORDER BY s.roll_number, u.name';
    return all(sql, params);
  },

  // ─── Student-facing: questions WITHOUT the correct answer ───
  questionsWithoutAnswers: (examId) =>
    all(
      `SELECT q_number, question_text,
              option_a, option_b, option_c, option_d
         FROM mcq_questions
        WHERE mcq_exam_id = ?
        ORDER BY q_number`,
      [examId]
    ),

  // ─── Publish / settings helpers ───
  setPublished: (examId, is_published) =>
    run(`UPDATE mcq_exams SET is_published = ? WHERE id = ?`,
        [is_published ? 1 : 0, examId]),

  setAccessCode: (examId, code) =>
    run(`UPDATE mcq_exams SET access_code = ? WHERE id = ?`,
        [code || null, examId]),

  setTimeLimit: (examId, minutes) =>
    run(`UPDATE mcq_exams SET time_limit_minutes = ? WHERE id = ?`,
        [minutes ? Number(minutes) : null, examId]),

  setProctoring: (examId, enabled) =>
    run(`UPDATE mcq_exams SET proctoring_enabled = ? WHERE id = ?`,
        [enabled ? 1 : 0, examId]),

  // ─── Scheduling ───
  // FIX: setting a schedule always unpublishes the exam, so the scheduler is
  // the ONLY path that can move it to 'open'. This satisfies the DB trigger
  // (is_published=1 <=> schedule_state='open') and prevents "published exam
  // with no live window".
  setSchedule: (examId, startAt, endAt) =>
    run(
      `UPDATE mcq_exams
          SET scheduled_start_at = ?,
              scheduled_end_at   = ?,
              schedule_state     = CASE
                WHEN ? IS NULL THEN 'draft'
                ELSE 'scheduled'
              END,
              is_published       = 0
        WHERE id = ?`,
      [startAt || null, endAt || null, startAt || null, examId]
    ),

  setScheduleState: (examId, state) =>
    run(`UPDATE mcq_exams SET schedule_state = ? WHERE id = ?`, [state, examId]),

  // FIX: atomic open/close — single UPDATE so is_published and schedule_state
  // always change together. Without this, a crash between the two writes
  // leaves the row in an invalid state that findExamsToOpen will never retry.
  openExam: (examId) =>
    run(
      `UPDATE mcq_exams
          SET is_published = 1, schedule_state = 'open'
        WHERE id = ?`,
      [examId]
    ),

  closeExam: (examId) =>
    run(
      `UPDATE mcq_exams
          SET is_published = 0, schedule_state = 'closed'
        WHERE id = ?`,
      [examId]
    ),

 findExamsToOpen: (nowIso) =>
  all(
    `SELECT * FROM mcq_exams
      WHERE schedule_state = 'scheduled'
        AND scheduled_start_at IS NOT NULL
        AND scheduled_end_at   IS NOT NULL
        AND scheduled_start_at <= ?
        AND scheduled_end_at   >  ?`,
    [nowIso, nowIso]
  ),
  // FIX: findExamsToClose also picks up stuck rows (schedule_state='open'
  // but is_published=0 should never happen, but if it does, close it).
  findExamsToClose: (nowIso) =>
    all(
      `SELECT * FROM mcq_exams
        WHERE schedule_state IN ('open', 'scheduled')
          AND scheduled_end_at IS NOT NULL
          AND scheduled_end_at <= ?
          AND (is_published = 1 OR schedule_state = 'open')`,
      [nowIso]
    ),

  studentByUserId: (userId) =>
    get(`SELECT id FROM students WHERE user_id = ?`, [userId]),
};

module.exports = McqModel;
