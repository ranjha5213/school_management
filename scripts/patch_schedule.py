import os, re, shutil, sys, datetime, json
from pathlib import Path

ROOT = Path(".").resolve()
TS   = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
BAK  = ROOT / (".patch_backup_schedule_" + TS)
BAK.mkdir(exist_ok=True)

REPORT = []  # (level, file, note)

def log(level, file, note):
    REPORT.append((level, file, note))
    tag = {"OK": "PATCHED", "SKIP": "skipped", "FAIL": "FAIL"}[level]
    print(f"  [{tag:8s}]  {file:42s}  {note}")

def read(p):
    p = ROOT / p
    return p.read_text(encoding="utf-8") if p.exists() else None

def write(p, text, why):
    p = ROOT / p
    if not p.exists():
        log("SKIP", str(p.relative_to(ROOT)), "missing"); return False
    old = p.read_text(encoding="utf-8")
    if old == text:
        log("SKIP", str(p.relative_to(ROOT)), "no change"); return False
    dst = BAK / p.name
    if not dst.exists(): shutil.copy2(p, dst)
    p.write_text(text, encoding="utf-8")
    log("OK", str(p.relative_to(ROOT)), why)
    return True

def apply(p, transform, why):
    """transform(text) -> new_text or None (None = couldn't apply)."""
    txt = read(p)
    if txt is None:
        log("SKIP", p, "missing"); return False
    try:
        new = transform(txt)
    except Exception as e:
        log("FAIL", p, f"transform error: {e}"); return False
    if new is None:
        log("SKIP", p, "pattern not found — inspect manually"); return False
    if new == txt:
        log("SKIP", p, "already applied"); return False
    return write(p, new, why)

# ================================================================
# 1. MIGRATION FILE
# ================================================================
migration_path = "backend/migrations/2026_stage5_mcq_schedule.sql"
migration_sql = """-- MCQ exam scheduling (auto-open / auto-close)
ALTER TABLE mcq_exams ADD COLUMN scheduled_start_at TEXT;
ALTER TABLE mcq_exams ADD COLUMN scheduled_end_at   TEXT;
ALTER TABLE mcq_exams ADD COLUMN schedule_state     TEXT
  CHECK (schedule_state IN ('draft','scheduled','open','closed')) DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_mcq_exams_schedule_state
  ON mcq_exams (schedule_state, scheduled_start_at, scheduled_end_at);

ALTER TABLE mcq_attempts ADD COLUMN exam_scheduled_start_at TEXT;
"""

mp = ROOT / migration_path
if mp.exists():
    log("SKIP", migration_path, "already exists")
else:
    mp.write_text(migration_sql, encoding="utf-8")
    log("OK", migration_path, "created")

# ================================================================
# 2. MODEL: add schedule helpers
# ================================================================
def model_transform(t):
    if "findExamsToOpen" in t and "setSchedule:" in t:
        return None  # already patched
    # find a place after `setProctoring:` or `setTimeLimit:`
    anchor = None
    for key in ("setProctoring:", "setTimeLimit:", "setAccessCode:", "setPublished:"):
        idx = t.find(key)
        if idx != -1:
            anchor = idx
            break
    if anchor is None:
        return None
    # find end of that method — first `,\n` at top-level after anchor
    depth = 0
    i = anchor
    while i < len(t):
        if t[i] in "{([":
            depth += 1
        elif t[i] in "})]":
            depth -= 1
        elif t[i] == "," and depth == 0:
            i += 1
            break
        i += 1
    insert_at = i
    block = """

  // ─── Scheduling ───
  setSchedule: (examId, startAt, endAt) =>
    run(
      `UPDATE mcq_exams
          SET scheduled_start_at = ?,
              scheduled_end_at   = ?,
              schedule_state     = CASE
                WHEN ? IS NULL THEN 'draft'
                ELSE 'scheduled'
              END
        WHERE id = ?`,
      [startAt || null, endAt || null, startAt || null, examId]
    ),

  setScheduleState: (examId, state) =>
    run(`UPDATE mcq_exams SET schedule_state = ? WHERE id = ?`, [state, examId]),

  findExamsToOpen: (nowIso) =>
    all(
      `SELECT * FROM mcq_exams
        WHERE schedule_state = 'scheduled'
          AND is_published = 0
          AND scheduled_start_at IS NOT NULL
          AND scheduled_start_at <= ?`,
      [nowIso]
    ),

  findExamsToClose: (nowIso) =>
    all(
      `SELECT * FROM mcq_exams
        WHERE schedule_state IN ('open','scheduled')
          AND is_published = 1
          AND scheduled_end_at IS NOT NULL
          AND scheduled_end_at <= ?`,
      [nowIso]
    ),
"""
    return t[:insert_at] + block + t[insert_at:]

