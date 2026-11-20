// services/mcqNotify.js
//
// Policy layer for MCQ result SMS.
//
// Two entry points, both non-blocking and never-throwing:
//   • notifyMcqAttempt({ attempt })        — online attempt (mcq_attempts row)
//   • notifyMcqSubmission({ submission })  — paper scan  (mcq_submissions row)
//
// Rules (edit here, not in smsService):
//   • 'flagged' attempts are held until review resolves them.
//   • Dedup: one SMS per (kind='mcq_result', student_id, ref_id, day)
//     — relies on the uq_sms_kind_student_ref_day index (migration 004).
//   • If the student has no guardian_phone, skip silently (logged).
//
// All failures are logged and swallowed. The caller (controller) must never
// see a throw from this module.

const { get } = require('../config/database');
const sms = require('./smsService');
const log = require('../utils/logger');

// ────────────────────────────────────────────────────────────────────────────
// Shape loaders — must match exactly what smsService.sendMcqResultSms reads.
//   student: { id, student_name, guardian_phone, class_name, section_name }
//   exam:    { id, title, total_questions, marks_per_question }
// ────────────────────────────────────────────────────────────────────────────

function loadStudentShape(studentId) {
  return get(
    `SELECT s.id,
            COALESCE(u.name, s.name_en, 'Student') AS student_name,
            s.guardian_phone                        AS guardian_phone,
            c.class_name                            AS class_name,
            sec.section_name                        AS section_name
       FROM students s
       JOIN users    u   ON u.id  = s.user_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN classes  c   ON c.id   = sec.class_id
      WHERE s.id = ?`,
    [studentId]
  );
}

function loadExamShape(examId) {
  return get(
    `SELECT id, title, total_questions, marks_per_question
       FROM mcq_exams
      WHERE id = ?`,
    [examId]
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Core — all entry points funnel through here.
// ────────────────────────────────────────────────────────────────────────────

async function _notify({ studentId, examId, attempt }) {
  // ── Guard: invalid attempt ──
  if (!attempt || attempt.id == null) {
    log.warn('[mcqNotify] attempt missing id — skipped');
    return { ok: false, reason: 'invalid attempt' };
  }

  // ── Guard: no student (unmatched submission) ──
  if (!studentId) {
    log.info(`[mcqNotify] no student_id for attempt #${attempt.id} — skipped`);
    return { ok: false, reason: 'unmatched' };
  }

  // ── Guard: flagged attempts must wait for review ──
  if (attempt.status === 'flagged') {
    log.info(`[mcqNotify] attempt ${attempt.id} is flagged — hold until review`);
    return { ok: false, reason: 'flagged' };
  }

  // ── Load shapes ──
  let student, exam;
  try {
    [student, exam] = await Promise.all([
      loadStudentShape(studentId),
      loadExamShape(examId),
    ]);
  } catch (e) {
    log.error(`[mcqNotify] shape load failed for attempt #${attempt.id}:`, e);
    return { ok: false, reason: 'db error', error: e.message };
  }

  if (!student) {
    log.warn(`[mcqNotify] student ${studentId} not found — skipped`);
    return { ok: false, reason: 'student not found' };
  }
  if (!exam) {
    log.warn(`[mcqNotify] exam ${examId} not found — skipped`);
    return { ok: false, reason: 'exam not found' };
  }
  if (!student.guardian_phone) {
    log.info(`[mcqNotify] student ${student.id} has no guardian_phone — skipped`);
    return { ok: false, reason: 'no guardian phone' };
  }

  // ── Delegate to smsService ──
  let result;
  try {
    result = await sms.sendMcqResultSms({ student, exam, attempt });
  } catch (e) {
    log.error(`[mcqNotify] sendMcqResultSms threw for attempt #${attempt.id}:`, e);
    return { ok: false, reason: 'exception', error: e.message };
  }

  if (!result.ok) {
    log.info(
      `[mcqNotify] queued=false reason=${result.reason} ` +
      `attempt=${attempt.id} student=${student.id}`
    );
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point 1 — online attempt (mcq_attempts row)
//
// Expect at minimum: { id, mcq_exam_id, student_id, status,
//                      score, correct_count, wrong_count, blank_count }
// Pass the FRESH row from McqAttemptModel.findById(id) so status, score,
// and all counters are the final committed values.
// ────────────────────────────────────────────────────────────────────────────

async function notifyMcqAttempt({ attempt }) {
  try {
    if (!attempt) return { ok: false, reason: 'no attempt' };
    return await _notify({
      studentId: attempt.student_id,
      examId: attempt.mcq_exam_id,
      attempt,
    });
  } catch (e) {
    log.error('[mcqNotify] notifyMcqAttempt crashed:', e);
    return { ok: false, reason: 'exception', error: e.message };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point 2 — paper-scan submission (mcq_submissions row)
//
// Expect at minimum: { id, mcq_exam_id, student_id, status,
//                      score, correct_count, wrong_count, blank_count }
// Only fires when status === 'confirmed'. Pass the FRESH row from
// McqModel.findSubmission(id) after updateSubmission().
// ────────────────────────────────────────────────────────────────────────────

async function notifyMcqSubmission({ submission }) {
  try {
    if (!submission) return { ok: false, reason: 'no submission' };

    // Paper scans stay 'pending'/'unmatched'/'failed' until an admin confirms.
    // Never text the parent about an unconfirmed OCR result.
    if (submission.status !== 'confirmed') {
      log.info(
        `[mcqNotify] submission ${submission.id} status=${submission.status} ` +
        `— not confirmed, skipped`
      );
      return { ok: false, reason: 'not confirmed' };
    }

    return await _notify({
      studentId: submission.student_id,
      examId: submission.mcq_exam_id,
      attempt: {
        id: submission.id,
        status: submission.status,
        score: submission.score,
        correct_count: submission.correct_count,
        wrong_count: submission.wrong_count,
        blank_count: submission.blank_count,
      },
    });
  } catch (e) {
    log.error('[mcqNotify] notifyMcqSubmission crashed:', e);
    return { ok: false, reason: 'exception', error: e.message };
  }
}

module.exports = { notifyMcqAttempt, notifyMcqSubmission };
