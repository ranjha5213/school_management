#!/usr/bin/env python3
"""
patch_timetable_views.py

Adds teacher self-schedule + admin whole-school timetable views.

Everything in one run:
  models/timetableModel.js           → byTeacher(), schoolGrid()
  controllers/timetableController.js → myTeachingSchedule(), schoolTimetable() + exports
  routes/timetable.js                → GET /my-schedule (teacher), GET /school (admin)

Also verifies TeacherModel.findByUserId exists.

Idempotent: re-running does nothing if all three are already present.
Backs up each modified file. Runs node --check after writing.
"""

import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SUFFIX = f".bak.{datetime.now().strftime('%Y%m%d-%H%M%S')}"

MODEL      = ROOT / "models" / "timetableModel.js"
CONTROLLER = ROOT / "controllers" / "timetableController.js"
ROUTES     = ROOT / "routes" / "timetable.js"
TEACHER    = ROOT / "models" / "teacherModel.js"


def fail(msg):
    print(f"✗ {msg}", file=sys.stderr)
    sys.exit(1)


def backup_and_write(p, text):
    b = p.with_suffix(p.suffix + SUFFIX)
    shutil.copy2(p, b)
    p.write_text(text, encoding="utf-8")
    print(f"  • backup → {b.name}")
    print(f"  ✓ wrote {p.name}")


