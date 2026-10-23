#!/usr/bin/env python3
"""
Add Student to a Section.
Backend: POST /api/classes/sections/:sectionId/students
Frontend: "Add Student" button + modal on the Students card.

Run from ~/school:  python scripts/generate_add_student.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT = HERE.parent.parent if HERE.parent.name == "scripts" else Path.cwd()
BE = ROOT / "backend"
FE = ROOT / "frontend"


def write(base, rel, content):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")
    print(f"  ✓ {p.relative_to(ROOT)}")


def banner(m):
    print(f"\n── {m} " + "─" * max(0, 60 - len(m)))


def patch(path: Path, old: str, new: str, marker: str):
    """Replace first occurrence. Skip if marker already present."""
    if not path.exists():
        print(f"  ! missing: {path.relative_to(ROOT)}")
        return False
    src = path.read_text()
    if marker in src:
        print(f"  · already patched: {path.relative_to(ROOT)}")
        return True
    if old not in src:
        print(f"  ✗ anchor not found in {path.relative_to(ROOT)}")
        return False
    path.write_text(src.replace(old, new, 1))
    print(f"  ✓ patched {path.relative_to(ROOT)}")
    return True


# ════════════════════════════════════════════════════════════
# BACKEND
# ════════════════════════════════════════════════════════════

def gen_backend():
    banner("backend controller")

    # Patch classController.js — add addStudentToSection
    ctrl = BE / "controllers/classController.js"

    new_fn = '''
// ─── Add student directly into a section ───
const addStudentToSection = async (req, res, next) => {
  try {
    const sectionId = Number(req.params.sectionId);
    const sec = await ClassModel.findSection(sectionId);
    if (!sec) return apiResponse(res, 404, false, 'Section not found');

    const {
      name, email, password,
      roll_number, gender, dob,
      guardian_name, guardian_phone,
      admission_number: customAdm,
    } = req.body;

    if (!name || !name.trim())
      return apiResponse(res, 400, false, 'Student name required');
    if (!email || !/^\\S+@\\S+\\.\\S+$/.test(email))
      return apiResponse(res, 400, false, 'Valid email required');

    const UserModel = require('../models/userModel');
    const StudentModel = require('../models/studentModel');
    const { hash } = require('../utils/password');

    if (await UserModel.findByEmail(email))
      return apiResponse(res, 409, false, 'Email already registered');

    const password_hash = await hash(password || 'changeme123');
    const { lastID: user_id } = await UserModel.create({
      name: name.trim(),
      email: email.trim(),
      password_hash,
      role: 'student',
      status: 'active',   // admin-added students skip OTP + approval
    });

    const admission_number = customAdm && customAdm.trim()
      ? customAdm.trim()
      : `ADM${String(user_id).padStart(5, '0')}`;

    const { lastID: student_id } = await StudentModel.create({
      user_id,
      admission_number,
      section_id: sectionId,
      roll_number: roll_number || null,
      gender: gender || null,
      dob: dob || null,
      guardian_name: guardian_name || null,
      guardian_phone: guardian_phone || null,
    });

    logger.audit(`Student added: ${name} (${admission_number}) → section ${sec.section_name}`);

    return apiResponse(res, 201, true, 'Student added', {
      id: student_id,
      user_id,
      admission_number,
      name: name.trim(),
    });
  } catch (e) { next(e); }
};

module.exports = {'''

    old_exports = "module.exports = {"
    if not patch(ctrl, old_exports, new_fn, "addStudentToSection"):
        return False

    # Append the new function to exports list
    src = ctrl.read_text()
    if "addStudentToSection," not in src.split("module.exports")[-1]:
        src = src.replace(
            "  listStudentsInSection,\n};",
            "  listStudentsInSection,\n  addStudentToSection,\n};",
        )
        ctrl.write_text(src)
        print("  ✓ updated exports")

    # Add route
    rt = BE / "routes/classes.js"
    new_route = ("router.post('/sections/:sectionId/students', "
                 "authorize('admin', 'teacher'), c.addStudentToSection);\n")
    src = rt.read_text()
    if "addStudentToSection" not in src:
        anchor = "router.get('/sections/:sectionId/students'"
        src = src.replace(anchor, new_route + anchor, 1)
        rt.write_text(src)
        print("  ✓ added POST route")
    else:
        print("  · route already present")

    return True


# ════════════════════════════════════════════════════════════
# FRONTEND
# ════════════════════════════════════════════════════════════

def gen_frontend_api():
    banner("frontend api")

    p = FE / "src/api/endpoints.js"
    src = p.read_text()
    if "addStudentToSection" in src:
        print("  · already patched")
        return

    old = "  students: (sectionId) => unwrap(client.get(`/classes/sections/${sectionId}/students`)),"
    new = old + "\n  addStudentToSection: (sectionId, p) =>\n    unwrap(client.post(`/classes/sections/${sectionId}/students`, p)),"
    if old in src:
        p.write_text(src.replace(old, new, 1))
        print("  ✓ patched classesApi")
    else:
        # fallback: hook after removeSection
        alt = "  removeSection: (sectionId, force) =>"
        idx = src.find(alt)
        if idx != -1:
            end = src.find("\n", src.find(";", idx))
            insert = "\n  addStudentToSection: (sectionId, p) =>\n    unwrap(client.post(`/classes/sections/${sectionId}/students`, p)),"
            src = src[:end] + insert + src[end:]
            p.write_text(src)
            print("  ✓ patched classesApi (fallback)")
        else:
            print("  ✗ couldn't find anchor — patch manually")


def gen_frontend_page():
    banner("frontend Classes.jsx")

    p = FE / "src/pages/Classes.jsx"
    if not p.exists():
        print("  ✗ Classes.jsx missing — run generate_classes_crud.py first")
        return False

    src = p.read_text()

    # 1. Add state for the modal
    if "addStudentModal" not in src:
        src = src.replace(
            "  const [confirm, setConfirm] = useState(null);",
            "  const [confirm, setConfirm] = useState(null);\n"
            "  const [addStudentModal, setAddStudentModal] = useState(false);",
            1,
        )

    # 2. Add "Add Student" button to the students card header
    old_hdr = '''<h3 className="font-semibold mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-green-600" />
            Students {currentSection && <span className="text-sm font-normal text-slate-500">— Section {currentSection.section_name}</span>}
          </h3>'''

    new_hdr = '''<div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" />
              Students {currentSection && <span className="text-sm font-normal text-slate-500">— Section {currentSection.section_name}</span>}
            </h3>
            {canWrite && (
              <Button size="sm" icon={Plus} onClick={() => setAddStudentModal(true)}>
                Add Student
              </Button>
            )}
          </div>'''

    if old_hdr in src:
        src = src.replace(old_hdr, new_hdr, 1)
    else:
        print("  ! students header anchor not found — patch manually")

    # 3. Define canWrite near isAdmin
    if "const canWrite" not in src:
        src = src.replace(
            "  const isAdmin = user?.role === 'admin';",
            "  const isAdmin = user?.role === 'admin';\n"
            "  const canWrite = ['admin', 'teacher'].includes(user?.role);",
            1,
        )

    # 4. Add <AddStudentModal> render + import
    if "AddStudentModal" not in src:
        src = src.replace(
            "import Modal from '../components/Modal';",
            "import Modal from '../components/Modal';\nimport AddStudentModal from '../components/AddStudentModal';",
            1,
        )
        src = src.replace(
            "      {/* ═══ Confirm delete ═══ */}",
            '''      {/* ═══ Add student modal ═══ */}
      {addStudentModal && currentSection && (
        <AddStudentModal
          sectionId={currentSection.id}
          sectionName={currentSection.section_name}
          onClose={() => setAddStudentModal(false)}
          onSaved={async () => {
            setAddStudentModal(false);
            await loadStudents(sectionId);
            await loadSections(classId);
          }}
        />
      )}

      {/* ═══ Confirm delete ═══ */}''',
            1,
        )

    p.write_text(src)
    print("  ✓ patched Classes.jsx")

    # 5. Write AddStudentModal component
    write(FE, "src/components/AddStudentModal.jsx", r"""
import { useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus, Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import PasswordInput from './PasswordInput';
import { classesApi } from '../api/endpoints';

export default function AddStudentModal({ sectionId, sectionName, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    roll_number: '',
    gender: '',
    dob: '',
    guardian_name: '',
    guardian_phone: '',
    admission_number: '',
  });
  const [saving, setSaving] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name required');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast.error('Valid email required');
    if (form.password && form.password.length < 6)
      return toast.error('Password must be at least 6 characters (or leave blank)');

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password || undefined,
        roll_number: form.roll_number || null,
        gender: form.gender || null,
        dob: form.dob || null,
        guardian_name: form.guardian_name || null,
        guardian_phone: form.guardian_phone || null,
        admission_number: form.admission_number || null,
      };
      const res = await classesApi.addStudentToSection(sectionId, payload);
      toast.success(`Added ${res?.name || 'student'} (${res?.admission_number || ''})`);
      onSaved?.();
    } catch (e2) {
      toast.error(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add Student — Section ${sectionName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>Add Student</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Full name *" name="name" value={form.name} onChange={onChange} />
          <Input label="Email *" name="email" type="email" value={form.email} onChange={onChange} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PasswordInput
            label="Password (optional — default: changeme123)"
            name="password"
            value={form.password}
            onChange={onChange}
          />
          <Input
            label="Admission # (auto if blank)"
            name="admission_number"
            value={form.admission_number}
            onChange={onChange}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Roll number" name="roll_number" value={form.roll_number} onChange={onChange} />
          <div>
            <label className="label">Gender</label>
            <select name="gender" value={form.gender} onChange={onChange} className="input">
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Date of birth" name="dob" type="date" value={form.dob} onChange={onChange} />
          <Input label="Guardian name" name="guardian_name" value={form.guardian_name} onChange={onChange} />
        </div>

        <Input label="Guardian phone" name="guardian_phone" value={form.guardian_phone} onChange={onChange} />

        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
          <UserPlus className="w-3.5 h-3.5" />
          Student is created active — can log in immediately.
        </div>
      </form>
    </Modal>
  );
}
""".strip())
    return True


def verify():
    banner("verify")
    import subprocess
    all_ok = True
    for f in [BE / "controllers/classController.js", BE / "routes/classes.js"]:
        r = subprocess.run(["node", "-c", str(f)], capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ✓ {f.relative_to(ROOT)}")
        else:
            print(f"  ✗ {f.relative_to(ROOT)}: {(r.stderr or r.stdout).strip()[:200]}")
            all_ok = False
    return all_ok


def main():
    print(f"Add Student to Section — root: {ROOT}")
    gen_backend()
    gen_frontend_api()
    gen_frontend_page()
    print()
    if not verify():
        sys.exit(1)
    print("\n" + "═" * 62)
    print("✅ Done.")
    print("═" * 62)
    print("\nRestart:")
    print("  pkill -f node && cd ~/school/backend && npm run dev")
    print("  pkill -f vite && cd ~/school/frontend && npm run dev")


if __name__ == "__main__":
    main()