apply("backend/models/mcqModel.js", model_transform, "added schedule model helpers")

# ================================================================
# 3. CONTROLLER: schedule + results handlers, exports
# ================================================================
def controller_transform(t):
    if "updateExamSchedule" in t and "getExamResults" in t:
        return None
    # Insert the two handlers just before `module.exports`
    anchor = re.search(r"\nmodule\.exports\s*=", t)
    if not anchor:
        return None
    block = """

// ─── Schedule update (teacher) ───
const updateExamSchedule = async (req, res, next) => {
  try {
    const examId = Number(req.params.id);
    const exam = await McqModel.findExam(examId);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const { scheduled_start_at, scheduled_end_at } = req.body || {};
    const isIso = (s) => s == null || s === '' || !isNaN(Date.parse(s));
    if (!isIso(scheduled_start_at) || !isIso(scheduled_end_at)) {
      return apiResponse(res, 400, false, 'Invalid date/time (ISO 8601 required)');
    }
    const start = scheduled_start_at ? new Date(scheduled_start_at) : null;
    const end   = scheduled_end_at   ? new Date(scheduled_end_at)   : null;
    if (start && end && end <= start) {
      return apiResponse(res, 400, false, 'scheduled_end_at must be after scheduled_start_at');
    }

    await McqModel.setSchedule(examId,
      start ? start.toISOString() : null,
      end   ? end.toISOString()   : null);

    const updated = await McqModel.findExam(examId);
    logger.audit(`MCQ exam scheduled: id=${examId} by user=${req.user.id}`);
    return apiResponse(res, 200, true, 'Schedule saved', { exam: updated });
  } catch (e) { next(e); }
};

// ─── Exam results + proctoring flags (teacher) ───
const getExamResults = async (req, res, next) => {
  try {
    const examId = Number(req.params.id);
    const exam = await McqModel.findExam(examId);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const attempts = await McqAttemptModel.findByExam(examId);
    const rows = [];
    for (const a of attempts) {
      let student = null, events = [];
      try { student = await StudentModel.findById(a.student_id); } catch {}
      try { events = await McqAttemptModel.listProctorEvents(a.id); } catch {}
      const kinds = events.map(e => e.kind).filter(Boolean);
      const cheatScore = kinds.filter(k =>
        ['tab_hidden','blur','copy','paste','contextmenu','fullscreen_exit'].includes(k)
      ).length;
      rows.push({
        attempt_id: a.id,
        student_id: a.student_id,
        student_name: student?.name || student?.email || `#${a.student_id}`,
        score: a.score,
        correct_count: a.correct_count,
        wrong_count: a.wrong_count,
        blank_count: a.blank_count,
        status: a.status,
        started_at: a.started_at,
        submitted_at: a.submitted_at,
        proctor_event_count: events.length,
        cheat_score: cheatScore,
        suspicious: cheatScore > 0,
        events,
      });
    }
    return apiResponse(res, 200, true, 'Results', { exam, attempts: rows });
  } catch (e) { next(e); }
};

"""
    t2 = t[:anchor.start()] + block + t[anchor.start():]
    # Add to module.exports
    m = re.search(r"(module\.exports\s*=\s*\{)([\s\S]*?)(\})", t2)
    if not m:
        return None
    inner = m.group(2).rstrip()
    if not inner.endswith(","):
        inner += ","
    inner += "\n  updateExamSchedule,\n  getExamResults,\n"
    t2 = t2[:m.start(2)] + inner + t2[m.end(2):]
    return t2

apply("backend/controllers/mcqController.js", controller_transform,
      "added updateExamSchedule + getExamResults + exports")

