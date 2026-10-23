#!/usr/bin/env python3
"""
Homework CRUD with teacher name + timestamp.
Backend : homework + homework_submissions
Frontend: Homework list, create, edit, delete, submissions view

Run from ~/school:  python scripts/generate_homework_crud.py
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

def gen_backend_migration():
    banner("migration")

    write(BE, "migrations/014_homework_meta.sql", r"""
-- Homework: track who created it and when (already created_at exists)
-- Add updated_at + updated_by to track edits.
ALTER TABLE homework ADD COLUMN updated_at DATETIME;
ALTER TABLE homework ADD COLUMN updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Submissions: track grader + graded_at
ALTER TABLE homework_submissions ADD COLUMN graded_at DATETIME;
ALTER TABLE homework_submissions ADD COLUMN graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE homework_submissions ADD COLUMN grade VARCHAR(20);
""".strip())


def gen_backend_model():
    banner("backend model")

    write(BE, "models/homeworkModel.js", r"""
const { run, get, all } = require('../config/database');

const HomeworkModel = {
  // ─── List with teacher name + class + subject ───
  list: (filters = {}) => {
    let sql = `
      SELECT h.*,
             sub.subject_name,
             c.class_name, c.class_code,
             tu.name AS teacher_name,
             uu.name AS updated_by_name
      FROM homework h
      LEFT JOIN subjects sub ON h.subject_id = sub.id
      LEFT JOIN classes c ON h.class_id = c.id
      LEFT JOIN teachers t ON h.teacher_id = t.id
      LEFT JOIN users tu ON t.user_id = tu.id
      LEFT JOIN users uu ON h.updated_by = uu.id
    `;
    const where = [];
    const params = [];
    if (filters.class_id)   { where.push('h.class_id = ?');   params.push(filters.class_id); }
    if (filters.teacher_id) { where.push('h.teacher_id = ?'); params.push(filters.teacher_id); }
    if (filters.subject_id) { where.push('h.subject_id = ?'); params.push(filters.subject_id); }
    if (filters.q)          { where.push('(h.title LIKE ? OR h.description LIKE ?)');
                              params.push(`%${filters.q}%`, `%${filters.q}%`); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY h.created_at DESC, h.id DESC LIMIT 500';
    return all(sql, params);
  },

  findById: (id) =>
    get(
      `SELECT h.*,
              sub.subject_name,
              c.class_name, c.class_code,
              tu.name AS teacher_name,
              uu.name AS updated_by_name
       FROM homework h
       LEFT JOIN subjects sub ON h.subject_id = sub.id
       LEFT JOIN classes c ON h.class_id = c.id
       LEFT JOIN teachers t ON h.teacher_id = t.id
       LEFT JOIN users tu ON t.user_id = tu.id
       LEFT JOIN users uu ON h.updated_by = uu.id
       WHERE h.id = ?`,
      [id]
    ),

  // ─── Write ───
  create: ({ class_id, subject_id, teacher_id = null,
             title, description = null, due_date,
             attachment_url = null }) =>
    run(
      `INSERT INTO homework
        (class_id, subject_id, teacher_id, title, description, due_date, attachment_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [class_id, subject_id, teacher_id, title, description, due_date, attachment_url]
    ),

  update: (id, patch, updated_by) => {
    const allowed = ['class_id', 'subject_id', 'teacher_id',
                     'title', 'description', 'due_date', 'attachment_url'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const set = keys.map((k) => `${k} = ?`).join(', ');
    const sql = `UPDATE homework SET ${set}, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), updated_by, id]);
  },

  remove: (id) => run(`DELETE FROM homework WHERE id = ?`, [id]),

  // ─── Submissions ───
  submissionsFor: (homework_id) =>
    all(
      `SELECT hs.*,
              u.name AS student_name,
              s.roll_number, s.admission_number,
              gu.name AS graded_by_name
       FROM homework_submissions hs
       JOIN students s ON hs.student_id = s.id
       JOIN users u ON s.user_id = u.id
       LEFT JOIN users gu ON hs.graded_by = gu.id
       WHERE hs.homework_id = ?
       ORDER BY hs.submission_date DESC`,
      [homework_id]
    ),

  submit: ({ homework_id, student_id, attachment_url = null, remarks = null }) =>
    run(
      `INSERT INTO homework_submissions (homework_id, student_id, attachment_url, remarks)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(homework_id, student_id) DO UPDATE SET
         attachment_url = excluded.attachment_url,
         remarks = excluded.remarks,
         submission_date = CURRENT_TIMESTAMP`,
      [homework_id, student_id, attachment_url, remarks]
    ),

  gradeSubmission: ({ homework_id, student_id, grade, remarks, graded_by }) =>
    run(
      `UPDATE homework_submissions
       SET grade = ?, remarks = ?, graded_by = ?, graded_at = CURRENT_TIMESTAMP
       WHERE homework_id = ? AND student_id = ?`,
      [grade, remarks || null, graded_by, homework_id, student_id]
    ),

  // ─── Students in the homework's class (for submission tracking) ───
  studentsInClass: (class_id) =>
    all(
      `SELECT s.id, u.name AS student_name, s.roll_number, s.admission_number,
              sec.section_name
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN sections sec ON s.section_id = sec.id
       WHERE sec.class_id = ?
       ORDER BY sec.section_name, s.roll_number, u.name`,
      [class_id]
    ),
};