def syntax_check(p):
    try:
        r = subprocess.run(["node", "--check", str(p)],
                           capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        print(f"  ⚠ node not on PATH — skipped {p.name}")
        return
    if r.returncode != 0:
        fail(f"node --check failed for {p}:\n{r.stderr}")
    print(f"  ✓ node --check {p.name}")


def read(p):
    if not p.exists():
        fail(f"missing file: {p}")
    return p.read_text(encoding="utf-8")


# ═══════════════════════════════════════════════════════════════════════
# 1. Verify TeacherModel.findByUserId exists
# ═══════════════════════════════════════════════════════════════════════
def ensure_teacher_find_by_user_id():
    print("Checking models/teacherModel.js …")
    src = read(TEACHER)

    if "findByUserId" in src:
        print("  ℹ TeacherModel.findByUserId already present")
        return

    # insert after the last method — look for `list:` or first method
    m = re.search(r"(\n\s+findById\s*:\s*\([^)]*\)\s*=>[\s\S]*?,\n)", src)
    if not m:
        # fallback — insert before the closing `};\n\nmodule.exports`
        anchor = "};\n\nmodule.exports"
        idx = src.find(anchor)
        if idx == -1:
            fail("could not find insertion point in teacherModel.js")
        insert = "\n  findByUserId: (user_id) =>\n    get(`SELECT * FROM teachers WHERE user_id = ?`, [user_id]),\n"
        new_src = src[:idx] + insert + src[idx:]
    else:
        insert = (
            "\n\n  findByUserId: (user_id) =>\n"
            "    get(`SELECT * FROM teachers WHERE user_id = ?`, [user_id]),"
        )
        new_src = src[:m.end()] + insert + src[m.end():]

    backup_and_write(TEACHER, new_src)
    syntax_check(TEACHER)


# ═══════════════════════════════════════════════════════════════════════
# 2. models/timetableModel.js — add byTeacher + schoolGrid
# ═══════════════════════════════════════════════════════════════════════
BY_TEACHER = """  byTeacher: (teacher_id) =>
    all(
      `SELECT t.id, t.day_of_week, t.start_time, t.end_time,
              sub.id AS subject_id, sub.subject_name,
              sec.id AS section_id, sec.section_name,
              c.id AS class_id, c.class_name
         FROM timetables t
         LEFT JOIN subjects sub ON sub.id = t.subject_id
         LEFT JOIN sections sec ON sec.id = t.section_id
         LEFT JOIN classes c   ON c.id = sec.class_id
        WHERE t.teacher_id = ? AND t.is_active = 1
        ORDER BY CASE LOWER(t.day_of_week)
          WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
          WHEN 'sunday' THEN 7 ELSE 8 END,
          t.start_time`,
      [teacher_id]
    ),

"""

SCHOOL_GRID = """  schoolGrid: () =>
    all(
      `SELECT c.id AS class_id, c.class_name,
              sec.id AS section_id, sec.section_name,
              t.id, t.day_of_week, t.start_time, t.end_time,
              sub.subject_name,
              u.name AS teacher_name
         FROM timetables t
         LEFT JOIN sections sec ON sec.id = t.section_id
         LEFT JOIN classes c   ON c.id = sec.class_id
         LEFT JOIN subjects sub ON sub.id = t.subject_id
         LEFT JOIN teachers te ON te.id = t.teacher_id
         LEFT JOIN users u    ON u.id = te.user_id
        WHERE t.is_active = 1
        ORDER BY c.id, sec.section_name,
          CASE LOWER(t.day_of_week)
            WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
            WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
            WHEN 'sunday' THEN 7 ELSE 8 END,
          t.start_time`
    ),

"""


def patch_model():
    print("\nPatching models/timetableModel.js …")
    src = read(MODEL)

    anchor = "  weeklyForSection: (section_id) =>"
    if anchor not in src:
        fail("weeklyForSection anchor not found in timetableModel.js")

    changed = False
    if "byTeacher:" not in src:
        src = src.replace(anchor, BY_TEACHER + anchor, 1)
        print("  + added byTeacher")
        changed = True
    else:
        print("  ℹ byTeacher already present")

    if "schoolGrid:" not in src:
        src = src.replace(anchor, SCHOOL_GRID + anchor, 1)
        print("  + added schoolGrid")
        changed = True
    else:
        print("  ℹ schoolGrid already present")

    if changed:
        backup_and_write(MODEL, src)
        syntax_check(MODEL)


# ═══════════════════════════════════════════════════════════════════════
# 3. controllers/timetableController.js — add handlers + exports
# ═══════════════════════════════════════════════════════════════════════
MY_TEACHING = """const myTeachingSchedule = async (req, res, next) => {
  try {
    const TeacherModel = require('../models/teacherModel');
    const teacher = await TeacherModel.findByUserId(req.user.id);
    if (!teacher) return apiResponse(res, 403, false, 'Not a teacher');
    const rows = await TimetableModel.byTeacher(teacher.id);
    return apiResponse(res, 200, true, 'My teaching schedule', rows);
  } catch (e) { next(e); }
};

"""

SCHOOL_TIMETABLE = """const schoolTimetable = async (req, res, next) => {
  try {
    const rows = await TimetableModel.schoolGrid();
    return apiResponse(res, 200, true, 'School timetable', rows);
  } catch (e) { next(e); }
};

"""


def patch_controller():
    print("\nPatching controllers/timetableController.js …")
    src = read(CONTROLLER)
    anchor = "module.exports = {"
    if anchor not in src:
        fail("module.exports not found in timetableController.js")

    changed = False

    if "const myTeachingSchedule" not in src:
        src = src.replace(anchor, MY_TEACHING + anchor, 1)
        print("  + added myTeachingSchedule handler")
        changed = True
    else:
        print("  ℹ myTeachingSchedule already present")

    if "const schoolTimetable" not in src:
        src = src.replace(anchor, SCHOOL_TIMETABLE + anchor, 1)
        print("  + added schoolTimetable handler")
        changed = True
    else:
        print("  ℹ schoolTimetable already present")

    # exports
    exports_m = re.search(r"module\.exports\s*=\s*\{([^}]*)\}", src)
    if not exports_m:
        fail("module.exports block not found")
    exports_body = exports_m.group(1)

    additions = []
    if "myTeachingSchedule" not in exports_body:
        additions.append("  myTeachingSchedule,")
    if "schoolTimetable" not in exports_body:
        additions.append("  schoolTimetable,")

    if additions:
        new_body = exports_body.rstrip().rstrip(",") + ",\n" + "\n".join(additions) + "\n"
        src = src[:exports_m.start(1)] + new_body + src[exports_m.end(1):]
        print(f"  + exports: {', '.join(a.strip().rstrip(',') for a in additions)}")
        changed = True
    else:
        print("  ℹ exports already complete")

    if changed:
        backup_and_write(CONTROLLER, src)
        syntax_check(CONTROLLER)


# ═══════════════════════════════════════════════════════════════════════
# 4. routes/timetable.js — add /my-schedule and /school before /:id
# ═══════════════════════════════════════════════════════════════════════
def patch_routes():
    print("\nPatching routes/timetable.js …")
    src = read(ROUTES)

    anchor = "router.get('/:id',"
    if anchor not in src:
        fail("router.get('/:id', anchor not found in routes/timetable.js")

    new_routes = """router.get('/my-schedule',
  authorize('teacher'),
  c.myTeachingSchedule);

router.get('/school',
  authorize('admin'),
  c.schoolTimetable);

"""

    changed = False
    if "router.get('/my-schedule'" in src:
        print("  ℹ /my-schedule already present")
    else:
        src = src.replace(anchor, new_routes + anchor, 1)
        print("  + added GET /my-schedule")
        changed = True

    if "router.get('/school'" in src and "router.get('/my-schedule'" not in src:
        # /school was added but /my-schedule wasn't — insert my-schedule before /:id
        src = src.replace(anchor,
            "router.get('/my-schedule',\n  authorize('teacher'),\n  c.myTeachingSchedule);\n\n"
            + anchor, 1)
        print("  + added missing GET /my-schedule")
        changed = True
    elif "router.get('/school'" in src:
        print("  ℹ /school already present")

    if changed:
        backup_and_write(ROUTES, src)
        syntax_check(ROUTES)


# ═══════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════
def main():
    if not (ROOT / "models").is_dir():
        fail("run from the backend project root")

    ensure_teacher_find_by_user_id()
    patch_model()
    patch_controller()
    patch_routes()

    print("\n" + "═" * 60)
    print("  DONE")
    print("═" * 60)
    print("\nNew endpoints:")
    print("  GET /api/timetable/my-schedule   (teacher)")
    print("  GET /api/timetable/school         (admin)")
    print("\nRestart the server (nodemon does it automatically).")
    print("\nQuick tests:")
    print("""
  ADMIN_TOKEN=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login \\
    -H 'Content-Type: application/json' \\
    -d '{"email":"ranjha5213@gmail.com","password":"Mmaf09m032."}' \\
    | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("token",""))')

  TEACHER_TOKEN=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login \\
    -H 'Content-Type: application/json' \\
    -d '{"email":"hafiz.mati@school.local","password":"Mmaf09m032."}' \\
    | python3 -c 'import sys,json;print((json.load(sys.stdin).get("data") or {}).get("token",""))')

  curl -s http://127.0.0.1:5000/api/timetable/my-schedule -H "Authorization: Bearer $TEACHER_TOKEN" | python3 -m json.tool | head
  curl -s http://127.0.0.1:5000/api/timetable/school      -H "Authorization: Bearer $ADMIN_TOKEN"   | python3 -m json.tool | head
""")


if __name__ == "__main__":
    main()
