// services/smsService.js
//
// Sends SMS via `termux-sms-send` (Termux:API on Android).
// Falls back to a no-op if SMS_ENABLED=0.
//
// Design:
//   • normalizePhone()    — accepts 03XXXXXXXXX, +92…, +… formats
//   • queue()             — inserts into sms_log and dispatches async
//   • sendAttendanceSms() — template renderer for attendance
//   • sendMcqResultSms()  — template renderer for MCQ results
//   • rate limiter        — SMS_RATE_LIMIT_PER_DAY per phone per day
//   • daily dedup         — one SMS per (kind, student) per day
//
// A successful send updates sms_log.status → 'sent'.
// A failed send updates status → 'failed' with the error.
// The caller never blocks on the send.

const { run, get } = require('../config/database');
const { spawn }      = require('child_process');

const ENABLED    = process.env.SMS_ENABLED !== '0';
const RATE_LIMIT = Number(process.env.SMS_RATE_LIMIT_PER_DAY || 5);
const SIM_SLOT   = process.env.SMS_SIM_SLOT ? Number(process.env.SMS_SIM_SLOT) : null;

// ─── Phone normalizer ────────────────────────────────────────────────
function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-()]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^03\d{9}$/.test(s)) s = '+92' + s.slice(1);   // PK local → E.164
  if (!s.startsWith('+')) return null;
  if (s.length < 10 || s.length > 16) return null;
  return s;
}

// ─── Tiny template engine ────────────────────────────────────────────
function render(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return (v === undefined || v === null) ? '' : String(v);
  });
}

// ─── Rate limiter ────────────────────────────────────────────────────
async function rateOk(phone) {
  const row = await get(
    `SELECT COUNT(*) AS c FROM sms_log
      WHERE to_phone = ?
        AND status IN ('sent','queued')
        AND date(created_at) = date('now')`,
    [phone]
  );
  return (row?.c || 0) < RATE_LIMIT;
}

// ─── Transport: termux-sms-send ──────────────────────────────────────
function sendViaTermux(phone, body) {
  return new Promise((resolve) => {
    const args = [];
    if (SIM_SLOT !== null) args.push('-s', String(SIM_SLOT));
    args.push('-n', phone);
    args.push(body);

    const child = spawn('termux-sms-send', args, { stdio: 'ignore' });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      resolve(err ? { ok: false, error: err.message || String(err) } : { ok: true });
    };

    child.on('error', finish);
    child.on('exit', (code) => {
      if (code === 0) finish();
      else finish(new Error(`termux-sms-send exited with code ${code}`));
    });

    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish(new Error('timeout after 20s'));
    }, 20_000);
  });
}

// ─── Dispatch one row ────────────────────────────────────────────────
async function dispatch(row) {
  if (!ENABLED) {
    await run(
      `UPDATE sms_log SET status='skipped', error='SMS_ENABLED=0', attempts=attempts+1 WHERE id=?`,
      [row.id]
    );
    return;
  }

  await run(`UPDATE sms_log SET attempts = attempts + 1 WHERE id = ?`, [row.id]);

  const result = await sendViaTermux(row.to_phone, row.body);

  if (result.ok) {
    await run(
      `UPDATE sms_log SET status='sent', sent_at=CURRENT_TIMESTAMP, error=NULL WHERE id=?`,
      [row.id]
    );
    console.log(`[sms] sent → ${row.to_phone} (${row.kind} #${row.id})`);
  } else {
    await run(
      `UPDATE sms_log SET status='failed', error=? WHERE id=?`,
      [String(result.error).slice(0, 500), row.id]
    );
    console.log(`[sms] FAILED → ${row.to_phone}: ${result.error}`);
  }
}

// ─── Public: queue one SMS ──────────────────────────────────────────
async function queue({ toPhone, body, kind, studentId = null, refId = null }) {
  if (!ENABLED) return { ok: false, reason: 'disabled' };

  const phone = normalizePhone(toPhone);
  if (!phone) {
    console.log(`[sms] invalid phone for ${studentId}: ${JSON.stringify(toPhone)}`);
    return { ok: false, reason: 'invalid phone' };
  }

  if (!(await rateOk(phone))) {
    console.log(`[sms] rate limit hit for ${phone} (${kind})`);
    return { ok: false, reason: 'rate limited' };
  }

  // Dedup: same (kind, student) already queued/sent today?
  if (studentId != null) {
    const dup = await get(
      `SELECT id FROM sms_log
        WHERE kind = ? AND student_id = ?
          AND status IN ('queued','sent')
          AND sent_on = date('now')`,
      [kind, studentId]
    );
    if (dup) {
      console.log(`[sms] duplicate skipped: ${kind} student=${studentId} → ${phone}`);
      return { ok: false, reason: 'duplicate' };
    }
  }

  const r = await run(
    `INSERT INTO sms_log (to_phone, body, kind, student_id, ref_id, status, sent_on)
     VALUES (?, ?, ?, ?, ?, 'queued', date('now'))`,
    [phone, String(body).slice(0, 480), kind, studentId, refId]
  );

  // fire and forget
  setImmediate(async () => {
    try {
      const row = await get(`SELECT * FROM sms_log WHERE id = ?`, [r.lastID]);
      if (row) await dispatch(row);
    } catch (e) {
      console.error('[sms] dispatch error:', e);
    }
  });

  return { ok: true, id: r.lastID, phone };
}

// ─── Convenience senders ────────────────────────────────────────────
async function sendAttendanceSms({ student, status, date, markedBy }) {
  const body = render(
    process.env.SMS_TPL_ATTENDANCE ||
      'Dear Parent, {name} ({class_name}-{section_name}) is marked {status} on {date}. — GHS Dhori',
    {
      name: student.student_name || student.name || 'Student',
      class_name: student.class_name || '',
      section_name: student.section_name || '',
      status, date,
      marked_by: markedBy || 'School',
    }
  );
  return queue({
    toPhone: student.guardian_phone,
    body,
    kind: 'attendance',
    studentId: student.id,
    refId: null,
  });
}

async function sendMcqResultSms({ student, exam, attempt }) {
  const totalMarks = (exam?.marks_per_question || 1) * (exam?.total_questions || 0) || '—';
  const body = render(
    process.env.SMS_TPL_MCQ ||
      'Dear Parent, {name} scored {score}/{total} on "{exam}" ({correct} correct, {wrong} wrong, {blank} blank). — GHS Dhori',
    {
      name: student.student_name || student.name || 'Student',
      exam: exam?.title || 'MCQ exam',
      score: attempt.score ?? 0,
      total: totalMarks,
      correct: attempt.correct_count ?? 0,
      wrong: attempt.wrong_count ?? 0,
      blank: attempt.blank_count ?? 0,
    }
  );
  return queue({
    toPhone: student.guardian_phone,
    body,
    kind: 'mcq_result',
    studentId: student.id,
    refId: attempt.id,
  });
}

module.exports = {
  ENABLED,
  normalizePhone,
  queue,
  sendAttendanceSms,
  sendMcqResultSms,
};
