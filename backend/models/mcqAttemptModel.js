const { run, get, all } = require('../config/database');

const McqAttemptModel = {
  create: ({ mcq_exam_id, student_id, total_questions, time_limit_seconds }) =>
    run(
      `INSERT INTO mcq_attempts
         (mcq_exam_id, student_id, total_questions, time_limit_seconds, status)
       VALUES (?, ?, ?, ?, 'in_progress')`,
      [mcq_exam_id, student_id, total_questions, time_limit_seconds]
    ),

  findById: (id) =>
    get(
      `SELECT a.*,
              u.name AS student_name, s.roll_number,
              e.title AS exam_title, e.marks_per_question, e.negative_marks,
              e.class_id, e.section_id, e.subject_id
         FROM mcq_attempts a
         JOIN students s ON a.student_id = s.id
         JOIN users    u ON s.user_id     = u.id
         JOIN mcq_exams e ON a.mcq_exam_id = e.id
        WHERE a.id = ?`,
      [id]
    ),

  findByExamAndStudent: (mcq_exam_id, student_id) =>
    get(
      `SELECT * FROM mcq_attempts WHERE mcq_exam_id = ? AND student_id = ?`,
      [mcq_exam_id, student_id]
    ),

  listByExam: (mcq_exam_id) =>
    all(
      `SELECT a.*, u.name AS student_name, s.roll_number 
         FROM mcq_attempts a 
         JOIN students s ON a.student_id = s.id 
         JOIN users u ON s.user_id = u.id 
        WHERE a.mcq_exam_id = ? 
        ORDER BY a.started_at DESC`,
      [mcq_exam_id]
    ),

  listByStudent: (student_id) =>
    all(
      `SELECT a.*, e.title AS exam_title, e.total_questions AS exam_total,
              e.class_id, e.section_id
         FROM mcq_attempts a
         JOIN mcq_exams e ON a.mcq_exam_id = e.id
        WHERE a.student_id = ?
        ORDER BY a.started_at DESC`,
      [student_id]
    ),

  submit: (id, { answers, score, correct_count, wrong_count, blank_count }) =>
    run(
      `UPDATE mcq_attempts
          SET answers       = ?,
              score         = ?,
              correct_count = ?,
              wrong_count   = ?,
              blank_count   = ?,
              status        = 'submitted',
              submitted_at  = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'in_progress'`,
      [JSON.stringify(answers || {}), score, correct_count, wrong_count, blank_count, id]
    ),

  setFlaggedCount: (id, count) =>
    run(`UPDATE mcq_attempts SET flagged_count = ? WHERE id = ?`, [count, id]),

  markFlagged: (id) =>
    run(`UPDATE mcq_attempts SET status = 'flagged' WHERE id = ? AND status = 'submitted'`, [id]),

  review: (id, by_user_id, note, new_status) =>
    run(
      `UPDATE mcq_attempts
          SET reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
              review_note = ?, status = COALESCE(?, status)
        WHERE id = ?`,
      [by_user_id, note || null, new_status || null, id]
    ),

  logEvent: ({ attempt_id, kind, payload = null }) =>
    run(
      `INSERT INTO proctoring_events (attempt_id, kind, payload)
       VALUES (?, ?, ?)`,
      [attempt_id, kind, payload ? JSON.stringify(payload) : null]
    ),

  listEvents: (attempt_id) =>
    all(
      `SELECT * FROM proctoring_events
        WHERE attempt_id = ?
        ORDER BY at ASC, id ASC`,
      [attempt_id]
    ),

  countFlaggedEvents: (attempt_id) =>
    get(
      `SELECT COUNT(*) AS c FROM proctoring_events
        WHERE attempt_id = ?
          AND kind IN ('tab_hidden','blur','fullscreen_exit','copy','paste',
                       'face_missing','face_multiple','face_mismatch','gaze_away')`,
      [attempt_id]
    ),

  statsForExam: (mcq_exam_id) =>
    get(
      `SELECT
         COUNT(*)                                        AS total_attempts,
         SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
         SUM(CASE WHEN status = 'flagged'   THEN 1 ELSE 0 END) AS flagged,
         AVG(CASE WHEN status IN ('submitted','flagged') THEN score END) AS avg_score,
         MAX(score)                                      AS high_score,
         MIN(CASE WHEN status IN ('submitted','flagged') THEN score END) AS low_score
       FROM mcq_attempts
        WHERE mcq_exam_id = ?`,
      [mcq_exam_id]
    ),

  nextRecordingSeq: (attempt_id) =>
    get(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
         FROM proctoring_recordings WHERE attempt_id = ?`,
      [attempt_id]
    ),

  addRecordingChunk: ({ attempt_id, seq, file_url, size_bytes, mime_type }) =>
    run(
      `INSERT INTO proctoring_recordings
         (attempt_id, seq, file_url, size_bytes, mime_type)
       VALUES (?, ?, ?, ?, ?)`,
      [attempt_id, seq, file_url, size_bytes || null, mime_type || 'video/webm']
    ),

  listRecordingChunks: (attempt_id) =>
    all(
      `SELECT id, seq, file_url, size_bytes, mime_type, created_at
         FROM proctoring_recordings
        WHERE attempt_id = ?
        ORDER BY seq ASC`,
      [attempt_id]
    ),

  totalRecordingBytes: (attempt_id) =>
    get(
      `SELECT COALESCE(SUM(size_bytes), 0) AS total
         FROM proctoring_recordings WHERE attempt_id = ?`,
      [attempt_id]
    ),
};

module.exports = McqAttemptModel;