# ================================================================
# 4. ATTEMPT CONTROLLER: enforce schedule on startAttempt
# ================================================================
def attempt_transform(t):
    if "scheduled_start_at" in t:
        return None
    old = "if (!exam.is_published)\n      return apiResponse(res, 403, false, 'Exam is not published yet');"
    old2 = "if (!exam.is_published) return apiResponse(res, 403, false, 'Exam is not published yet');"
    replacement = """// ─── Schedule + publish-window enforcement ───
    const nowMs   = Date.now();
    const startMs = exam.scheduled_start_at ? Date.parse(exam.scheduled_start_at) : null;
    const endMs   = exam.scheduled_end_at   ? Date.parse(exam.scheduled_end_at)   : null;

    if (!exam.is_published) {
      if (exam.schedule_state === 'scheduled' && startMs != null && nowMs < startMs) {
        return apiResponse(res, 403, false, 'Exam is scheduled but has not started yet',
          { starts_at: exam.scheduled_start_at });
      }
      if (endMs != null && nowMs > endMs) {
        return apiResponse(res, 403, false, 'Exam window has ended');
      }
      return apiResponse(res, 403, false, 'Exam is not published yet');
    }
    if (endMs != null && nowMs > endMs) {
      return apiResponse(res, 403, false, 'Exam window has ended');
    }"""
    if old in t:
        return t.replace(old, replacement, 1)
    if old2 in t:
        return t.replace(old2, replacement, 1)
    return None

apply("backend/controllers/mcqAttemptController.js", attempt_transform,
      "added schedule enforcement to startAttempt")

# ================================================================
# 5. ROUTES
# ================================================================
def routes_transform(t):
    if "/:id/schedule" in t:
        return None
    # find last router.* line to append after
    lines = t.splitlines(keepends=True)
    last_router = -1
    for i, ln in enumerate(lines):
        if re.match(r"\s*router\.", ln):
            last_router = i
    if last_router == -1:
        return None
    insert_at = sum(len(l) for l in lines[:last_router + 1])
    block = """
// Teacher: schedule / unschedule
router.patch('/:id/schedule',
  authenticate, authorize('admin', 'teacher'),
  ctrl.updateExamSchedule);

// Teacher: full results + proctoring flags
router.get('/:id/results',
  authenticate, authorize('admin', 'teacher'),
  ctrl.getExamResults);
"""
    return t[:insert_at] + block + t[insert_at:]

apply("backend/routes/mcq.js", routes_transform, "added schedule + results routes")

# ================================================================
# 6. SCHEDULER FILE
# ================================================================
scheduler_path = "backend/realtime/mcqScheduler.js"
scheduler_src = """const cron = require('node-cron');
const McqModel = require('../models/mcqModel');
const logger = require('../utils/logger');

async function tick() {
  const nowIso = new Date().toISOString();
  try {
    const toOpen = await McqModel.findExamsToOpen(nowIso);
    for (const e of toOpen) {
      await McqModel.setPublished(e.id, true);
      await McqModel.setScheduleState(e.id, 'open');
      logger.audit(`MCQ auto-open: exam=${e.id} at=${nowIso}`);
    }
    const toClose = await McqModel.findExamsToClose(nowIso);
    for (const e of toClose) {
      await McqModel.setPublished(e.id, false);
      await McqModel.setScheduleState(e.id, 'closed');
      logger.audit(`MCQ auto-close: exam=${e.id} at=${nowIso}`);
    }
    if (toOpen.length || toClose.length) {
      logger.info(`MCQ scheduler: opened=${toOpen.length} closed=${toClose.length}`);
    }
  } catch (e) {
    logger.error('MCQ scheduler tick failed', e);
  }
}

function startMcqScheduler() {
  cron.schedule('*/30 * * * * *', tick);
  logger.info('MCQ scheduler started (every 30s)');
  tick();
}

module.exports = { startMcqScheduler, tick };
"""
sp = ROOT / scheduler_path
if sp.exists():
    log("SKIP", scheduler_path, "already exists")
else:
    sp.write_text(scheduler_src, encoding="utf-8")
    log("OK", scheduler_path, "created")

# ================================================================
# 7. SERVER: wire scheduler
# ================================================================
def server_transform(t):
    if "startMcqScheduler" in t:
        return None
    # 1. Add require near other requires (after the last require line)
    last_req = -1
    for m in re.finditer(r"^const\s+.+=\s+require\(.+\);?\s*$", t, re.MULTILINE):
        last_req = m.end()
    if last_req == -1:
        return None
    t = t[:last_req] + "\nconst { startMcqScheduler } = require('./realtime/mcqScheduler');" + t[last_req:]

    # 2. Call it after server listen
    listen = re.search(r"(app\.listen\([^)]*\)\.then|server\.listen\([^)]*\))\s*\([^;]*?\{\s*", t)
    if listen:
        insert = listen.end()
        t = t[:insert] + "\n  try { startMcqScheduler(); } catch (e) { console.error('scheduler init failed', e); }" + t[insert:]
    else:
        # fallback: append at end
        t = t.rstrip() + "\n\ntry { startMcqScheduler(); } catch (e) { console.error('scheduler init failed', e); }\n"
    return t