module.exports = HomeworkModel;
""".strip())


def gen_backend_controller():
    banner("backend controller")

    write(BE, "controllers/homeworkController.js", r"""
const HomeworkModel = require('../models/homeworkModel');
const TeacherModel = require('../models/teacherModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── List ───
const listHomework = async (req, res, next) => {
  try {
    const rows = await HomeworkModel.list({
      class_id:   req.query.class_id   ? Number(req.query.class_id)   : undefined,
      teacher_id: req.query.teacher_id ? Number(req.query.teacher_id) : undefined,
      subject_id: req.query.subject_id ? Number(req.query.subject_id) : undefined,
      q:          req.query.q || undefined,
    });
    return apiResponse(res, 200, true, 'Homework', rows);
  } catch (e) { next(e); }
};

// ─── Get one ───
const getHomework = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const hw = await HomeworkModel.findById(id);
    if (!hw) return apiResponse(res, 404, false, 'Homework not found');

    const [submissions, students] = await Promise.all([
      HomeworkModel.submissionsFor(id),
      hw.class_id ? HomeworkModel.studentsInClass(hw.class_id) : [],
    ]);

    // Attach submission state to each student
    const submittedBy = new Map(submissions.map((s) => [s.student_id, s]));
    const roster = students.map((st) => ({
      ...st,
      submitted: submittedBy.has(st.id),
      submission: submittedBy.get(st.id) || null,
    }));

    return apiResponse(res, 200, true, 'Homework', { homework: hw, submissions, roster });
  } catch (e) { next(e); }
};

// ─── Create ───
const createHomework = async (req, res, next) => {
  try {
    const { title, class_id, subject_id, due_date } = req.body;

    if (!title || !title.trim())
      return apiResponse(res, 400, false, 'title required');
    if (!class_id)
      return apiResponse(res, 400, false, 'class_id required');
    if (!subject_id)
      return apiResponse(res, 400, false, 'subject_id required');
    if (!due_date)
      return apiResponse(res, 400, false, 'due_date required');

    // Derive teacher_id from logged-in user
    let teacher_id = null;
    if (req.user.role === 'teacher') {
      const t = await TeacherModel.findByUserId(req.user.id);
      teacher_id = t?.id || null;
    } else if (req.user.role === 'admin' && req.body.teacher_id) {
      teacher_id = Number(req.body.teacher_id);
    }

    const { lastID } = await HomeworkModel.create({
      class_id: Number(class_id),
      subject_id: Number(subject_id),
      teacher_id,
      title: title.trim(),
      description: req.body.description || null,
      due_date,
      attachment_url: req.body.attachment_url || null,
    });

    logger.audit(`Homework created: "${title}" (id=${lastID}) by ${req.user.name}`);
    return apiResponse(res, 201, true, 'Homework created', { id: lastID });
  } catch (e) { next(e); }
};

// ─── Update ───
const updateHomework = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const hw = await HomeworkModel.findById(id);
    if (!hw) return apiResponse(res, 404, false, 'Homework not found');

    // Teachers can only edit their own homework
    if (req.user.role === 'teacher') {
      const t = await TeacherModel.findByUserId(req.user.id);
      if (!t || t.id !== hw.teacher_id)
        return apiResponse(res, 403, false, 'You can only edit homework you posted');
    }

    const patch = {};
    for (const k of ['title', 'description', 'due_date', 'attachment_url',
                     'class_id', 'subject_id']) {
      if (k in req.body) patch[k] = req.body[k];
    }

    await HomeworkModel.update(id, patch, req.user.id);
    logger.audit(`Homework updated: id=${id} by ${req.user.name}`);
    return apiResponse(res, 200, true, 'Homework updated');
  } catch (e) { next(e); }
};

