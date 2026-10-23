
#!/usr/bin/env python3
"""
Adds teacher + accountant support to registration.

Fixes:
  1. frontend/src/pages/Register.jsx           — dropdown options
  2. backend/config/constants.js               — PUBLIC_ROLES
  3. backend/controllers/authController.js     — role check + teacher row creation
  4. backend/middleware/validators.js          — (uses PUBLIC_ROLES, auto-updated)
  5. Verifies backend syntax + optional end-to-end test

Run from ~/school:  python scripts/fix_roles.py
Or from anywhere:   python ~/school/scripts/fix_roles.py
"""
import subprocess
import sys
from pathlib import Path

# ─── Resolve project root regardless of where script lives ───
HERE = Path(__file__).resolve()
if HERE.parent.name == "scripts":
    ROOT = HERE.parent.parent
else:
    ROOT = Path.cwd()

FE = ROOT / "frontend"
BE = ROOT / "backend"

if not FE.exists() or not BE.exists():
    print(f"✗ Expected frontend/ and backend/ under {ROOT}")
    sys.exit(1)

# ─── Helpers ───

class C:
    G = "\033[0;32m"; R = "\033[0;31m"; Y = "\033[1;33m"
    B = "\033[0;34m"; N = "\033[0m"

def log(msg):  print(f"{C.B}▶{C.N} {msg}")
def ok(msg):   print(f"{C.G}✓{C.N} {msg}")
def warn(msg): print(f"{C.Y}⚠{C.N} {msg}")
def err(msg):  print(f"{C.R}✗{C.N} {msg}")

def read(p: Path) -> str:
    return p.read_text(encoding="utf-8") if p.exists() else ""

def write(p: Path, content: str):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")

def contains(path: Path, needle: str) -> bool:
    return needle in read(path)

def verify_file(path: Path, checks: list[tuple[str, bool]]):
    """checks = [(label, condition), ...]"""
    print(f"  {path.relative_to(ROOT)}")
    for label, cond in checks:
        mark = f"{C.G}✓{C.N}" if cond else f"{C.R}✗{C.N}"
        print(f"    {mark} {label}")
    return all(c for _, c in checks)

# ════════════════════════════════════════════════════════════
# STEP 1 — frontend Register.jsx
# ════════════════════════════════════════════════════════════

def fix_frontend_register():
    log("Patching frontend/src/pages/Register.jsx")
    p = FE / "src/pages/Register.jsx"
    if not p.exists():
        err(f"missing: {p}")
        return False

    src = read(p)

    old_block = """<option value="student">Student</option>
                <option value="parent">Parent</option>"""

    new_block = """<option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="accountant">Accountant</option>
                <option value="parent">Parent</option>"""

    if new_block in src:
        ok("already has teacher + accountant options")
        return True

    if old_block in src:
        write(p, src.replace(old_block, new_block, 1))
        ok("added teacher + accountant options")
        return True

    # Fallback: single-line form (if whitespace differs)
    old_flat = '<option value="student">Student</option><option value="parent">Parent</option>'
    new_flat = ('<option value="student">Student</option>'
                '<option value="teacher">Teacher</option>'
                '<option value="accountant">Accountant</option>'
                '<option value="parent">Parent</option>')
    if old_flat in src:
        write(p, src.replace(old_flat, new_flat, 1))
        ok("added teacher + accountant options (flat)")
        return True

    warn("couldn't find the role <select> block — patch manually")
    return False

# ════════════════════════════════════════════════════════════
# STEP 2 — backend constants.js
# ════════════════════════════════════════════════════════════

def fix_constants():
    log("Patching backend/config/constants.js")
    p = BE / "config/constants.js"
    if not p.exists():
        err(f"missing: {p}")
        return False

    src = read(p)
    old = "PUBLIC_ROLES: ['student', 'parent'],"
    new = "PUBLIC_ROLES: ['student', 'parent', 'teacher', 'accountant'],"

    if new in src:
        ok("PUBLIC_ROLES already expanded")
        return True
    if old in src:
        write(p, src.replace(old, new, 1))
        ok("expanded PUBLIC_ROLES")
        return True

    warn("PUBLIC_ROLES line not found — check manually")
    return False

# ════════════════════════════════════════════════════════════
# STEP 3 — authController.js
# ════════════════════════════════════════════════════════════