apply("backend/server.js", server_transform, "wired startMcqScheduler")

# ================================================================
# 8. FRONTEND API
# ================================================================
def api_transform(t):
    if "updateExamSchedule" in t:
        return None
    anchor = re.search(r"(export\s+const\s+mcqApi\s*=\s*\{)", t)
    if not anchor:
        return None
    insert_at = anchor.end()
    block = """
  updateExamSchedule: (id, body) => api.patch(`/mcq/${id}/schedule`, body),
  getExamResults:     (id)       => api.get(`/mcq/${id}/results`),"""
    return t[:insert_at] + block + t[insert_at:]

apply("frontend/src/api/endpoints.js", api_transform, "added schedule + results API methods")

# ================================================================
# 9. PUBLISH MODAL: add schedule block + save hook
# ================================================================
def modal_transform(t):
    if "scheduled_start_at" in t or "startAt" in t:
        return None
    # Find the export default function signature
    if "function McqPublishModal" not in t:
        return None

    # A. Add state + helpers after the first set of useState lines
    state_anchor = re.search(r"(const\s+\[\w+,\s*set\w+\]\s*=\s*useState\([^)]*\);?\s*\n)", t)
    if not state_anchor:
        return None
    extra_state = """
  const [schedule, setSchedule] = useState(!!exam.scheduled_start_at);
  const [startAt,  setStartAt]  = useState(toLocal(exam.scheduled_start_at));
  const [endAt,    setEndAt]    = useState(toLocal(exam.scheduled_end_at));
"""
    t = t[:state_anchor.end()] + extra_state + t[state_anchor.end():]

    # B. Add helper functions before the component
    helpers = """function toLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(local) { return local ? new Date(local).toISOString() : null; }

"""
    # Insert before "export default function"
    m = re.search(r"export\s+default\s+function\s+McqPublishModal", t)
    if m:
        t = t[:m.start()] + helpers + t[m.start():]

    # C. Add the schedule UI after the proctoring block — find `</label>` of proctoring
    # Simplest safe: find "proctoring" label end and insert after
    proc = re.search(r"(<Camera[\s\S]{0,600}?</label>)", t)
    if proc:
        ui = """
        {/* Schedule */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer mb-3">
          <input type="checkbox" checked={schedule}
            onChange={(e) => setSchedule(e.target.checked)} className="mt-1" />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium text-sm">
              <span>⏰</span> Schedule
            </div>
            {schedule && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500">Opens at</label>
                  <input type="datetime-local" value={startAt}
                    onChange={(e) => setStartAt(e.target.value)} className="input w-full" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Closes at</label>
                  <input type="datetime-local" value={endAt}
                    onChange={(e) => setEndAt(e.target.value)} className="input w-full" />
                </div>
              </div>
            )}
            {!schedule && (
              <div className="text-xs text-slate-500 mt-1">
                No schedule — the exam opens when you press Publish.
              </div>
            )}
          </div>
        </label>
"""
        t = t[:proc.end()] + ui + t[proc.end():]

    # D. Update save(): add schedule call
    # Find the existing `await mcqApi.updateExamSettings(...)` call
    save = re.search(r"(await\s+mcqApi\.updateExamSettings\([^;]*\);\s*)", t)
    if save:
        add = """await mcqApi.updateExamSchedule(exam.id, {
        scheduled_start_at: schedule ? toIso(startAt) : null,
        scheduled_end_at:   schedule ? toIso(endAt)   : null,
      });
      """
        t = t[:save.end()] + add + t[save.end():]
    return t

apply("frontend/src/components/McqPublishModal.jsx", modal_transform,
      "added schedule UI + save hook")