// ─── Delete ───
const deleteHomework = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const hw = await HomeworkModel.findById(id);
    if (!hw) return apiResponse(res, 404, false, 'Homework not found');

    // Teachers can only delete their own
    if (req.user.role === 'teacher') {
      const t = await TeacherModel.findByUserId(req.user.id);
      if (!t || t.id !== hw.teacher_id)
        return apiResponse(res, 403, false, 'You can only delete homework you posted');
    }

    await HomeworkModel.remove(id);
    logger.audit(`Homework deleted: "${hw.title}" (id=${id}) by ${req.user.name}`);
    return apiResponse(res, 200, true, 'Homework deleted');
  } catch (e) { next(e); }
};

// ─── Submit (student) ───
const submitHomework = async (req, res, next) => {
  try {
    const homeworkId = Number(req.params.id);
    const hw = await HomeworkModel.findById(homeworkId);
    if (!hw) return apiResponse(res, 404, false, 'Homework not found');

    // Student can only submit for themselves; admin/teacher can submit on behalf
    let student_id = req.body.student_id;
    if (req.user.role === 'student') {
      const { get } = require('../config/database');
      const s = await get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
      if (!s) return apiResponse(res, 403, false, 'Not a student');
      student_id = s.id;
    }
    if (!student_id) return apiResponse(res, 400, false, 'student_id required');

    await HomeworkModel.submit({
      homework_id: homeworkId,
      student_id: Number(student_id),
      attachment_url: req.body.attachment_url || null,
      remarks: req.body.remarks || null,
    });

    logger.audit(`Homework submitted: hw=${homeworkId} student=${student_id}`);
    return apiResponse(res, 200, true, 'Homework submitted');
  } catch (e) { next(e); }
};

// ─── Grade (teacher/admin) ───
const gradeSubmission = async (req, res, next) => {
  try {
    const homeworkId = Number(req.params.id);
    const { student_id, grade, remarks } = req.body;
    if (!student_id) return apiResponse(res, 400, false, 'student_id required');
    if (!grade || !grade.trim()) return apiResponse(res, 400, false, 'grade required');

    await HomeworkModel.gradeSubmission({
      homework_id: homeworkId,
      student_id: Number(student_id),
      grade: grade.trim(),
      remarks: remarks || null,
      graded_by: req.user.id,
    });

    logger.audit(`Submission graded: hw=${homeworkId} student=${student_id} grade=${grade}`);
    return apiResponse(res, 200, true, 'Submission graded');
  } catch (e) { next(e); }
};

module.exports = {
  listHomework, getHomework, createHomework, updateHomework, deleteHomework,
  submitHomework, gradeSubmission,
};
""".strip())


def gen_backend_routes():
    banner("backend routes")

    write(BE, "routes/homework.js", r"""
