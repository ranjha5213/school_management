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
//
// Column conventions (keep these consistent — do not mix):
//   created_at  — when the row was queued (DEFAULT CURRENT_TIMESTAMP)
//   sent_at     — when the SMS was actually delivered to termux-sms-send
//   day_key     — date(created_at), used for rate-limit + dedup
//   attempts    — number of dispatch attempts
//   status      — 'queued' | 'sent' | 'failed' | 'skipped'
//   error       — last error string (nullable)

const { run, get } = require('../config/database');
const { spawn } = require('child_process');

// ─── Config (read once, validated) ───────────────────────────────────
const ENABLED = process.env.SMS_ENABLED !== '0';

const RATE_LIMIT = (() => {
  const n = Number(process.env.SMS_RATE_LIMIT_PER_DAY);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 5;
})();

const SIM_SLOT = (() => {
  const raw = process.env.SMS_SIM_SLOT;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
})();

const MAX_BODY_LEN = 480;      // soft cap; termux/carrier will further split
const SEND_TIMEOUT_MS = 20_000;

// ─── Logger (swap for a real one in prod) ────────────────────────────
const log = {
  info: (...a) => console.log('[sms]', ...a),
  warn: (...a) => console.warn('[sms]', ...a),
  error: (...a) => console.error('[sms]', ...a),
};

// ─── Phone normalizer ────────────────────────────────────────────────
function normalizePhone(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim().replace(/[\s\-()]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^03\d{9}$/.test(s)) s = '+92' + s.slice(1); // PK local → E.164
  if (!s.startsWith('+')) return null;
  if (!/^\+\d{9,15}$/.test(s)) return null;        // + followed by 9–15 digits
  return s;
}

// ─── Tiny template engine ────────────────────────────────────────────
function render(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? '' : String(v);
  });
}

function sanitizeBody(body) {
  // Strip NUL bytes (would break spawn args) and collapse control chars
  // except newlines/tabs.
  let s = String(body).replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  if (s.length > MAX_BODY_LEN) {
    log.warn(`body truncated ${s.length} → ${MAX_BODY_LEN}`);
    s = s.slice(0, MAX_BODY_LEN);
  }
  return s;
}

// ─── Rate limiter (uses created_at, same column as dedup) ────────────
async function rateOk(phone) {
  try {
    const row = await get(
      `SELECT COUNT(*) AS c FROM sms_log
        WHERE to_phone = ?
          AND status IN ('sent','queued')
          AND date(created_at) = date('now')`,
      [phone]
    );
    return (row?.c || 0) < RATE_LIMIT;
  } catch (e) {
    log.error('rateOk query failed:', e);
    // Fail-open: better to try sending than to silently drop due to a DB blip.
    return true;
  }
}

// ─── Dedup check (uses created_at) ───────────────────────────────────
async function isDuplicate(kind, studentId) {
  if (studentId === null || studentId === undefined) return false;
  try {
    const dup = await get(
      `SELECT id FROM sms_log
        WHERE kind = ?
          AND student_id = ?
          AND status IN ('queued','sent')
          AND date(created_at) = date('now')
        LIMIT 1`,
      [kind, studentId]
    );
    return Boolean(dup);
  } catch (e) {
    log.error('isDuplicate query failed:', e);
    return false; // fail-open
  }
}

// ─── Transport: termux-sms-send ──────────────────────────────────────
function sendViaTermux(phone, body) {
  return new Promise((resolve) => {
    let child;
    try {
      const args = [];
      if (SIM_SLOT !== null) args.push('-s', String(SIM_SLOT));
      args.push('-n', phone, body);

      child = spawn('termux-sms-send', args, {
        stdio: 'ignore',
        env: process.env,
      });
    } catch (e) {
      return resolve({ ok: false, error: `spawn failed: ${e.message || e}` });
    }

    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(err ? { ok: false, error: err.message || String(err) } : { ok: true });
    };

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      finish(new Error(`timeout after ${SEND_TIMEOUT_MS / 1000}s`));
    }, SEND_TIMEOUT_MS);

    child.on('error', (err) => finish(new Error(`spawn error: ${err.message || err}`)));
    child.on('exit', (code, signal) => {
      if (code === 0) return finish();
      finish(new Error(`termux-sms-send exited code=${code} signal=${signal || 'none'}`));
    });
  });
}

