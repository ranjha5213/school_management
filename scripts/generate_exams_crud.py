#!/usr/bin/env python3
"""
Exams CRUD:
  Backend : exams + exam_types + exam_marks
  Frontend: Exams list, create exam, marks entry, results view

Run from ~/school:  python scripts/generate_exams_crud.py
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

    write(BE, "models/examModel.js", r"""
const { run, get, all } = require('../config/database');

const ExamModel = {
  // ─── Exam types ───
  listTypes: () =>
    all(`SELECT * FROM exam_types ORDER BY type_name`),

  createType: ({ type_name, weightage = null }) =>
    run(`INSERT INTO exam_types (type_name, weightage) VALUES (?, ?)`,
        [type_name, weightage]),

  // ─── Exams ───
  list: (filters = {}) => {
    let sql = `
      SELECT e.*, et.type_name, c.class_name, c.class_code
      FROM exams e
      LEFT JOIN exam_types et ON e.exam_type_id = et.id
      LEFT JOIN classes c ON e.class_id = c.id
    `;
    const where = [];
    const params = [];
    if (filters.class_id) { where.push('e.class_id = ?'); params.push(filters.class_id); }
    if (filters.is_active !== undefined) { where.push('e.is_active = ?'); params.push(filters.is_active); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY e.start_date DESC, e.id DESC';
    return all(sql, params);
  },

  findById: (id) =>
    get(
      `SELECT e.*, et.type_name, c.class_name
       FROM exams e
       LEFT JOIN exam_types et ON e.exam_type_id = et.id
       LEFT JOIN classes c ON e.class_id = c.id
       WHERE e.id = ?`,
      [id]
    ),

  create: ({ exam_name, exam_type_id = null, class_id = null,
             start_date = null, end_date = null,
             total_marks = null, passing_marks = null }) =>
    run(
      `INSERT INTO exams
         (exam_name, exam_type_id, class_id, start_date, end_date, total_marks, passing_marks, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [exam_name, exam_type_id, class_id, start_date, end_date, total_marks, passing_marks]
    ),

  update: (id, patch) => {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE exams SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  remove: (id) => run(`DELETE FROM exams WHERE id = ?`, [id]),

  // ─── Marks ───
  marksForExam: (exam_id) =>
    all(
      `SELECT em.*, u.name AS student_name, s.roll_number, s.admission_number,
              sub.subject_name, sub.id AS subject_id
       FROM exam_marks em
       JOIN students s ON em.student_id = s.id
       JOIN users u ON s.user_id = u.id
       LEFT JOIN subjects sub ON em.subject_id = sub.id
       WHERE em.exam_id = ?
       ORDER BY u.name, sub.subject_name`,
      [exam_id]
    ),

  marksForStudent: (student_id) =>
    all(
      `SELECT em.*, e.exam_name, e.start_date, e.total_marks AS exam_total,
              sub.subject_name, et.type_name
       FROM exam_marks em
       JOIN exams e ON em.exam_id = e.id
       LEFT JOIN exam_types et ON e.exam_type_id = et.id
       LEFT JOIN subjects sub ON em.subject_id = sub.id
       WHERE em.student_id = ?
       ORDER BY e.start_date DESC`,
      [student_id]
    ),

  upsertMark: ({ exam_id, student_id, subject_id, marks_obtained, total_marks, remarks = null, entered_by = null }) =>
    run(
      `INSERT INTO exam_marks
         (exam_id, student_id, subject_id, marks_obtained, total_marks, remarks, entered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(exam_id, student_id, subject_id) DO UPDATE SET
         marks_obtained = excluded.marks_obtained,
         total_marks = excluded.total_marks,
         remarks = excluded.remarks,
         entered_by = excluded.entered_by,
         entered_at = CURRENT_TIMESTAMP`,
      [exam_id, student_id, subject_id, marks_obtained, total_marks, remarks, entered_by]
    ),

  removeMark: (id) => run(`DELETE FROM exam_marks WHERE id = ?`, [id]),

  // ─── Subjects (for the marks grid) ───
  subjectsForClass: (class_id) =>
    all(
      `SELECT id, subject_name, subject_code
       FROM subjects
       WHERE class_id = ? OR class_id IS NULL
       ORDER BY subject_name`,
      [class_id]
    ),

  // ─── Students of a class (across sections) ───
  studentsForClass: (class_id) =>
    all(
      `SELECT s.id, u.name AS student_name, s.roll_number, s.admission_number,
              sec.section_name, sec.id AS section_id
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN sections sec ON s.section_id = sec.id
       WHERE sec.class_id = ?
       ORDER BY sec.section_name, s.roll_number, u.name`,
      [class_id]
    ),

  // ─── Exam summary ───
  summary: (exam_id) =>
    get(
      `SELECT
         COUNT(DISTINCT em.student_id) AS student_count,
         COUNT(em.id) AS marks_count,
         AVG(em.marks_obtained * 1.0 / NULLIF(em.total_marks, 0)) AS avg_percentage,
         MAX(em.marks_obtained * 1.0 / NULLIF(em.total_marks, 0)) AS max_percentage,
         MIN(em.marks_obtained * 1.0 / NULLIF(em.total_marks, 0)) AS min_percentage
       FROM exam_marks em
       WHERE em.exam_id = ?`,
      [exam_id]
    ),
};

module.exports = ExamModel;
""".strip())


def gen_backend_controller():
    banner("backend controller")

    write(BE, "controllers/examController.js", r"""
const ExamModel = require('../models/examModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── Exam types ───
const listTypes = async (_req, res, next) => {
  try { return apiResponse(res, 200, true, 'Exam types', await ExamModel.listTypes()); }
  catch (e) { next(e); }
};

const createType = async (req, res, next) => {
  try {
    const { type_name, weightage = null } = req.body;
    if (!type_name || !type_name.trim())
      return apiResponse(res, 400, false, 'type_name required');
    const { lastID } = await ExamModel.createType({
      type_name: type_name.trim(), weightage,
    });
    return apiResponse(res, 201, true, 'Exam type created', { id: lastID });
  } catch (e) { next(e); }
};

// ─── Exams ───
const listExams = async (req, res, next) => {
  try {
    const rows = await ExamModel.list({
      class_id: req.query.class_id ? Number(req.query.class_id) : undefined,
    });
    return apiResponse(res, 200, true, 'Exams', rows);
  } catch (e) { next(e); }
};

const getExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await ExamModel.findById(id);
    if (!exam) return apiResponse(res, 404, false, 'Exam not found');

    const [marks, students, subjects, summary] = await Promise.all([
      ExamModel.marksForExam(id),
      exam.class_id ? ExamModel.studentsForClass(exam.class_id) : [],
      exam.class_id ? ExamModel.subjectsForClass(exam.class_id) : [],
      ExamModel.summary(id),
    ]);

    return apiResponse(res, 200, true, 'Exam', {
      exam, marks, students, subjects, summary,
    });
  } catch (e) { next(e); }
};

const createExam = async (req, res, next) => {
  try {
    const { exam_name } = req.body;
    if (!exam_name || !exam_name.trim())
      return apiResponse(res, 400, false, 'exam_name required');

    const { lastID } = await ExamModel.create({
      exam_name: exam_name.trim(),
      exam_type_id: req.body.exam_type_id || null,
      class_id: req.body.class_id || null,
      start_date: req.body.start_date || null,
      end_date: req.body.end_date || null,
      total_marks: req.body.total_marks || null,
      passing_marks: req.body.passing_marks || null,
    });

    logger.audit(`Exam created: ${exam_name} (id=${lastID})`);
    return apiResponse(res, 201, true, 'Exam created', { id: lastID });
  } catch (e) { next(e); }
};

const updateExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await ExamModel.findById(id);
    if (!existing) return apiResponse(res, 404, false, 'Exam not found');

    const allowed = ['exam_name', 'exam_type_id', 'class_id',
                     'start_date', 'end_date', 'total_marks', 'passing_marks', 'is_active'];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];

    await ExamModel.update(id, patch);
    logger.audit(`Exam updated: id=${id}`);
    return apiResponse(res, 200, true, 'Exam updated');
  } catch (e) { next(e); }
};

const deleteExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await ExamModel.findById(id);
    if (!exam) return apiResponse(res, 404, false, 'Exam not found');

    await ExamModel.remove(id);
    logger.audit(`Exam deleted: ${exam.exam_name} (id=${id})`);
    return apiResponse(res, 200, true, 'Exam deleted');
  } catch (e) { next(e); }
};

// ─── Marks ───
const saveMarks = async (req, res, next) => {
  try {
    const { exam_id, marks } = req.body;
    if (!exam_id) return apiResponse(res, 400, false, 'exam_id required');
    if (!Array.isArray(marks) || !marks.length)
      return apiResponse(res, 400, false, 'marks[] required');

    const exam = await ExamModel.findById(exam_id);
    if (!exam) return apiResponse(res, 404, false, 'Exam not found');

    const bad = marks.find((m) =>
      !m.student_id || !m.subject_id ||
      m.marks_obtained === undefined || m.total_marks === undefined
    );
    if (bad) return apiResponse(res, 400, false,
      'Each mark needs student_id, subject_id, marks_obtained, total_marks');

    const over = marks.find((m) => Number(m.marks_obtained) > Number(m.total_marks));
    if (over) return apiResponse(res, 400, false,
      `Marks cannot exceed total (student ${over.student_id})`);

    for (const m of marks) {
      await ExamModel.upsertMark({
        exam_id,
        student_id: m.student_id,
        subject_id: m.subject_id,
        marks_obtained: Number(m.marks_obtained),
        total_marks: Number(m.total_marks),
        remarks: m.remarks || null,
        entered_by: req.user.id,
      });
    }

    logger.audit(`Marks saved: exam ${exam_id}, ${marks.length} entries by ${req.user.name}`);
    return apiResponse(res, 200, true, `${marks.length} mark(s) saved`);
  } catch (e) { next(e); }
};

const deleteMark = async (req, res, next) => {
  try {
    await ExamModel.removeMark(Number(req.params.markId));
    return apiResponse(res, 200, true, 'Mark deleted');
  } catch (e) { next(e); }
};

const getStudentMarks = async (req, res, next) => {
  try {
    const rows = await ExamModel.marksForStudent(Number(req.params.studentId));
    return apiResponse(res, 200, true, 'Student marks', rows);
  } catch (e) { next(e); }
};

module.exports = {
  listTypes, createType,
  listExams, getExam, createExam, updateExam, deleteExam,
  saveMarks, deleteMark, getStudentMarks,
};
""".strip())


def gen_backend_routes():
    banner("backend routes")

    write(BE, "routes/exams.js", r"""
const express = require('express');
const c = require('../controllers/examController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Exam types
router.get('/types', authorize('admin', 'teacher'), c.listTypes);
router.post('/types', authorize('admin'), c.createType);

// Exams
router.get('/', authorize('admin', 'teacher', 'accountant'), c.listExams);
router.post('/', authorize('admin', 'teacher'), c.createExam);
router.get('/:id', authorize('admin', 'teacher', 'accountant'), c.getExam);
router.patch('/:id', authorize('admin', 'teacher'), c.updateExam);
router.delete('/:id', authorize('admin'), c.deleteExam);

// Marks
router.post('/marks', authorize('admin', 'teacher'), c.saveMarks);
router.delete('/marks/:markId', authorize('admin', 'teacher'), c.deleteMark);
router.get('/student/:studentId', authorize('admin', 'teacher', 'student', 'parent'), c.getStudentMarks);

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
    pattern = re.compile(r"export const examsApi = \{.*?\n\};", re.DOTALL)
    replacement = """export const examsApi = {
  list: (params) => unwrap(client.get('/exams', { params })),
  get: (id) => unwrap(client.get(`/exams/${id}`)),
  create: (p) => unwrap(client.post('/exams', p)),
  update: (id, p) => unwrap(client.patch(`/exams/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/exams/${id}`)),
  types: () => unwrap(client.get('/exams/types')),
  createType: (p) => unwrap(client.post('/exams/types', p)),
  saveMarks: (exam_id, marks) => unwrap(client.post('/exams/marks', { exam_id, marks })),
  deleteMark: (markId) => unwrap(client.delete(`/exams/marks/${markId}`)),
  studentMarks: (studentId) => unwrap(client.get(`/exams/student/${studentId}`)),
};"""
    if pattern.search(src):
        src = pattern.sub(replacement, src, count=1)
        p.write_text(src)
        print("  ✓ expanded examsApi")
    else:
        print("  ! couldn't find examsApi block — patch manually")


def gen_frontend_modals():
    banner("modal components")

    write(FE, "src/components/ExamModal.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, FileText, Plus } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { examsApi, classesApi } from '../api/endpoints';

export default function ExamModal({ mode = 'create', initial = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    exam_name: initial?.exam_name || '',
    exam_type_id: initial?.exam_type_id || '',
    class_id: initial?.class_id || '',
    start_date: initial?.start_date || '',
    end_date: initial?.end_date || '',
    total_marks: initial?.total_marks ?? '',
    passing_marks: initial?.passing_marks ?? '',
  });
  const [types, setTypes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [saving, setSaving] = useState(false);

  // New type inline
  const [newType, setNewType] = useState('');
  const [addingType, setAddingType] = useState(false);

  useEffect(() => {
    Promise.all([
      examsApi.types().catch(() => []),
      classesApi.list().catch(() => []),
    ]).then(([t, c]) => {
      setTypes(t || []);
      setClasses(c || []);
    });
  }, []);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const addType = async () => {
    if (!newType.trim()) return;
    setAddingType(true);
    try {
      const res = await examsApi.createType({ type_name: newType.trim() });
      toast.success('Exam type added');
      setNewType('');
      const updated = await examsApi.types();
      setTypes(updated);
      setForm({ ...form, exam_type_id: res.id });
    } catch (e) { toast.error(e.message); }
    finally { setAddingType(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.exam_name.trim()) return toast.error('Exam name required');
    if (!form.class_id) return toast.error('Pick a class');

    setSaving(true);
    try {
      const payload = {
        exam_name: form.exam_name.trim(),
        exam_type_id: form.exam_type_id ? Number(form.exam_type_id) : null,
        class_id: form.class_id ? Number(form.class_id) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        total_marks: form.total_marks === '' ? null : Number(form.total_marks),
        passing_marks: form.passing_marks === '' ? null : Number(form.passing_marks),
      };

      if (mode === 'create') {
        const res = await examsApi.create(payload);
        toast.success('Exam created');
        onSaved?.(res?.id);
      } else {
        await examsApi.update(initial.id, payload);
        toast.success('Exam updated');
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
      title={mode === 'create' ? 'Create Exam' : 'Edit Exam'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Create Exam' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Exam name *" name="exam_name" value={form.exam_name} onChange={onChange}
               placeholder="e.g. Mid-Term 2026" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Exam type</label>
            <div className="flex gap-2">
              <select name="exam_type_id" value={form.exam_type_id} onChange={onChange} className="input">
                <option value="">—</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.type_name}</option>
                ))}
              </select>
              <Button type="button" size="sm" variant="secondary" icon={Plus}
                onClick={() => setAddingType(!addingType)}>New</Button>
            </div>
            {addingType && (
              <div className="flex gap-2 mt-2">
                <input className="input" placeholder="Type name (e.g. Mid-Term)"
                  value={newType} onChange={(e) => setNewType(e.target.value)} />
                <Button type="button" size="sm" onClick={addType} loading={addingType}>Add</Button>
              </div>
            )}
          </div>

          <div>
            <label className="label">Class *</label>
            <select name="class_id" value={form.class_id} onChange={onChange} className="input">
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Start date" name="start_date" type="date" value={form.start_date} onChange={onChange} />
          <Input label="End date" name="end_date" type="date" value={form.end_date} onChange={onChange} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Total marks" name="total_marks" type="number" value={form.total_marks} onChange={onChange} placeholder="100" />
          <Input label="Passing marks" name="passing_marks" type="number" value={form.passing_marks} onChange={onChange} placeholder="40" />
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
          <FileText className="w-3.5 h-3.5" />
          After saving, enter marks student by student.
        </div>
      </form>
    </Modal>
  );
}
""".strip())


def gen_frontend_page():
    banner("Exams.jsx")

    write(FE, "src/pages/Exams.jsx", r"""
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FileText, Plus, Pencil, Trash2, ChevronRight, ArrowLeft,
  Save, Users, Percent, Award,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import ExamModal from '../components/ExamModal';
import { examsApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Exams() {
  const { examId } = useParams();
  return examId ? <ExamDetail examId={Number(examId)} /> : <ExamList />;
}

// ════════════════════════════════════════════════════════════
// LIST
// ════════════════════════════════════════════════════════════

function ExamList() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = () => {
    setLoading(true);
    examsApi.list().then((d) => setRows(d || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleDelete = async () => {
    try {
      await examsApi.remove(confirm.id);
      toast.success('Exam deleted');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-600" /> Exams ({rows.length})
          </h3>
          {canWrite && (
            <Button size="sm" icon={Plus} onClick={() => setModal({ mode: 'create' })}>
              New Exam
            </Button>
          )}
        </div>

        {loading ? <Loader /> : rows.length === 0 ? (
          <Empty title="No exams yet" hint={canWrite ? 'Click "New Exam" to create one' : null} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {rows.map((e) => (
              <div
                key={e.id}
                className="relative group rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <button onClick={() => nav(`/exams/${e.id}`)} className="w-full text-left p-3 pr-16">
                  <div className="font-medium flex items-center gap-1.5">
                    {e.exam_name}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {e.class_name || 'All classes'}
                    {e.type_name ? ` · ${e.type_name}` : ''}
                  </div>
                  {(e.start_date || e.end_date) && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      {e.start_date} → {e.end_date || '?'}
                    </div>
                  )}
                </button>
                {canWrite && (
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setModal({ mode: 'edit', data: e }); }}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={(ev) => { ev.stopPropagation(); setConfirm({ id: e.id, name: e.exam_name }); }}
                        className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {modal && (
        <ExamModal
          mode={modal.mode}
          initial={modal.data}
          onClose={() => setModal(null)}
          onSaved={async (newId) => {
            setModal(null);
            await load();
            if (modal.mode === 'create' && newId) nav(`/exams/${newId}`);
          }}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete exam?"
        message={`${confirm?.name || ''} — all marks for this exam will be removed.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL + MARKS ENTRY
// ════════════════════════════════════════════════════════════

function ExamDetail({ examId }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grid, setGrid] = useState({}); // { [student_id]: { [subject_id]: { marks_obtained, remarks } } }

  const load = async () => {
    setLoading(true);
    try {
      const d = await examsApi.get(examId);
      setData(d);

      // Build editable grid from existing marks
      const g = {};
      (d.marks || []).forEach((m) => {
        g[m.student_id] = g[m.student_id] || {};
        g[m.student_id][m.subject_id] = {
          id: m.id,
          marks_obtained: m.marks_obtained,
          total_marks: m.total_marks,
          remarks: m.remarks || '',
        };
      });
      setGrid(g);
    } catch (e) { toast.error(e.message); setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [examId]);

  if (loading) return <Loader />;
  if (!data?.exam) return <Card><Empty title="Exam not found" /></Card>;

  const { exam, marks, students, subjects, summary } = data;
  const defaultTotal = exam.total_marks || 100;

  const cell = (student_id, subject_id) =>
    grid[student_id]?.[subject_id] || { marks_obtained: '', total_marks: defaultTotal, remarks: '' };

  const setCell = (student_id, subject_id, patch) => {
    setGrid((g) => ({
      ...g,
      [student_id]: {
        ...(g[student_id] || {}),
        [subject_id]: { ...cell(student_id, subject_id), ...patch },
      },
    }));
  };

  const saveAll = async () => {
    // Collect only filled-in cells
    const payload = [];
    for (const sid of Object.keys(grid)) {
      for (const subId of Object.keys(grid[sid])) {
        const c = grid[sid][subId];
        if (c.marks_obtained === '' || c.marks_obtained === null || c.marks_obtained === undefined) continue;
        const m = Number(c.marks_obtained);
        const t = Number(c.total_marks || defaultTotal);
        if (Number.isNaN(m) || Number.isNaN(t)) continue;
        if (m > t) {
          return toast.error(`Marks exceed total for one student (student ${sid})`);
        }
        payload.push({
          student_id: Number(sid),
          subject_id: Number(subId),
          marks_obtained: m,
          total_marks: t,
          remarks: c.remarks || null,
        });
      }
    }
    if (!payload.length) return toast.error('Nothing to save — enter at least one mark');

    setSaving(true);
    try {
      await examsApi.saveMarks(examId, payload);
      toast.success(`Saved ${payload.length} mark(s)`);
      await load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const totals = (student_id) => {
    let obtained = 0, total = 0;
    for (const subId of Object.keys(grid[student_id] || {})) {
      const c = grid[student_id][subId];
      const m = Number(c.marks_obtained);
      const t = Number(c.total_marks || defaultTotal);
      if (!Number.isNaN(m)) obtained += m;
      if (!Number.isNaN(t)) total += t;
    }
    return { obtained, total, pct: total ? Math.round((obtained / total) * 100) : 0 };
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav('/exams')} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to exams
      </button>

      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-600" />
              {exam.exam_name}
            </h2>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-3">
              <span>{exam.class_name || 'All classes'}</span>
              {exam.type_name && <span>{exam.type_name}</span>}
              {(exam.start_date || exam.end_date) && (
                <span className="font-mono text-xs">{exam.start_date} → {exam.end_date || '?'}</span>
              )}
            </div>
          </div>
          {canWrite && (
            <Button onClick={saveAll} loading={saving} icon={Save} className="bg-green-600 hover:bg-green-700">
              Save Marks
            </Button>
          )}
        </div>

        {summary && summary.marks_count > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <Stat label="Students" value={summary.student_count || 0} icon={Users} tone="blue" />
            <Stat label="Entries" value={summary.marks_count || 0} />
            <Stat label="Avg %" value={summary.avg_percentage ? (summary.avg_percentage * 100).toFixed(1) : '—'} icon={Percent} tone="green" />
            <Stat label="Top %" value={summary.max_percentage ? (summary.max_percentage * 100).toFixed(1) : '—'} icon={Award} tone="amber" />
          </div>
        )}
      </Card>

      {!students?.length ? (
        <Card><Empty title="No students in this class" hint="Add students first, then come back to enter marks." /></Card>
      ) : !subjects?.length ? (
        <Card><Empty title="No subjects defined for this class" hint="Create subjects for the class first." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-2 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 min-w-[180px]">Student</th>
                  {subjects.map((s) => (
                    <th key={s.id} className="text-center p-2 min-w-[110px]">{s.subject_name}</th>
                  ))}
                  <th className="text-center p-2 min-w-[80px]">Total</th>
                  <th className="text-center p-2 min-w-[70px]">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {students.map((st) => {
                  const t = totals(st.id);
                  return (
                    <tr key={st.id}>
                      <td className="p-2 sticky left-0 bg-white dark:bg-slate-900 z-10">
                        <div className="font-medium text-sm">{st.student_name}</div>
                        <div className="text-xs text-slate-500">
                          {st.section_name || ''} · Roll {st.roll_number || '—'}
                        </div>
                      </td>
                      {subjects.map((sub) => {
                        const c = cell(st.id, sub.id);
                        return (
                          <td key={sub.id} className="p-1 text-center">
                            <input
                              type="number"
                              min="0"
                              max={c.total_marks || defaultTotal}
                              value={c.marks_obtained}
                              disabled={!canWrite}
                              onChange={(e) => setCell(st.id, sub.id, { marks_obtained: e.target.value })}
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (v === '') return;
                                const num = Number(v);
                                const max = Number(c.total_marks || defaultTotal);
                                if (num < 0) setCell(st.id, sub.id, { marks_obtained: 0 });
                                if (num > max) setCell(st.id, sub.id, { marks_obtained: max });
                              }}
                              className="w-20 px-2 py-1 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
                              placeholder="—"
                            />
                            <div className="text-[10px] text-slate-400 mt-0.5">/{c.total_marks || defaultTotal}</div>
                          </td>
                        );
                      })}
                      <td className="p-2 text-center font-medium">
                        {t.obtained}<span className="text-slate-400">/{t.total}</span>
                      </td>
                      <td className={`p-2 text-center font-bold ${
                        t.pct >= 80 ? 'text-green-600' : t.pct >= 50 ? 'text-amber-600' : t.pct > 0 ? 'text-red-600' : 'text-slate-400'
                      }`}>
                        {t.total ? `${t.pct}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canWrite && students?.length && subjects?.length && (
        <div className="flex justify-end">
          <Button onClick={saveAll} loading={saving} icon={Save} className="bg-green-600 hover:bg-green-700">
            Save Marks
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone = 'slate' }) {
  const map = {
    slate: 'bg-slate-50 dark:bg-slate-800',
    green: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
    blue:  'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  };
  return (
    <div className={`p-3 rounded-xl ${map[tone]}`}>
      <div className="text-xs uppercase text-slate-500 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <div className="text-lg font-bold">{value ?? '—'}</div>
    </div>
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
    if "/exams/:examId" in src:
        print("  · already routed")
        return
    old = '<Route path="exams" element={<Exams />} />'
    new = ('<Route path="exams" element={<Exams />} />\n'
           '              <Route path="exams/:examId" element={<Exams />} />')
    if old in src:
        p.write_text(src.replace(old, new, 1))
        print("  ✓ added /exams/:examId route")
    else:
        print("  ! couldn't find exams route — add manually")


def verify():
    banner("verify")
    import subprocess
    files = [BE / "models/examModel.js", BE / "controllers/examController.js", BE / "routes/exams.js"]
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
    print(f"Exams CRUD — root: {ROOT}")
    gen_backend_model()
    gen_backend_controller()
    gen_backend_routes()
    gen_frontend_api()
    gen_frontend_modals()
    gen_frontend_page()
    gen_routes_patch()
    print()
    if not verify():
        sys.exit(1)
    print("\n" + "═" * 62)
    print("✅ Exams CRUD generated.")
    print("═" * 62)
    print("\nRestart:")
    print("  pkill -f node && cd ~/school/backend && npm run dev")
    print("  pkill -f vite && cd ~/school/frontend && npm run dev")
    print("\nUI:")
    print("  /exams           list + create + edit + delete")
    print("  /exams/:id       marks entry grid (student × subject) + totals + % + summary")


if __name__ == "__main__":
    main()