const express = require('express');
const c = require('../controllers/homeworkController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Read
router.get('/', c.listHomework);
router.get('/:id', c.getHomework);

// Write (admin + teacher)
router.post('/', authorize('admin', 'teacher'), c.createHomework);
router.patch('/:id', authorize('admin', 'teacher'), c.updateHomework);
router.delete('/:id', authorize('admin', 'teacher'), c.deleteHomework);

// Submissions
router.post('/:id/submit', authorize('student', 'admin', 'teacher'), c.submitHomework);
router.post('/:id/grade', authorize('admin', 'teacher'), c.gradeSubmission);

module.exports = router;
""".strip())


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

    import re
    pattern = re.compile(r"export const homeworkApi = \{.*?\n\};", re.DOTALL)
    replacement = """export const homeworkApi = {
  list: (params) => unwrap(client.get('/homework', { params })),
  get: (id) => unwrap(client.get(`/homework/${id}`)),
  create: (p) => unwrap(client.post('/homework', p)),
  update: (id, p) => unwrap(client.patch(`/homework/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/homework/${id}`)),
  submit: (id, p) => unwrap(client.post(`/homework/${id}/submit`, p)),
  grade: (id, p) => unwrap(client.post(`/homework/${id}/grade`, p)),
};"""
    if pattern.search(src):
        src = pattern.sub(replacement, src, count=1)
        p.write_text(src)
        print("  ✓ expanded homeworkApi")
    else:
        print("  ! couldn't find homeworkApi block — patch manually")


def gen_frontend_modal():
    banner("HomeworkModal")

    write(FE, "src/components/HomeworkModal.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, BookOpen } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { homeworkApi, classesApi } from '../api/endpoints';

export default function HomeworkModal({ mode = 'create', initial = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    class_id: initial?.class_id || '',
    subject_id: initial?.subject_id || '',
    due_date: initial?.due_date || '',
    description: initial?.description || '',
    attachment_url: initial?.attachment_url || '',
  });
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    classesApi.list().then((d) => setClasses(d || [])).catch(() => setClasses([]));
  }, []);

  // Load subjects when class changes
  useEffect(() => {
    if (!form.class_id) { setSubjects([]); return; }
    // Subjects come via a lightweight call — reuse timetable or subjects endpoint.
    // Fallback: hit /classes/:id and hope it returns subjects; else empty.
    fetch(`/api/classes/${form.class_id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => r.json())
      .then((j) => setSubjects(j?.data?.subjects || []))
      .catch(() => setSubjects([]));
  }, [form.class_id]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title required');
    if (!form.class_id) return toast.error('Pick a class');
    if (!form.subject_id) return toast.error('Pick a subject');
    if (!form.due_date) return toast.error('Due date required');

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        class_id: Number(form.class_id),
        subject_id: Number(form.subject_id),
        due_date: form.due_date,
        description: form.description || null,
        attachment_url: form.attachment_url || null,
      };

      if (mode === 'create') {
        const res = await homeworkApi.create(payload);
        toast.success('Homework created');
        onSaved?.(res?.id);
      } else {
        await homeworkApi.update(initial.id, payload);
        toast.success('Homework updated');
        onSaved?.(initial.id);
      }
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
      title={mode === 'create' ? 'New Homework' : 'Edit Homework'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Title *" name="title" value={form.title} onChange={onChange}
               placeholder="e.g. Chapter 3 exercises" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Class *</label>
            <select name="class_id" value={form.class_id} onChange={onChange} className="input">
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Subject *</label>
            <select name="subject_id" value={form.subject_id} onChange={onChange} className="input"
                    disabled={!form.class_id}>
              <option value="">{form.class_id ? 'Select subject' : 'Pick a class first'}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.subject_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Due date *" name="due_date" type="date" value={form.due_date} onChange={onChange} />
          <Input label="Attachment URL" name="attachment_url" value={form.attachment_url} onChange={onChange}
                 placeholder="https://…" />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={onChange}
            rows={4}
            className="input"
            placeholder="Details, instructions, page numbers…"
          />
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
          <BookOpen className="w-3.5 h-3.5" />
          {mode === 'create'
            ? 'Your name and the current time will be stamped automatically.'
            : 'Edits will be attributed to you with a timestamp.'}
        </div>
      </form>
    </Modal>
  );
}
""".strip())