// ─── Dispatch one row ────────────────────────────────────────────────
async function dispatch(row) {
  if (!ENABLED) {
    try {
      await run(
        `UPDATE sms_log
            SET status='skipped',
                error='SMS_ENABLED=0',
                attempts=attempts+1
          WHERE id=?`,
        [row.id]
      );
    } catch (e) {
      log.error(`dispatch(skip) update failed for #${row.id}:`, e);
    }
    return;
  }

  // Increment attempts up-front so a crash mid-send still counts.
  try {
    await run(`UPDATE sms_log SET attempts = attempts + 1 WHERE id = ?`, [row.id]);
  } catch (e) {
    log.error(`dispatch attempts++ failed for #${row.id}:`, e);
    // Continue — the send itself may still succeed.
  }

  let result;
  try {
    result = await sendViaTermux(row.to_phone, row.body);
  } catch (e) {
    result = { ok: false, error: e.message || String(e) };
  }

  if (result.ok) {
    try {
      await run(
        `UPDATE sms_log
            SET status='sent', sent_at=CURRENT_TIMESTAMP, error=NULL
          WHERE id=?`,
        [row.id]
      );
      log.info(`sent → ${row.to_phone} (${row.kind} #${row.id})`);
    } catch (e) {
      // The send succeeded; the bookkeeping didn't. Don't retry the send.
      log.error(`dispatch(sent) update failed for #${row.id}:`, e);
    }
  } else {
    const errMsg = String(result.error).slice(0, 500);
    try {
      await run(
        `UPDATE sms_log SET status='failed', error=? WHERE id=?`,
        [errMsg, row.id]
      );
      log.warn(`FAILED → ${row.to_phone}: ${errMsg}`);
    } catch (e) {
      log.error(`dispatch(failed) update failed for #${row.id}:`, e);
    }
  }
}

// ─── Public: queue one SMS ──────────────────────────────────────────
async function queue({ toPhone, body, kind, studentId = null, refId = null }) {
  if (!ENABLED) return { ok: false, reason: 'disabled' };

  if (!kind) return { ok: false, reason: 'missing kind' };
  if (body === undefined || body === null || String(body).trim() === '') {
    return { ok: false, reason: 'empty body' };
  }

  const phone = normalizePhone(toPhone);
  if (!phone) {
    log.warn(`invalid phone for student=${studentId}: ${JSON.stringify(toPhone)}`);
    return { ok: false, reason: 'invalid phone' };
  }

  if (!(await rateOk(phone))) {
    log.warn(`rate limit hit for ${phone} (${kind})`);
    return { ok: false, reason: 'rate limited' };
  }

  if (await isDuplicate(kind, studentId)) {
    log.info(`duplicate skipped: ${kind} student=${studentId} → ${phone}`);
    return { ok: false, reason: 'duplicate' };
  }

  const safeBody = sanitizeBody(body);

  let insert;
  try {
    insert = await run(
      `INSERT INTO sms_log (to_phone, body, kind, student_id, ref_id, status)
       VALUES (?, ?, ?, ?, ?, 'queued')`,
      [phone, safeBody, kind, studentId, refId]
    );
  } catch (e) {
    // Most likely a UNIQUE-violation from a race on dedup.
    log.error(`insert sms_log failed (${kind} student=${studentId}):`, e);
    return { ok: false, reason: 'db insert failed' };
  }

  const rowId = insert?.lastID;
  if (!rowId) {
    log.error('insert sms_log returned no lastID');
    return { ok: false, reason: 'db insert failed' };
  }

  // Fire and forget.
  setImmediate(async () => {
    try {
      const row = await get(`SELECT * FROM sms_log WHERE id = ?`, [rowId]);
      if (!row) {
        log.error(`dispatch: row #${rowId} not found after insert`);
        return;
      }
      await dispatch(row);
    } catch (e) {
      log.error(`dispatch error for #${rowId}:`, e);
    }
  });

  return { ok: true, id: rowId, phone };
}

// ─── Convenience senders ────────────────────────────────────────────
async function sendAttendanceSms({ student, status, date, markedBy }) {
  try {
    if (!student) return { ok: false, reason: 'no student' };
    const body = render(
      process.env.SMS_TPL_ATTENDANCE ||
        'Dear Parent, {name} ({class_name}-{section_name}) is marked {status} on {date}. — GHS Dhori',
      {
        name: student.student_name || student.name || 'Student',
        class_name: student.class_name || '',
        section_name: student.section_name || '',
        status: status || '',
        date: date || '',
        marked_by: markedBy || 'School',
      }
    );
    return await queue({
      toPhone: student.guardian_phone,
      body,
      kind: 'attendance',
      studentId: student.id,
      refId: null,
    });
  } catch (e) {
    log.error('sendAttendanceSms failed:', e);
    return { ok: false, reason: 'exception', error: e.message };
  }
}

async function sendMcqResultSms({ student, exam, attempt }) {
  try {
    if (!student || !attempt) return { ok: false, reason: 'missing student/attempt' };

    const perQ = Number(exam?.marks_per_question || 1);
    const totalQ = Number(exam?.total_questions || 0);
    const totalMarks = perQ && totalQ ? perQ * totalQ : '—';

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

    return await queue({
      toPhone: student.guardian_phone,
      body,
      kind: 'mcq_result',
      studentId: student.id,
      refId: attempt.id ?? null,
    });
  } catch (e) {
    log.error('sendMcqResultSms failed:', e);
    return { ok: false, reason: 'exception', error: e.message };
  }
}

module.exports = {
  ENABLED,
  normalizePhone,
  render,
  queue,
  sendAttendanceSms,
  sendMcqResultSms,
  // Exposed for tests / advanced callers:
  _sendViaTermux: sendViaTermux,
  _dispatch: dispatch,
  _sanitizeBody: sanitizeBody,
};
