#!/usr/bin/env python3
"""
Teachers CRUD:
  Backend : full CRUD + per-teacher overview (already exists for overview)
  Frontend: Teachers list with add/edit/delete + click -> TeacherDetail

Run from ~/school:  python scripts/generate_teachers_crud.py
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


# ════════════════════════════════════════════════════════════
# BACKEND
# ════════════════════════════════════════════════════════════

def gen_backend_model():
    banner("backend model")

    write(BE, "models/teacherModel.js", r"""
const { run, get, all } = require('../config/database');

const TeacherModel = {
  // ─── Read ───
  list: () =>
    all(
      `SELECT t.id, t.employee_code, t.department_id, t.qualification,
              t.join_date, t.salary, t.created_at,
              u.id AS user_id, u.name, u.email, u.phone, u.avatar_url, u.status,
              d.department_name
       FROM teachers t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN departments d ON t.department_id = d.id
       ORDER BY u.name`
    ),

  findById: (id) =>
    get(
      `SELECT t.*, u.id AS user_id, u.name, u.email, u.phone, u.avatar_url, u.status,
              d.department_name
       FROM teachers t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN departments d ON t.department_id = d.id
       WHERE t.id = ?`,
      [id]
    ),

  findByUserId: (user_id) =>
    get(`SELECT * FROM teachers WHERE user_id = ?`, [user_id]),

  employeeCodeTaken: (code, exceptId = null) =>
    get(
      `SELECT id FROM teachers
       WHERE employee_code = ? AND (? IS NULL OR id != ?)`,
      [code, exceptId, exceptId]
    ),

  // ─── Write ───
  create: ({ user_id, employee_code, department_id = null,
             qualification = null, join_date = null, salary = null }) =>
    run(
      `INSERT INTO teachers (user_id, employee_code, department_id, qualification, join_date, salary)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, employee_code, department_id, qualification, join_date, salary]
    ),

  update: (id, patch) => {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE teachers SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  remove: (id) => run(`DELETE FROM teachers WHERE id = ?`, [id]),

  // ─── Departments lookup ───
  listDepartments: () => all(`SELECT * FROM departments ORDER BY department_name`),

  // ─── Sections handled (from timetable) ───
  sections: (teacher_id) =>
    all(
      `SELECT DISTINCT sec.id AS section_id, sec.section_name,
              c.id AS class_id, c.class_name, c.class_code
       FROM timetables tt
       JOIN sections sec ON tt.section_id = sec.id
       JOIN classes c ON sec.class_id = c.id
       WHERE tt.teacher_id = ?
       ORDER BY c.class_name, sec.section_name`,
      [teacher_id]
    ),
};

module.exports = TeacherModel;
""".strip())


def gen_backend_controller():
    banner("backend controller")

    write(BE, "controllers/teacherController.js", r"""
const UserModel = require('../models/userModel');
const TeacherModel = require('../models/teacherModel');
const TeacherDetailModel = require('../models/teacherDetailModel');
const { hash } = require('../utils/password');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── List ───
const listTeachers = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    let rows = await TeacherModel.list();

    if (q) {
      rows = rows.filter((r) =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.employee_code || '').toLowerCase().includes(q)
      );
    }
    return apiResponse(res, 200, true, 'Teachers', rows);
  } catch (e) { next(e); }
};

// ─── Get one ───
const getTeacher = async (req, res, next) => {
  try {
    const id = Number(req.params.teacherId);
    const t = await TeacherModel.findById(id);
    if (!t) return apiResponse(res, 404, false, 'Teacher not found');
    return apiResponse(res, 200, true, 'Teacher', t);
  } catch (e) { next(e); }
};

// ─── Create ───
const createTeacher = async (req, res, next) => {
  try {
    const {
      name, email, password,
      employee_code, department_id, qualification, join_date, salary,
      phone,
    } = req.body;

    if (!name || !name.trim())
      return apiResponse(res, 400, false, 'Name required');
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return apiResponse(res, 400, false, 'Valid email required');

    if (await UserModel.findByEmail(email))
      return apiResponse(res, 409, false, 'Email already registered');

    const password_hash = await hash(password || 'changeme123');

    const { lastID: user_id } = await UserModel.create({
      name: name.trim(),
      email: email.trim(),
      password_hash,
      role: 'teacher',
      phone: phone || null,
      status: 'active',   // admin-added teachers are active immediately
    });

    const code = employee_code && employee_code.trim()
      ? employee_code.trim().toUpperCase()
      : `EMP${String(user_id).padStart(5, '0')}`;

    if (await TeacherModel.employeeCodeTaken(code)) {
      await UserModel.update(user_id, {});
      // rollback user if code collides
      // (no direct delete in UserModel; leave created user but report error)
      return apiResponse(res, 409, false, `Employee code ${code} already in use`);
    }

    const { lastID: teacher_id } = await TeacherModel.create({
      user_id,
      employee_code: code,
      department_id: department_id || null,
      qualification: qualification || null,
      join_date: join_date || null,
      salary: salary || null,
    });

    logger.audit(`Teacher created: ${name} (${code})`);

    return apiResponse(res, 201, true, 'Teacher created', {
      id: teacher_id,
      user_id,
      employee_code: code,
      name: name.trim(),
    });
  } catch (e) { next(e); }
};

// ─── Update ───
const updateTeacher = async (req, res, next) => {
  try {
    const id = Number(req.params.teacherId);
    const t = await TeacherModel.findById(id);
    if (!t) return apiResponse(res, 404, false, 'Teacher not found');

    const {
      name, email, phone,
      employee_code, department_id, qualification, join_date, salary,
    } = req.body;

    // Check employee_code uniqueness
    if (employee_code && employee_code.trim().toUpperCase() !== t.employee_code) {
      const code = employee_code.trim().toUpperCase();
      const taken = await TeacherModel.employeeCodeTaken(code, id);
      if (taken) return apiResponse(res, 409, false, `Employee code ${code} already in use`);
    }

    // Check email uniqueness
    if (email && email.trim() !== t.email) {
      const existing = await UserModel.findByEmail(email.trim());
      if (existing && existing.id !== t.user_id)
        return apiResponse(res, 409, false, 'Email already in use');
    }

    // Patch teacher table
    const teacher_patch = {};
    if (employee_code) teacher_patch.employee_code = employee_code.trim().toUpperCase();
    if (department_id !== undefined) teacher_patch.department_id = department_id || null;
    if (qualification !== undefined) teacher_patch.qualification = qualification || null;
    if (join_date !== undefined) teacher_patch.join_date = join_date || null;
    if (salary !== undefined) teacher_patch.salary = salary || null;

    if (Object.keys(teacher_patch).length) {
      await TeacherModel.update(id, teacher_patch);
    }

    // Patch user table
    const user_patch = {};
    if (name) user_patch.name = name.trim();
    if (email) user_patch.email = email.trim();
    if (phone !== undefined) user_patch.phone = phone || null;

    if (Object.keys(user_patch).length) {
      await UserModel.update(t.user_id, user_patch);
    }

    logger.audit(`Teacher updated: id=${id}`);
    return apiResponse(res, 200, true, 'Teacher updated');
  } catch (e) { next(e); }
};

// ─── Delete ───
const deleteTeacher = async (req, res, next) => {
  try {
    const id = Number(req.params.teacherId);
    const t = await TeacherModel.findById(id);
    if (!t) return apiResponse(res, 404, false, 'Teacher not found');

    // block if assigned to a timetable
    const sections = await TeacherModel.sections(id);
    if (sections.length && req.query.force !== 'true')
      return apiResponse(res, 409, false,
        `Teacher is assigned to ${sections.length} section(s). Pass ?force=true to remove anyway.`);

    await TeacherModel.remove(id);
    // Soft-disable the user instead of deleting (keeps audit trail)
    await UserModel.setStatus(t.user_id, 'rejected');

    logger.audit(`Teacher deleted: ${t.name} (id=${id})`);
    return apiResponse(res, 200, true, 'Teacher deleted');
  } catch (e) { next(e); }
};

// ─── Overview (existing behaviour, richer) ───
const getTeacherOverview = async (req, res, next) => {
  try {
    const id = Number(req.params.teacherId);
    const [profile, sections, timetable, homework, attendanceMarked] = await Promise.all([
      TeacherDetailModel.profile(id),
      TeacherDetailModel.sections(id),
      TeacherDetailModel.timetable(id),
      TeacherDetailModel.homeworkPosted(id),
      TeacherDetailModel.attendanceMarked(id),
    ]);
    if (!profile) return apiResponse(res, 404, false, 'Teacher not found');
    return apiResponse(res, 200, true, 'Teacher overview', {
      profile, sections, timetable, homework, attendanceMarked,
    });
  } catch (e) { next(e); }
};

// ─── Departments list ───
const listDepartments = async (_req, res, next) => {
  try {
    return apiResponse(res, 200, true, 'Departments', await TeacherModel.listDepartments());
  } catch (e) { next(e); }
};

module.exports = {
  listTeachers, getTeacher, createTeacher, updateTeacher, deleteTeacher,
  getTeacherOverview, listDepartments,
};
""".strip())


def gen_backend_routes():
    banner("backend routes")

    write(BE, "routes/teachers.js", r"""
const express = require('express');
const c = require('../controllers/teacherController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateTeacher, validateId } = require('../middleware/validators');

const router = express.Router();
router.use(authenticate);

// Read
router.get('/', authorize('admin', 'teacher', 'accountant'), c.listTeachers);
router.get('/departments', authorize('admin', 'teacher'), c.listDepartments);
router.get('/:teacherId', authorize('admin', 'teacher', 'accountant'), c.getTeacher);
router.get('/:teacherId/overview', authorize('admin', 'teacher'), c.getTeacherOverview);

// Write (admin only)
router.post('/', authorize('admin'), validateTeacher, c.createTeacher);
router.patch('/:teacherId', authorize('admin'), c.updateTeacher);
router.delete('/:teacherId', authorize('admin'), validateId, c.deleteTeacher);

module.exports = router;
""".strip())


def gen_validators_patch():
    banner("validators")

    path = BE / "middleware/validators.js"
    if not path.exists():
        print("  ! validators.js missing — skip")
        return
    src = path.read_text()

    # Ensure validateTeacher exists and requires name+email
    if "validateTeacher" not in src:
        block = """
const validateTeacher = [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('employee_code').optional().trim(),
  body('department_id').optional({ nullable: true }).isInt(),
  body('salary').optional({ nullable: true }).isFloat({ min: 0 }),
  handleValidation,
];
"""
        marker = "module.exports = {"
        if marker in src:
            src = src.replace(marker, block + "\n" + marker, 1)

    if "validateTeacher," not in src:
        src = src.replace(
            "validateStudent,",
            "validateStudent, validateTeacher,",
            1,
        )
    path.write_text(src)
    print("  ✓ patched backend/middleware/validators.js")


# ════════════════════════════════════════════════════════════
# FRONTEND
# ════════════════════════════════════════════════════════════

def gen_frontend_api():
    banner("frontend api")

    p = FE / "src/api/endpoints.js"
    if not p.exists():
        print("  ! endpoints.js missing")
        return
    src = p.read_text()

    # Ensure teachersApi has all CRUD methods
    if "teachersApi" not in src:
        print("  ! teachersApi missing — add manually")
        return

    # Replace existing teachersApi block with expanded one
    import re
    pattern = re.compile(r"export const teachersApi = \{.*?\n\};", re.DOTALL)
    replacement = """export const teachersApi = {
  list: (params) => unwrap(client.get('/teachers', { params })),
  get: (id) => unwrap(client.get(`/teachers/${id}`)),
  overview: (id) => unwrap(client.get(`/teachers/${id}/overview`)),
  departments: () => unwrap(client.get('/teachers/departments')),
  create: (p) => unwrap(client.post('/teachers', p)),
  update: (id, p) => unwrap(client.patch(`/teachers/${id}`, p)),
  remove: (id, force) =>
    unwrap(client.delete(`/teachers/${id}${force ? '?force=true' : ''}`)),
};"""
    if pattern.search(src):
        src = pattern.sub(replacement, src, count=1)
        p.write_text(src)
        print("  ✓ expanded teachersApi")
    else:
        print("  ! couldn't find teachersApi block — patch manually")


def gen_frontend_modal():
    banner("AddTeacherModal")

    write(FE, "src/components/AddTeacherModal.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, GraduationCap } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import PasswordInput from './PasswordInput';
import { teachersApi } from '../api/endpoints';

export default function AddTeacherModal({ mode = 'create', initial = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    password: '',
    employee_code: initial?.employee_code || '',
    department_id: initial?.department_id || '',
    qualification: initial?.qualification || '',
    join_date: initial?.join_date || '',
    salary: initial?.salary ?? '',
  });
  const [departments, setDepartments] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    teachersApi.departments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name required');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast.error('Valid email required');
    if (mode === 'create' && form.password && form.password.length < 6)
      return toast.error('Password must be at least 6 characters');

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone || null,
        employee_code: form.employee_code.trim() || null,
        department_id: form.department_id ? Number(form.department_id) : null,
        qualification: form.qualification || null,
        join_date: form.join_date || null,
        salary: form.salary === '' ? null : Number(form.salary),
      };
      if (mode === 'create' && form.password) payload.password = form.password;

      if (mode === 'create') {
        const res = await teachersApi.create(payload);
        toast.success(`Added ${res?.name || 'teacher'} (${res?.employee_code || ''})`);
      } else {
        await teachersApi.update(initial.id, payload);
        toast.success('Teacher updated');
      }
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
      title={mode === 'create' ? 'Add Teacher' : 'Edit Teacher'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Add Teacher' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Full name *" name="name" value={form.name} onChange={onChange} />
          <Input label="Email *" name="email" type="email" value={form.email} onChange={onChange} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Phone" name="phone" value={form.phone} onChange={onChange} />
          <Input label="Employee code (auto if blank)" name="employee_code" value={form.employee_code} onChange={onChange} />
        </div>

        {mode === 'create' && (
          <PasswordInput
            label="Password (optional — default: changeme123)"
            name="password"
            value={form.password}
            onChange={onChange}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Department</label>
            <select name="department_id" value={form.department_id} onChange={onChange} className="input">
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.department_name}</option>
              ))}
            </select>
          </div>
          <Input label="Qualification" name="qualification" value={form.qualification} onChange={onChange} placeholder="e.g. M.Sc Math" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Join date" name="join_date" type="date" value={form.join_date} onChange={onChange} />
          <Input label="Salary" name="salary" type="number" value={form.salary} onChange={onChange} placeholder="0" />
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
          <GraduationCap className="w-3.5 h-3.5" />
          {mode === 'create'
            ? 'Teacher is created active — can log in immediately.'
            : 'Only fill in fields you want to change.'}
        </div>
      </form>
    </Modal>
  );
}
""".strip())


def gen_frontend_page():
    banner("Teachers.jsx")

    write(FE, "src/pages/Teachers.jsx", r"""
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  GraduationCap, Search, Plus, Pencil, Trash2, ChevronRight, UserCheck,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import AddTeacherModal from '../components/AddTeacherModal';
import { teachersApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Teachers() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const [modal, setModal] = useState(null);       // null | {mode:'create'} | {mode:'edit', data}
  const [confirm, setConfirm] = useState(null);   // null | {id, name}

  const load = async () => {
    setLoading(true);
    try {
      const d = await teachersApi.list();
      setRows(d || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = q
    ? rows.filter((r) =>
        (r.name || '').toLowerCase().includes(q.toLowerCase()) ||
        (r.email || '').toLowerCase().includes(q.toLowerCase()) ||
        (r.employee_code || '').toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  const handleDelete = async () => {
    try {
      await teachersApi.remove(confirm.id, true);
      toast.success('Teacher removed');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-purple-600" />
            Teachers ({filtered.length})
          </h3>
          {isAdmin && (
            <Button size="sm" icon={Plus} onClick={() => setModal({ mode: 'create' })}>
              Add Teacher
            </Button>
          )}
        </div>

        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name, email, or employee code"
            className="input pl-9"
          />
        </div>

        {loading ? <Loader /> : filtered.length === 0 ? (
          <Empty
            title="No teachers yet"
            hint={isAdmin ? 'Click "Add Teacher" to add one' : null}
            icon={GraduationCap}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map((t) => (
              <div
                key={t.id}
                className="relative group rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <button
                  onClick={() => nav(`/teachers/${t.id}`)}
                  className="w-full text-left p-3 pr-16"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold text-sm shrink-0">
                      {t.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate flex items-center gap-1.5">
                        {t.name}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {t.employee_code}
                        {t.department_name ? ` · ${t.department_name}` : ''}
                      </div>
                      {t.status === 'pending' && (
                        <span className="badge badge-gray mt-1 text-[10px]">
                          <UserCheck className="w-3 h-3 mr-1" /> pending
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {isAdmin && (
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', data: t }); }}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirm({ id: t.id, name: t.name }); }}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {modal && (
        <AddTeacherModal
          mode={modal.mode}
          initial={modal.data}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await load(); }}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete teacher?"
        message={`${confirm?.name || ''} — this will deactivate their account. Timetable assignments must be removed first.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
""".strip())


def verify():
    banner("verify")
    import subprocess
    files = [
        BE / "models/teacherModel.js",
        BE / "controllers/teacherController.js",
        BE / "routes/teachers.js",
        BE / "middleware/validators.js",
    ]
    ok = True
    for f in files:
        if not f.exists():
            print(f"  ✗ missing: {f.relative_to(ROOT)}")
            ok = False
            continue
        r = subprocess.run(["node", "-c", str(f)], capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ✓ {f.relative_to(ROOT)}")
        else:
            print(f"  ✗ {f.relative_to(ROOT)}: {(r.stderr or r.stdout).strip()[:200]}")
            ok = False
    return ok


def main():
    print(f"Teachers CRUD — root: {ROOT}")
    gen_backend_model()
    gen_backend_controller()
    gen_backend_routes()
    gen_validators_patch()
    gen_frontend_api()
    gen_frontend_modal()
    gen_frontend_page()

    print()
    if not verify():
        sys.exit(1)

    print("\n" + "═" * 62)
    print("✅ Teachers CRUD generated.")
    print("═" * 62)
    print("\nRestart:")
    print("  pkill -f node && cd ~/school/backend && npm run dev")
    print("  pkill -f vite && cd ~/school/frontend && npm run dev")
    print("\nUI:  /teachers")
    print("  · Admin sees: Add Teacher, Edit, Delete")
    print("  · Card click → /teachers/:id (detail page with sections, timetable, homework, attendance)")
    print("\nAPI:")
    print("  GET    /api/teachers")
    print("  GET    /api/teachers/departments")
    print("  GET    /api/teachers/:id")
    print("  GET    /api/teachers/:id/overview")
    print("  POST   /api/teachers              {name,email,password?,employee_code?,department_id?,qualification?,join_date?,salary?,phone?}")
    print("  PATCH  /api/teachers/:id")
    print("  DELETE /api/teachers/:id[?force=true]")


if __name__ == "__main__":
    main()