def gen_frontend_page():
    banner("Homework.jsx")

    write(FE, "src/pages/Homework.jsx", r"""
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ClipboardList, Plus, Pencil, Trash2, ChevronRight, ArrowLeft,
  User, Clock, BookOpen, Users, CheckCircle2, XCircle, Save, Award,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import Input from '../components/Input';
import Modal from '../components/Modal';
import ConfirmDelete from '../components/ConfirmDelete';
import HomeworkModal from '../components/HomeworkModal';
import { homeworkApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Homework() {
  const { homeworkId } = useParams();
  return homeworkId
    ? <HomeworkDetail homeworkId={Number(homeworkId)} />
    : <HomeworkList />;
}

// ════════════════════════════════════════════════════════════

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function dueBadge(due_date) {
  if (!due_date) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (due_date < today) return { text: 'Overdue', cls: 'badge bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' };
  if (due_date === today) return { text: 'Due today', cls: 'badge bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' };
  return { text: `Due ${due_date}`, cls: 'badge badge-blue' };
}

// ════════════════════════════════════════════════════════════
// LIST
// ════════════════════════════════════════════════════════════

function HomeworkList() {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = () => {
    setLoading(true);
    homeworkApi.list().then((d) => setRows(d || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleDelete = async () => {
    try {
      await homeworkApi.remove(confirm.id);
      toast.success('Homework deleted');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  const filtered = q
    ? rows.filter((r) =>
        (r.title || '').toLowerCase().includes(q.toLowerCase()) ||
        (r.teacher_name || '').toLowerCase().includes(q.toLowerCase()) ||
        (r.class_name || '').toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-brand-600" /> Homework ({filtered.length})
          </h3>
          {canWrite && (
            <Button size="sm" icon={Plus} onClick={() => setModal({ mode: 'create' })}>
              New Homework
            </Button>
          )}
        </div>

        <Input value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search by title, teacher, or class…" />

        <div className="mt-3">
          {loading ? <Loader /> : filtered.length === 0 ? (
            <Empty title="No homework yet" hint={canWrite ? 'Click "New Homework" to post one' : null} />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map((h) => {
                const b = dueBadge(h.due_date);
                return (
                  <div key={h.id} className="group relative">
                    <button onClick={() => nav(`/homework/${h.id}`)}
                      className="w-full text-left py-3 pr-20 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded transition">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center shrink-0">
                          <BookOpen className="w-4 h-4 text-brand-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium flex items-center gap-2">
                            {h.title}
                            {b && <span className={b.cls}>{b.text}</span>}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-2">
                            {h.class_name && <span>{h.class_name}</span>}
                            {h.subject_name && <span>· {h.subject_name}</span>}
                            {h.teacher_name && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" /> {h.teacher_name}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Posted {formatDateTime(h.created_at)}
                            </span>
                            {h.updated_at && (
                              <span>Edited {formatDateTime(h.updated_at)}
                                {h.updated_by_name ? ` by ${h.updated_by_name}` : ''}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                      </div>
                    </button>

                    {canWrite && (
                      <div className="absolute right-2 top-3 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', data: h }); }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirm({ id: h.id, name: h.title }); }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {modal && (
        <HomeworkModal
          mode={modal.mode}
          initial={modal.data}
          onClose={() => setModal(null)}
          onSaved={async (id) => {
            setModal(null);
            await load();
            if (modal.mode === 'create' && id) nav(`/homework/${id}`);
          }}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete homework?"
        message={`"${confirm?.name || ''}" and all its submissions will be removed.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL
// ════════════════════════════════════════════════════════════

function HomeworkDetail({ homeworkId }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gradeModal, setGradeModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await homeworkApi.get(homeworkId);
      setData(d);
    } catch (e) { toast.error(e.message); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [homeworkId]);

  if (loading) return <Loader />;
  if (!data?.homework) return <Card><Empty title="Homework not found" /></Card>;

  const { homework, submissions, roster } = data;
  const submittedCount = roster.filter((r) => r.submitted).length;
  const b = dueBadge(homework.due_date);

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav('/homework')}
        className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to homework
      </button>

      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold flex items-center gap-2 flex-wrap">
              <BookOpen className="w-5 h-5 text-brand-600" />
              {homework.title}
              {b && <span className={b.cls}>{b.text}</span>}
            </h2>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-3">
              {homework.class_name && <span>{homework.class_name}</span>}
              {homework.subject_name && <span>· {homework.subject_name}</span>}
            </div>

            <div className="text-xs text-slate-400 mt-2 flex flex-wrap gap-4">
              {homework.teacher_name && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" /> Posted by <b className="text-slate-600 dark:text-slate-300">{homework.teacher_name}</b>
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatDateTime(homework.created_at)}
              </span>
              {homework.updated_at && (
                <span>Edited {formatDateTime(homework.updated_at)}</span>
              )}
            </div>

            {homework.description && (
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 whitespace-pre-wrap">
                {homework.description}
              </p>
            )}

            {homework.attachment_url && (
              <a href={homework.attachment_url} target="_blank" rel="noopener noreferrer"
                 className="text-xs text-brand-600 hover:underline mt-2 inline-block">
                📎 View attachment
              </a>
            )}
          </div>
        </div>

        {roster.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="text-xs uppercase text-slate-500">Roster</div>
              <div className="text-lg font-bold">{roster.length}</div>
            </div>
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300">
              <div className="text-xs uppercase">Submitted</div>
              <div className="text-lg font-bold">{submittedCount}</div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <div className="text-xs uppercase">Pending</div>
              <div className="text-lg font-bold">{roster.length - submittedCount}</div>
            </div>
          </div>
        )}
      </Card>

      {roster.length === 0 ? (
        <Card><Empty title="No students in this class" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Student</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Submitted at</th>
                  <th className="text-left p-3">Grade</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {roster.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <div className="font-medium text-sm">{r.student_name}</div>
                      <div className="text-xs text-slate-500">
                        {r.section_name || ''} · Roll {r.roll_number || '—'}
                      </div>
                    </td>
                    <td className="p-3">
                      {r.submitted ? (
                        <span className="text-green-600 text-xs font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Submitted
                        </span>
                      ) : (
                        <span className="text-red-500 text-xs font-medium flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-500">
                      {r.submission?.submission_date
                        ? formatDateTime(r.submission.submission_date)
                        : '—'}
                    </td>
                    <td className="p-3">
                      {r.submission?.grade ? (
                        <span className="badge badge-blue">{r.submission.grade}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {canWrite && r.submitted && (
                        <button
                          onClick={() => setGradeModal({ student: r })}
                          className="text-xs text-brand-600 font-medium inline-flex items-center gap-1"
                        >
                          <Award className="w-3.5 h-3.5" /> Grade
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {gradeModal && (
        <GradeModal
          homeworkId={homeworkId}
          student={gradeModal.student}
          onClose={() => setGradeModal(null)}
          onSaved={async () => { setGradeModal(null); await load(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════

function GradeModal({ homeworkId, student, onClose, onSaved }) {
  const [grade, setGrade] = useState(student.submission?.grade || '');
  const [remarks, setRemarks] = useState(student.submission?.remarks || '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!grade.trim()) return toast.error('Grade required');
    setSaving(true);
    try {
      await homeworkApi.grade(homeworkId, {
        student_id: student.id,
        grade: grade.trim(),
        remarks: remarks.trim() || null,
      });
      toast.success('Graded');
      onSaved?.();
    } catch (e2) { toast.error(e2.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Grade — ${student.student_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>Save Grade</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Grade *" value={grade} onChange={(e) => setGrade(e.target.value)}
               placeholder="A / B+ / 85 / Excellent" />
        <div>
          <label className="label">Remarks</label>
          <textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                    className="input" placeholder="Optional feedback…" />
        </div>
      </form>
    </Modal>
  );
}
""".strip())


