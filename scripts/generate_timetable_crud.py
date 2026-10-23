#!/usr/bin/env python3
"""
Timetable CRUD:
  Backend : timetables table CRUD + conflict detection
  Frontend: weekly grid per section, add/edit/delete slots, teacher view

Run from ~/school:  python scripts/generate_timetable_crud.py
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

    write(BE, "models/timetableModel.js", r"""
const { run, get, all } = require('../config/database');

const TimetableModel = {
  // ─── Read ───
  list: (filters = {}) => {
    let sql = `
      SELECT t.*,
             sub.subject_name, sub.subject_code,
             sec.section_name, sec.room_number,
             c.id AS class_id, c.class_name, c.class_code,
             u.name AS teacher_name, te.employee_code
      FROM timetables t
      LEFT JOIN subjects sub ON t.subject_id = sub.id
      LEFT JOIN sections sec ON t.section_id = sec.id
      LEFT JOIN classes c ON sec.class_id = c.id
      LEFT JOIN teachers te ON t.teacher_id = te.id
      LEFT JOIN users u ON te.user_id = u.id
    `;
    const where = [];
    const params = [];
    if (filters.section_id) { where.push('t.section_id = ?'); params.push(filters.section_id); }
    if (filters.teacher_id) { where.push('t.teacher_id = ?'); params.push(filters.teacher_id); }
    if (filters.class_id)   { where.push('c.id = ?');         params.push(filters.class_id); }
    if (filters.day)        { where.push('t.day_of_week = ?'); params.push(filters.day); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ` ORDER BY CASE t.day_of_week
        WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
        WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6
        ELSE 7 END, t.start_time`;
    return all(sql, params);
  },

  findById: (id) =>
    get(
      `SELECT t.*,
              sub.subject_name, sub.subject_code,
              sec.section_name, c.class_name,
              u.name AS teacher_name
       FROM timetables t
       LEFT JOIN subjects sub ON t.subject_id = sub.id
       LEFT JOIN sections sec ON t.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       LEFT JOIN teachers te ON t.teacher_id = te.id
       LEFT JOIN users u ON te.user_id = u.id
       WHERE t.id = ?`,
      [id]
    ),

  // ─── Conflict detection ───
  // Same section + same day + overlapping time
  sectionConflict: ({ section_id, day_of_week, start_time, end_time, except_id = null }) =>
    get(
      `SELECT id, start_time, end_time
       FROM timetables
       WHERE section_id = ? AND day_of_week = ? AND is_active = 1
         AND (? IS NULL OR id != ?)
         AND (start_time < ? AND end_time > ?)`,
      [section_id, day_of_week, except_id, except_id, end_time, start_time]
    ),

  // Same teacher + same day + overlapping time
  teacherConflict: ({ teacher_id, day_of_week, start_time, end_time, except_id = null }) => {
    if (!teacher_id) return Promise.resolve(null);
    return get(
      `SELECT t.id, t.start_time, t.end_time, sec.section_name, c.class_name
       FROM timetables t
       LEFT JOIN sections sec ON t.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       WHERE t.teacher_id = ? AND t.day_of_week = ? AND t.is_active = 1
         AND (? IS NULL OR t.id != ?)
         AND (t.start_time < ? AND t.end_time > ?)`,
      [teacher_id, day_of_week, except_id, except_id, end_time, start_time]
    );
  },

  // ─── Write ───
  create: ({ section_id, subject_id, teacher_id = null, day_of_week,
             start_time, end_time, room_number = null }) =>
    run(
      `INSERT INTO timetables
         (section_id, subject_id, teacher_id, day_of_week, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [section_id, subject_id, teacher_id, day_of_week, start_time, end_time]
    ),

  update: (id, patch) => {
    const allowed = ['section_id', 'subject_id', 'teacher_id',
                     'day_of_week', 'start_time', 'end_time', 'is_active'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE timetables SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  remove: (id) => run(`DELETE FROM timetables WHERE id = ?`, [id]),

  // ─── Lookups for the form ───
  subjectsForSection: (section_id) =>
    all(
      `SELECT sub.id, sub.subject_name, sub.subject_code
       FROM subjects sub
       JOIN sections sec ON sec.id = ?
       WHERE sub.class_id = sec.class_id OR sub.class_id IS NULL
       ORDER BY sub.subject_name`,
      [section_id]
    ),

  teachersList: () =>
    all(
      `SELECT t.id, t.employee_code, u.name, u.email
       FROM teachers t
       JOIN users u ON t.user_id = u.id
       ORDER BY u.name`
    ),

  // ─── Weekly grid (per section) ───
  weeklyForSection: (section_id) =>
    all(
      `SELECT t.id, t.day_of_week, t.start_time, t.end_time,
              sub.id AS subject_id, sub.subject_name,
              te.id AS teacher_id, u.name AS teacher_name
       FROM timetables t
       LEFT JOIN subjects sub ON t.subject_id = sub.id
       LEFT JOIN teachers te ON t.teacher_id = te.id
       LEFT JOIN users u ON te.user_id = u.id
       WHERE t.section_id = ? AND t.is_active = 1
       ORDER BY t.start_time`,
      [section_id]
    ),
};

module.exports = TimetableModel;
""".strip())


def gen_backend_controller():
    banner("backend controller")

    write(BE, "controllers/timetableController.js", r"""
const TimetableModel = require('../models/timetableModel');
const ClassModel = require('../models/classModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const isTime = (s) => /^\d{2}:\d{2}(:\d{2})?$/.test(s);

const normalizeTime = (s) => (s.length === 5 ? `${s}:00` : s);

// ─── List ───
const listTimetable = async (req, res, next) => {
  try {
    const rows = await TimetableModel.list({
      section_id: req.query.section_id ? Number(req.query.section_id) : undefined,
      teacher_id: req.query.teacher_id ? Number(req.query.teacher_id) : undefined,
      class_id:   req.query.class_id   ? Number(req.query.class_id)   : undefined,
      day:        req.query.day || undefined,
    });
    return apiResponse(res, 200, true, 'Timetable', rows);
  } catch (e) { next(e); }
};

// ─── Weekly grid for one section ───
const weeklyGrid = async (req, res, next) => {
  try {
    const section_id = Number(req.params.sectionId);
    const sec = await ClassModel.findSection(section_id);
    if (!sec) return apiResponse(res, 404, false, 'Section not found');

    const [slots, subjects, teachers] = await Promise.all([
      TimetableModel.weeklyForSection(section_id),
      TimetableModel.subjectsForSection(section_id),
      TimetableModel.teachersList(),
    ]);

    return apiResponse(res, 200, true, 'Weekly grid', {
      section: sec,
      slots,
      subjects,
      teachers,
      days: DAYS,
    });
  } catch (e) { next(e); }
};

// ─── Get one ───
const getSlot = async (req, res, next) => {
  try {
    const slot = await TimetableModel.findById(Number(req.params.id));
    if (!slot) return apiResponse(res, 404, false, 'Slot not found');
    return apiResponse(res, 200, true, 'Slot', slot);
  } catch (e) { next(e); }
};

// ─── Create ───
const createSlot = async (req, res, next) => {
  try {
    const { section_id, subject_id, teacher_id, day_of_week,
            start_time, end_time } = req.body;

    if (!section_id) return apiResponse(res, 400, false, 'section_id required');
    if (!subject_id) return apiResponse(res, 400, false, 'subject_id required');
    if (!day_of_week || !DAYS.includes(day_of_week))
      return apiResponse(res, 400, false, `day_of_week must be one of ${DAYS.join(', ')}`);
    if (!start_time || !end_time || !isTime(start_time) || !isTime(end_time))
      return apiResponse(res, 400, false, 'start_time and end_time must be HH:MM');

    const start = normalizeTime(start_time);
    const end = normalizeTime(end_time);
    if (start >= end)
      return apiResponse(res, 400, false, 'start_time must be before end_time');

    const sec = await ClassModel.findSection(Number(section_id));
    if (!sec) return apiResponse(res, 404, false, 'Section not found');

    // Section conflict
    const secConflict = await TimetableModel.sectionConflict({
      section_id: Number(section_id),
      day_of_week, start_time: start, end_time: end,
    });
    if (secConflict)
      return apiResponse(res, 409, false,
        `Section already has ${secConflict.start_time}–${secConflict.end_time} on ${day_of_week}`);

    // Teacher conflict
    if (teacher_id) {
      const tConflict = await TimetableModel.teacherConflict({
        teacher_id: Number(teacher_id),
        day_of_week, start_time: start, end_time: end,
      });
      if (tConflict)
        return apiResponse(res, 409, false,
          `Teacher is busy on ${day_of_week} ${tConflict.start_time}–${tConflict.end_time}`
          + (tConflict.class_name ? ` (${tConflict.class_name} ${tConflict.section_name})` : ''));
    }

    const { lastID } = await TimetableModel.create({
      section_id: Number(section_id),
      subject_id: Number(subject_id),
      teacher_id: teacher_id ? Number(teacher_id) : null,
      day_of_week, start_time: start, end_time: end,
    });

    logger.audit(`Timetable slot created: ${day_of_week} ${start}–${end} (id=${lastID})`);
    return apiResponse(res, 201, true, 'Slot created', { id: lastID });
  } catch (e) { next(e); }
};

// ─── Update ───
const updateSlot = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await TimetableModel.findById(id);
    if (!existing) return apiResponse(res, 404, false, 'Slot not found');

    const next_vals = {
      section_id: req.body.section_id ?? existing.section_id,
      subject_id: req.body.subject_id ?? existing.subject_id,
      teacher_id: req.body.teacher_id ?? existing.teacher_id,
      day_of_week: req.body.day_of_week ?? existing.day_of_week,
      start_time: normalizeTime(req.body.start_time ?? existing.start_time),
      end_time: normalizeTime(req.body.end_time ?? existing.end_time),
    };

    if (next_vals.start_time >= next_vals.end_time)
      return apiResponse(res, 400, false, 'start_time must be before end_time');

    // Section conflict (exclude self)
    const secConflict = await TimetableModel.sectionConflict({
      section_id: next_vals.section_id,
      day_of_week: next_vals.day_of_week,
      start_time: next_vals.start_time,
      end_time: next_vals.end_time,
      except_id: id,
    });
    if (secConflict)
      return apiResponse(res, 409, false,
        `Section already busy ${secConflict.start_time}–${secConflict.end_time} on ${next_vals.day_of_week}`);

    if (next_vals.teacher_id) {
      const tConflict = await TimetableModel.teacherConflict({
        teacher_id: next_vals.teacher_id,
        day_of_week: next_vals.day_of_week,
        start_time: next_vals.start_time,
        end_time: next_vals.end_time,
        except_id: id,
      });
      if (tConflict)
        return apiResponse(res, 409, false,
          `Teacher is busy ${tConflict.start_time}–${tConflict.end_time} on ${next_vals.day_of_week}`);
    }

    await TimetableModel.update(id, next_vals);
    logger.audit(`Timetable slot updated: id=${id}`);
    return apiResponse(res, 200, true, 'Slot updated');
  } catch (e) { next(e); }
};

// ─── Delete ───
const deleteSlot = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const slot = await TimetableModel.findById(id);
    if (!slot) return apiResponse(res, 404, false, 'Slot not found');
    await TimetableModel.remove(id);
    logger.audit(`Timetable slot deleted: id=${id}`);
    return apiResponse(res, 200, true, 'Slot deleted');
  } catch (e) { next(e); }
};

module.exports = {
  listTimetable, weeklyGrid, getSlot,
  createSlot, updateSlot, deleteSlot,
};
""".strip())


def gen_backend_routes():
    banner("backend routes")

    write(BE, "routes/timetable.js", r"""
const express = require('express');
const c = require('../controllers/timetableController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize('admin', 'teacher', 'accountant'), c.listTimetable);
router.get('/section/:sectionId', authorize('admin', 'teacher', 'accountant'), c.weeklyGrid);
router.get('/:id', authorize('admin', 'teacher', 'accountant'), c.getSlot);
router.post('/', authorize('admin'), c.createSlot);
router.patch('/:id', authorize('admin'), c.updateSlot);
router.delete('/:id', authorize('admin'), c.deleteSlot);

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
    pattern = re.compile(r"export const timetableApi = \{.*?\n\};", re.DOTALL)
    replacement = """export const timetableApi = {
  list: (params) => unwrap(client.get('/timetable', { params })),
  bySection: (sectionId) => unwrap(client.get(`/timetable/section/${sectionId}`)),
  get: (id) => unwrap(client.get(`/timetable/${id}`)),
  create: (p) => unwrap(client.post('/timetable', p)),
  update: (id, p) => unwrap(client.patch(`/timetable/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/timetable/${id}`)),
};"""
    if pattern.search(src):
        src = pattern.sub(replacement, src, count=1)
        p.write_text(src)
        print("  ✓ expanded timetableApi")
    else:
        print("  ! couldn't find timetableApi block — patch manually")


def gen_frontend_modal():
    banner("TimetableModal")

    write(FE, "src/components/TimetableModal.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { timetableApi } from '../api/endpoints';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TimetableModal({
  mode = 'create',
  sectionId,
  initial = null,
  subjects = [],
  teachers = [],
  defaultDay = 'Monday',
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState({
    subject_id: initial?.subject_id || '',
    teacher_id: initial?.teacher_id || '',
    day_of_week: initial?.day_of_week || defaultDay,
    start_time: initial?.start_time ? initial.start_time.slice(0, 5) : '08:00',
    end_time: initial?.end_time ? initial.end_time.slice(0, 5) : '08:45',
  });
  const [saving, setSaving] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.subject_id) return toast.error('Pick a subject');
    if (!form.start_time || !form.end_time) return toast.error('Set start and end times');
    if (form.start_time >= form.end_time) return toast.error('Start must be before end');

    setSaving(true);
    try {
      const payload = {
        section_id: sectionId,
        subject_id: Number(form.subject_id),
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
        day_of_week: form.day_of_week,
        start_time: form.start_time,
        end_time: form.end_time,
      };
      if (mode === 'create') {
        await timetableApi.create(payload);
        toast.success('Slot added');
      } else {
        await timetableApi.update(initial.id, payload);
        toast.success('Slot updated');
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
      title={mode === 'create' ? 'Add Slot' : 'Edit Slot'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Add Slot' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Subject *</label>
          <select name="subject_id" value={form.subject_id} onChange={onChange} className="input">
            <option value="">Select subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.subject_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Teacher (optional)</label>
          <select name="teacher_id" value={form.teacher_id} onChange={onChange} className="input">
            <option value="">Unassigned</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Day *</label>
          <select name="day_of_week" value={form.day_of_week} onChange={onChange} className="input">
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Start time *" name="start_time" type="time" value={form.start_time} onChange={onChange} />
          <Input label="End time *" name="end_time" type="time" value={form.end_time} onChange={onChange} />
        </div>

        <div className="text-xs text-slate-500 pt-1">
          Conflicts with existing slots (same section or same teacher) will be rejected.
        </div>
      </form>
    </Modal>
  );
}
""".strip())


def gen_frontend_page():
    banner("Timetable.jsx")

    write(FE, "src/pages/Timetable.jsx", r"""
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BookOpen, Plus, Pencil, Trash2, Calendar, Clock, User, Layers,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import TimetableModal from '../components/TimetableModal';
import { classesApi, timetableApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Timetable() {
  const { sectionId: urlSectionId } = useParams();
  const [search, setSearch] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [classId, setClassId] = useState(search.get('class') || '');
  const [sectionId, setSectionId] = useState(urlSectionId || search.get('section') || '');

  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  // Load classes
  useEffect(() => {
    classesApi.list().then((d) => setClasses(d || [])).catch(() => setClasses([]));
  }, []);

  // Load sections when class changes
  useEffect(() => {
    if (!classId) { setSections([]); return; }
    classesApi.sections(classId).then((d) => setSections(d || [])).catch(() => setSections([]));
  }, [classId]);

  // Load grid when section changes
  const loadGrid = async () => {
    if (!sectionId) { setGrid(null); return; }
    setLoading(true);
    try {
      const d = await timetableApi.bySection(sectionId);
      setGrid(d);
    } catch (e) { toast.error(e.message); setGrid(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadGrid(); }, [sectionId]);

  // Keep URL in sync
  useEffect(() => {
    if (!sectionId) return;
    const next = new URLSearchParams(search);
    if (classId) next.set('class', classId);
    next.set('section', sectionId);
    setSearch(next, { replace: true });
  }, [sectionId, classId]);

  // ─── Actions ───
  const handleDelete = async () => {
    try {
      await timetableApi.remove(confirm.id);
      toast.success('Slot removed');
      setConfirm(null);
      await loadGrid();
    } catch (e) { toast.error(e.message); }
  };

  // Group slots by day
  const byDay = useMemo(() => {
    const map = {};
    DAYS.forEach((d) => { map[d] = []; });
    (grid?.slots || []).forEach((s) => {
      if (!map[s.day_of_week]) map[s.day_of_week] = [];
      map[s.day_of_week].push(s);
    });
    Object.keys(map).forEach((d) =>
      map[d].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    );
    return map;
  }, [grid]);

  const currentClass = classes.find((c) => String(c.id) === String(classId));
  const currentSection = sections.find((s) => String(s.id) === String(sectionId));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-600" /> Timetable
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" /> Class
            </label>
            <select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); }}
                    className="input">
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" /> Section
            </label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}
                    className="input" disabled={!classId}>
              <option value="">{classId ? 'Select section' : 'Pick a class first'}</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>Section {s.section_name}</option>
              ))}
            </select>
          </div>

          {isAdmin && sectionId && (
            <div className="flex items-end">
              <Button icon={Plus} className="w-full" onClick={() =>
                setModal({ mode: 'create', day: DAYS[0] })
              }>
                Add Slot
              </Button>
            </div>
          )}
        </div>

        {(currentClass || currentSection) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {currentClass && <span className="badge badge-blue">Class: {currentClass.class_name}</span>}
            {currentSection && <span className="badge badge-purple">Section: {currentSection.section_name}</span>}
            {grid?.slots?.length > 0 && (
              <span className="badge badge-gray">{grid.slots.length} slot(s)</span>
            )}
          </div>
        )}
      </Card>

      {/* Grid */}
      {!sectionId ? (
        <Card><Empty title="Pick a class and section" hint="Then you can view or edit its weekly timetable" /></Card>
      ) : loading ? (
        <Loader />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {DAYS.map((day) => {
            const slots = byDay[day] || [];
            return (
              <Card key={day} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-sm">{day}</h4>
                  {isAdmin && (
                    <button
                      onClick={() => setModal({ mode: 'create', day })}
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                      title={`Add slot on ${day}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {slots.length === 0 ? (
                  <div className="text-xs text-slate-400 py-3 text-center">
                    No slots
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {slots.map((s) => (
                      <div
                        key={s.id}
                        className="group relative rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                      >
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                          <Clock className="w-3 h-3" />
                          {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                        </div>
                        <div className="font-medium text-sm mt-0.5 truncate">
                          {s.subject_name || '—'}
                        </div>
                        {s.teacher_name && (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" /> {s.teacher_name}
                          </div>
                        )}

                        {isAdmin && (
                          <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => setModal({ mode: 'edit', slot: s, day })}
                              className="p-1 rounded bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600"
                              title="Edit"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setConfirm({ id: s.id, name: `${s.subject_name} on ${s.day_of_week}` })}
                              className="p-1 rounded bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {modal && grid && (
        <TimetableModal
          mode={modal.mode}
          sectionId={Number(sectionId)}
          initial={modal.slot}
          defaultDay={modal.day}
          subjects={grid.subjects || []}
          teachers={grid.teachers || []}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await loadGrid(); }}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete slot?"
        message={`${confirm?.name || ''} — this cannot be undone.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
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
    if 'path="timetable/:sectionId"' in src:
        print("  · already routed")
        return
    old = '<Route path="timetable" element={<Timetable />} />'
    new = ('<Route path="timetable" element={<Timetable />} />\n'
           '              <Route path="timetable/:sectionId" element={<Timetable />} />')
    if old in src:
        p.write_text(src.replace(old, new, 1))
        print("  ✓ added /timetable/:sectionId route")
    else:
        print("  ! couldn't find timetable route — add manually")


def verify():
    banner("verify")
    import subprocess
    files = [
        BE / "models/timetableModel.js",
        BE / "controllers/timetableController.js",
        BE / "routes/timetable.js",
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
    print(f"Timetable CRUD — root: {ROOT}")
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
    print("✅ Timetable CRUD generated.")
    print("═" * 62)
    print("\nRestart:")
    print("  ~/school/start.sh --stop")
    print("  ~/school/start.sh")
    print("\nUI:")
    print("  /timetable                 pick class → section → weekly grid")
    print("  /timetable/:sectionId      direct deep-link")


if __name__ == "__main__":
    main()