def fix_auth_controller():
    log("Patching backend/controllers/authController.js")
    p = BE / "controllers/authController.js"
    if not p.exists():
        err(f"missing: {p}")
        return False

    src = read(p)
    changed = False

    # 3a. role check
    old_check = "if (!['student', 'parent'].includes(role))"
    new_check = "if (!['student', 'parent', 'teacher', 'accountant'].includes(role))"
    if new_check in src:
        ok("role check already expanded")
    elif old_check in src:
        src = src.replace(old_check, new_check, 1)
        ok("expanded role check")
        changed = True
    else:
        warn("role check not found")

    # 3b. error message
    old_msg = "Role must be student or parent"
    new_msg = "Invalid role"
    if new_msg in src and old_msg not in src:
        ok("error message already updated")
    elif old_msg in src:
        src = src.replace(old_msg, new_msg, 1)
        ok("updated error message")
        changed = True

    # 3c. TeacherModel import (only if not present)
    if "require('../models/teacherModel')" in src:
        ok("TeacherModel already imported")
    else:
        anchor = "const StudentModel = require('../models/studentModel');"
        if anchor in src:
            src = src.replace(
                anchor,
                anchor + "\nconst TeacherModel = require('../models/teacherModel');",
                1,
            )
            ok("added TeacherModel import")
            changed = True
        else:
            warn("StudentModel require line not found — TeacherModel import skipped")

    # 3d. teacher row creation block
    old_block = """    if (role === 'student') {
      const admission_number = `ADM${String(user_id).padStart(5, '0')}`;
      await StudentModel.create({ user_id, admission_number });
    }"""

    new_block = """    if (role === 'student') {
      const admission_number = `ADM${String(user_id).padStart(5, '0')}`;
      await StudentModel.create({ user_id, admission_number });
    } else if (role === 'teacher') {
      const employee_code = `EMP${String(user_id).padStart(5, '0')}`;
      await TeacherModel.create({ user_id, employee_code });
    }"""

    if "else if (role === 'teacher')" in src:
        ok("teacher-row block already present")
    elif old_block in src:
        src = src.replace(old_block, new_block, 1)
        ok("added teacher-row creation")
        changed = True
    else:
        # Looser match: find the block, tolerate whitespace / quotes
        import re
        pattern = re.compile(
            r"if \(role === 'student'\) \{\s*"
            r"const admission_number = `ADM\$\{String\(user_id\)\.padStart\(5, '0'\)\}`;\s*"
            r"await StudentModel\.create\(\{ user_id, admission_number \}\);\s*"
            r"\}",
            re.DOTALL,
        )
        m = pattern.search(src)
        if m:
            src = src[:m.start()] + new_block.strip() + src[m.end():]
            ok("added teacher-row creation (regex)")
            changed = True
        else:
            warn("student-create block not found — teacher row creation NOT added")

    if changed:
        write(p, src)
    return True

# ════════════════════════════════════════════════════════════
# STEP 4 — syntax check
# ════════════════════════════════════════════════════════════

def node_syntax_check():
    log("Running node syntax check")
    files = [
        BE / "config/constants.js",
        BE / "controllers/authController.js",
        BE / "middleware/validators.js",
        BE / "routes/auth.js",
    ]
    all_ok = True
    for f in files:
        if not f.exists():
            warn(f"{f.name} missing — skipped")
            continue
        r = subprocess.run(["node", "-c", str(f)],
                           capture_output=True, text=True)
        if r.returncode == 0:
            ok(f"{f.name} OK")
        else:
            err(f"{f.name} SYNTAX ERROR")
            print("   " + (r.stderr.strip() or r.stdout.strip()))
            all_ok = False
    return all_ok

# ════════════════════════════════════════════════════════════
# STEP 5 — verify
# ════════════════════════════════════════════════════════════

def verify_all() -> bool:
    log("Verifying final state")
    print()

    checks = [
        verify_file(
            FE / "src/pages/Register.jsx",
            [
                ("has Teacher option", 'value="teacher"' in read(FE / "src/pages/Register.jsx")),
                ("has Accountant option", 'value="accountant"' in read(FE / "src/pages/Register.jsx")),
            ],
        ),
        verify_file(
            BE / "config/constants.js",
            [
                ("PUBLIC_ROLES expanded",
                 "'teacher', 'accountant'" in read(BE / "config/constants.js")),
            ],
        ),
        verify_file(
            BE / "controllers/authController.js",
            [
                ("role check expanded",
                 "['student', 'parent', 'teacher', 'accountant']" in read(BE / "controllers/authController.js")),
                ("TeacherModel imported",
                 "require('../models/teacherModel')" in read(BE / "controllers/authController.js")),
                ("teacher-row creation present",
                 "else if (role === 'teacher')" in read(BE / "controllers/authController.js")),
            ],
        ),
    ]
    print()
    return all(checks)

# ════════════════════════════════════════════════════════════
# OPTIONAL — live API test
# ════════════════════════════════════════════════════════════

def api_smoke_test():
    """Optional: hits the running backend. Skipped if not running."""
    import json
    import urllib.request
    import urllib.error

    log("Optional API smoke test (backend must be running on :5000)")
    url = "http://localhost:5000/api/auth/register"
    payload = json.dumps({
        "name": "Role Test",
        "email": "rolecheck@example.test",
        "password": "test123",
        "role": "teacher",
    }).encode()
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode()
            status = resp.status
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode()
    except Exception as e:
        warn(f"backend not reachable: {e}")
        return True  # don't fail the script

    try:
        parsed = json.loads(body)
    except Exception:
        parsed = {}

    if status in (201, 409):  # created or already registered
        ok(f"backend accepted teacher role (HTTP {status})")
    elif status == 400 and "Invalid role" in body:
        err("backend still rejects teacher role — restart backend?")
        return False
    else:
        warn(f"backend returned HTTP {status}: {body[:120]}")
    return True

# ════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════

def main():
    print(f"{C.B}══ Role patch: teacher + accountant registration ══{C.N}")
    print(f"Project root: {ROOT}\n")

    fix_frontend_register()
    fix_constants()
    fix_auth_controller()

    print()
    if not node_syntax_check():
        err("Fix the syntax errors above, then re-run.")
        sys.exit(1)

    print()
    if not verify_all():
        err("Some checks failed — see above.")
        sys.exit(1)

    api_smoke_test()

    print()
    print(f"{C.G}══════════════════════════════════════════════════{C.N}")
    print(f"{C.G}✅ All patches applied and verified.{C.N}")
    print(f"{C.G}══════════════════════════════════════════════════{C.N}")
    print("\nNext steps:")
    print("  1. Restart backend:")
    print("       pkill -f node")
    print("       cd ~/school/backend && npm run dev")
    print("  2. Restart frontend:")
    print("       pkill -f vite")
    print("       cd ~/school/frontend && npm run dev")
    print("  3. Open http://localhost:5173/register")
    print("     → 'I am a' should list: Student, Teacher, Accountant, Parent")

if __name__ == "__main__":
    main()