def gen_routes_patch():
    banner("App routes")

    p = FE / "src/App.jsx"
    if not p.exists():
        print("  ! App.jsx missing")
        return
    src = p.read_text()
    if "/homework/:homeworkId" in src:
        print("  · already routed")
        return
    old = '<Route path="homework" element={<Homework />} />'
    new = ('<Route path="homework" element={<Homework />} />\n'
           '              <Route path="homework/:homeworkId" element={<Homework />} />')
    if old in src:
        p.write_text(src.replace(old, new, 1))
        print("  ✓ added /homework/:homeworkId route")
    else:
        print("  ! couldn't find homework route — add manually")


def verify():
    banner("verify")
    import subprocess
    files = [
        BE / "models/homeworkModel.js",
        BE / "controllers/homeworkController.js",
        BE / "routes/homework.js",
    ]
    ok = True
    for f in files:
        r = subprocess.run(["node", "-c", str(f)], capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ✓ {f.relative_to(ROOT)}")
        else:
            print(f"  ✗ {f.relative_to(ROOT)}: {(r.stderr or r.stdout).strip()[:200]}")
            ok = False
    return ok


def main():
    print(f"Homework CRUD — root: {ROOT}")
    gen_backend_migration()
    gen_backend_model()
    gen_backend_controller()
    gen_backend_routes()
    gen_frontend_api()
    gen_frontend_modal()
    gen_frontend_page()
    gen_routes_patch()
    print()
    if not verify():
        sys.exit(1)
    print("\n" + "═" * 62)
    print("✅ Homework CRUD generated.")
    print("═" * 62)
    print("\nApply migration:")
    print("  cd ~/school/backend")
    print("  sqlite3 school_management.db \"ALTER TABLE homework ADD COLUMN updated_at DATETIME;\" 2>/dev/null")
    print("  sqlite3 school_management.db \"ALTER TABLE homework ADD COLUMN updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;\" 2>/dev/null")
    print("  sqlite3 school_management.db \"ALTER TABLE homework_submissions ADD COLUMN graded_at DATETIME;\" 2>/dev/null")
    print("  sqlite3 school_management.db \"ALTER TABLE homework_submissions ADD COLUMN graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL;\" 2>/dev/null")
    print("  sqlite3 school_management.db \"ALTER TABLE homework_submissions ADD COLUMN grade VARCHAR(20);\" 2>/dev/null")
    print("\nRestart:")
    print("  pkill -f node && cd ~/school/backend && npm run dev")
    print("  pkill -f vite && cd ~/school/frontend && npm run dev")


if __name__ == "__main__":
    main()
