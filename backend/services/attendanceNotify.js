// services/attendanceNotify.js
//
// Policy layer for attendance SMS.
//
// Entry point:
//   • notifyAttendance({ records, date, markedBy }) — bulk or single
//
// Rules (edit here, not in smsService):
//   • Only 'absent' and 'late' trigger SMS (not 'present', not 'excused').
//   • One SMS per (kind='attendance', student_id, day) — enforced by the
//     uq_sms_kind_student_ref_day index (ref_id IS NULL for attendance,
//     so COALESCE(ref_id,0) makes it one-per-student-per-day).
//   • Students with no guardian_phone are skipped silently (logged).
//   • Concurrency bounded to 4 so a 40-student class doesn't fork 40
//     termux-sms-send processes simultaneously.
//
// Never throws. Never blocks the caller.

const { all } = require('../config/database');
const sms = require('./smsService');
const log = require('../utils/logger');

// ────────────────────────────────────────────────────────────────────────────
// Policy — which statuses trigger an SMS.
// ────────────────────────────────────────────────────────────────────────────

const NOTIFY_STATUSES = new Set(['absent', 'late']);

function shouldNotify(status) {
  return NOTIFY_STATUSES.has(String(status || '').toLowerCase());
}

// ────────────────────────────────────────────────────────────────────────────
// Shape loader — must match exactly what smsService.sendAttendanceSms reads:
//   { id, student_name, guardian_phone, class_name, section_name }
// ────────────────────────────────────────────────────────────────────────────

function loadStudentShapes(studentIds) {
  if (!studentIds.length) return Promise.resolve([]);
  const ph = studentIds.map(() => '?').join(',');
  return all(
    `SELECT s.id,
            COALESCE(u.name, s.name_en, 'Student') AS student_name,
            s.guardian_phone                        AS guardian_phone,
            c.class_name                            AS class_name,
            sec.section_name                        AS section_name
       FROM students s
       JOIN users    u   ON u.id  = s.user_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN classes  c   ON c.id   = sec.class_id
      WHERE s.id IN (${ph})`,
    studentIds
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point.
//
//   records  = [{ student_id, status, date? }]
//   date     = fallback date for records that don't carry one
//   markedBy = display name for the {marked_by} template var
//
// Returns { fired, skipped } for logging; callers should ignore it.
// ────────────────────────────────────────────────────────────────────────────

async function notifyAttendance({ records, date, markedBy }) {
  try {
    const input = Array.isArray(records) ? records : [];
    if (!input.length) return { fired: 0, skipped: 0 };

    // Filter by policy BEFORE touching the DB — cheap and avoids
    // loading shapes for the 95% "present" rows.
    const toNotify = input.filter(
      (r) => r && r.student_id != null && shouldNotify(r.status)
    );
    const skipped = input.length - toNotify.length;

    if (!toNotify.length) {
      return { fired: 0, skipped };
    }

    // Dedup within this batch (same student twice in one payload).
    const seen = new Set();
    const unique = [];
    for (const r of toNotify) {
      if (seen.has(r.student_id)) continue;
      seen.add(r.student_id);
      unique.push(r);
    }

    // Load all student shapes in one query.
    let students;
    try {
      students = await loadStudentShapes(unique.map((r) => r.student_id));
    } catch (e) {
      log.error('[attendanceNotify] shape load failed:', e);
      return { fired: 0, skipped: input.length, error: e.message };
    }
    const byId = new Map(students.map((s) => [s.id, s]));

    // Bound concurrency: 4 parallel termux-sms-send processes max.
    const CONCURRENCY = 4;
    let idx = 0;
    let fired = 0;

    const worker = async () => {
      while (idx < unique.length) {
        const rec = unique[idx++];
        const student = byId.get(rec.student_id);

        if (!student) {
          log.warn(
            `[attendanceNotify] student ${rec.student_id} not found — skipped`
          );
          continue;
        }
        if (!student.guardian_phone) {
          log.info(
            `[attendanceNotify] student ${student.id} has no guardian_phone — skipped`
          );
          continue;
        }

        try {
          const result = await sms.sendAttendanceSms({
            student,
            status: rec.status,
            date: rec.date || date,
            markedBy: markedBy || 'School',
          });
          if (result.ok) fired++;
          else {
            log.info(
              `[attendanceNotify] queued=false reason=${result.reason} ` +
              `student=${student.id} status=${rec.status}`
            );
          }
        } catch (e) {
          log.error(
            `[attendanceNotify] sendAttendanceSms threw for student=${student.id}:`,
            e
          );
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker)
    );

    return { fired, skipped: input.length - fired };
  } catch (e) {
    log.error('[attendanceNotify] notifyAttendance crashed:', e);
    return { fired: 0, skipped: 0, error: e.message };
  }
}

module.exports = { notifyAttendance, shouldNotify, NOTIFY_STATUSES };