# ================================================================
# 10. APPLY MIGRATION (safe if columns already exist)
# ================================================================
db_path = ROOT / "backend/school_management.db"
if db_path.exists():
    try:
        import sqlite3
        con = sqlite3.connect(str(db_path))
        existing = {r[1] for r in con.execute("PRAGMA table_info(mcq_exams)")}
        statements = [
            ("scheduled_start_at", "ALTER TABLE mcq_exams ADD COLUMN scheduled_start_at TEXT"),
            ("scheduled_end_at",   "ALTER TABLE mcq_exams ADD COLUMN scheduled_end_at TEXT"),
            ("schedule_state",     "ALTER TABLE mcq_exams ADD COLUMN schedule_state TEXT DEFAULT 'draft'"),
        ]
        for col, sql in statements:
            if col in existing:
                continue
            try:
                con.execute(sql)
                log("OK", "backend/school_management.db", f"added column {col}")
            except Exception as e:
                log("SKIP", "backend/school_management.db", f"{col}: {e}")
        existing_att = {r[1] for r in con.execute("PRAGMA table_info(mcq_attempts)")}
        if "exam_scheduled_start_at" not in existing_att:
            try:
                con.execute("ALTER TABLE mcq_attempts ADD COLUMN exam_scheduled_start_at TEXT")
                log("OK", "backend/school_management.db", "added column exam_scheduled_start_at")
            except Exception as e:
                log("SKIP", "backend/school_management.db", f"attempts col: {e}")
        con.execute("CREATE INDEX IF NOT EXISTS idx_mcq_exams_schedule_state ON mcq_exams(schedule_state, scheduled_start_at, scheduled_end_at)")
        con.commit()
        con.close()
    except Exception as e:
        log("FAIL", "backend/school_management.db", f"migration failed: {e}")
else:
    log("SKIP", "backend/school_management.db", "not found")

# ================================================================
# 11. VERIFY
# ================================================================
print("\n" + "=" * 72)
print("VERIFY")
print("=" * 72)

def check(label, ok, hint=""):
    print(("[OK ]  " if ok else "[BAD]  ") + label)
    if not ok and hint:
        print("         -> " + hint)

all_ok = True

# Schema
try:
    con = sqlite3.connect(str(db_path))
    cols = {r[1] for r in con.execute("PRAGMA table_info(mcq_exams)")}
    check("schema: mcq_exams has schedule columns",
          {"scheduled_start_at","scheduled_end_at","schedule_state"} <= cols)
    con.close()
except Exception:
    check("schema", False, "couldn't inspect DB")

# Model helpers
m = (ROOT/"backend/models/mcqModel.js").read_text()
check("model: setSchedule + findExamsToOpen + findExamsToClose",
      all(k in m for k in ("setSchedule","findExamsToOpen","findExamsToClose")))

# Controller handlers
c = (ROOT/"backend/controllers/mcqController.js").read_text()
check("controller: updateExamSchedule + getExamResults + exports",
      "updateExamSchedule" in c and "getExamResults" in c
      and "updateExamSchedule," in c and "getExamResults," in c)

# Attempt schedule enforcement
ac = (ROOT/"backend/controllers/mcqAttemptController.js").read_text()
check("attempt-controller: enforces schedule window",
      "scheduled_start_at" in ac and "Exam window has ended" in ac)

# Routes
r = (ROOT/"backend/routes/mcq.js").read_text()
check("routes: PATCH /:id/schedule + GET /:id/results",
      "/:id/schedule" in r and "/:id/results" in r)
unguarded = [ln for ln in r.splitlines()
             if re.match(r"\s*router\.(post|put|patch|delete)\s*\(", ln)
             and "authorize" not in ln]
# lookahead: multi-line routes — check next line
lines = r.splitlines()
for i, ln in enumerate(lines):
    if re.match(r"\s*router\.(post|put|patch|delete)\s*\(", ln):
        span = "\n".join(lines[i:i+3])
        if "authorize" not in span:
            unguarded.append(ln.strip())
check("routes: all writes still guarded", len(unguarded) == 0, "; ".join(unguarded[:3]))

# Scheduler wired
s = (ROOT/"backend/server.js").read_text()
check("server: startMcqScheduler wired",
      "startMcqScheduler" in s)

# Frontend API
fe_api = (ROOT/"frontend/src/api/endpoints.js").read_text()
check("frontend: mcqApi.updateExamSchedule + getExamResults",
      "updateExamSchedule" in fe_api and "getExamResults" in fe_api)

# Publish modal
modal_path = ROOT/"frontend/src/components/McqPublishModal.jsx"
if modal_path.exists():
    mt = modal_path.read_text()
    check("modal: schedule block + save hook",
          "scheduled_start_at" in mt and "toIso" in mt)
else:
    check("modal: McqPublishModal.jsx exists", False, "file missing — create it manually (from earlier message)")

# node-cron dependency
try:
    pkg = json.loads((ROOT/"backend/package.json").read_text())
    check("deps: node-cron installed",
          "node-cron" in (pkg.get("dependencies") or {}))
except Exception:
    check("deps: package.json readable", False)

print()
print("=" * 72)
print("Backups: " + str(BAK))
print("Next steps:")
print("  cd backend && npm i node-cron       # if 'node-cron installed' was BAD")
print("  # restart the backend server")
print("=" * 72)
