#!/usr/bin/env python3
"""
Classes & Sections CRUD.
Backend: full CRUD with cascade rules.
Frontend: management page + hooks into existing Classes browser.

Run from ~/school:  python scripts/generate_classes_crud.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT = HERE.parent.parent if HERE.parent.name == "scripts" else Path.cwd()
BE = ROOT / "backend"
FE = ROOT / "frontend"


def write(base: Path, rel: str, content: str):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")
    print(f"  ✓ {p.relative_to(ROOT)}")


def banner(msg):
    print(f"\n── {msg} " + "─" * max(0, 60 - len(msg)))


# ════════════════════════════════════════════════════════════
# BACKEND
# ════════════════════════════════════════════════════════════

def gen_backend_model():
    banner("backend model")

    write(BE, "models/classModel.js", r"""
const { run, get, all } = require('../config/database');

const ClassModel = {
  // ─── Classes ───
  listClasses: () =>
    all(
      `SELECT c.id, c.class_name, c.class_code, c.created_at,
              COUNT(DISTINCT sec.id) AS section_count,
              COUNT(DISTINCT s.id)   AS student_count
       FROM classes c
       LEFT JOIN sections sec ON sec.class_id = c.id
       LEFT JOIN students s   ON s.section_id = sec.id
       GROUP BY c.id, c.class_name, c.class_code
       ORDER BY c.class_name`
    ),

  findClass: (id) => get(`SELECT * FROM classes WHERE id = ?`, [id]),

  classHasSections: (id) =>
    get(`SELECT COUNT(*) AS c FROM sections WHERE class_id = ?`, [id]).then((r) => (r?.c || 0) > 0),

  createClass: ({ class_name, class_code = null }) =>
    run(`INSERT INTO classes (class_name, class_code) VALUES (?, ?)`, [class_name, class_code]),

  updateClass: (id, { class_name, class_code }) =>
    run(`UPDATE classes SET class_name = ?, class_code = ? WHERE id = ?`,
        [class_name, class_code, id]),

  removeClass: (id) => run(`DELETE FROM classes WHERE id = ?`, [id]),

  // ─── Sections ───
  listSections: (class_id) =>
    all(
      `SELECT sec.id, sec.section_name, sec.room_number, sec.class_id,
              COUNT(s.id) AS student_count
       FROM sections sec
       LEFT JOIN students s ON s.section_id = sec.id
       WHERE sec.class_id = ?
       GROUP BY sec.id, sec.section_name, sec.room_number
       ORDER BY sec.section_name`,
      [class_id]
    ),

  findSection: (id) => get(`SELECT * FROM sections WHERE id = ?`, [id]),

  sectionHasStudents: (id) =>
    get(`SELECT COUNT(*) AS c FROM students WHERE section_id = ?`, [id]).then((r) => (r?.c || 0) > 0),

  sectionNameTaken: (class_id, section_name, except_id = null) =>
    get(
      `SELECT id FROM sections
       WHERE class_id = ? AND LOWER(section_name) = LOWER(?)
         AND (? IS NULL OR id != ?)`,
      [class_id, section_name, except_id, except_id]
    ),

  createSection: ({ class_id, section_name, room_number = null }) =>
    run(`INSERT INTO sections (class_id, section_name, room_number) VALUES (?, ?, ?)`,
        [class_id, section_name, room_number]),

  updateSection: (id, { section_name, room_number }) =>
    run(`UPDATE sections SET section_name = ?, room_number = ? WHERE id = ?`,
        [section_name, room_number, id]),

  removeSection: (id) => run(`DELETE FROM sections WHERE id = ?`, [id]),

  // ─── Bulk create sections (A, B, C ...) ───
  bulkCreateSections: async (class_id, names) => {
    const created = [];
    for (const name of names) {
      const trimmed = String(name).trim().toUpperCase();
      if (!trimmed) continue;
      const exists = await ClassModel.sectionNameTaken(class_id, trimmed);
      if (exists) continue;
      const { lastID } = await ClassModel.createSection({
        class_id, section_name: trimmed,
      });
      created.push({ id: lastID, section_name: trimmed });
    }
    return created;
  },

  // ─── Browse ───
  studentsInSection: (section_id) =>
    all(
      `SELECT s.id, u.name AS student_name, u.email,
              s.admission_number, s.roll_number, s.gender
       FROM students s
       JOIN users u ON s.user_id = u.id
       WHERE s.section_id = ?
       ORDER BY s.roll_number, u.name`,
      [section_id]
    ),
};

module.exports = ClassModel;
""".strip())


def gen_backend_controller():
    banner("backend controller")

    write(BE, "controllers/classController.js", r"""
const ClassModel = require('../models/classModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── List classes ───
const listClasses = async (_req, res, next) => {
  try {
    const rows = await ClassModel.listClasses();
    return apiResponse(res, 200, true, 'Classes', rows);
  } catch (e) { next(e); }
};

// ─── Get one class (with sections) ───
const getClass = async (req, res, next) => {
  try {
    const id = Number(req.params.classId);
    const cls = await ClassModel.findClass(id);
    if (!cls) return apiResponse(res, 404, false, 'Class not found');

    const sections = await ClassModel.listSections(id);
    return apiResponse(res, 200, true, 'Class', { ...cls, sections });
  } catch (e) { next(e); }
};

// ─── Create class ───
const createClass = async (req, res, next) => {
  try {
    const { class_name, class_code = null, sections = null } = req.body;
    if (!class_name || !class_name.trim())
      return apiResponse(res, 400, false, 'class_name required');

    const { lastID } = await ClassModel.createClass({
      class_name: class_name.trim(), class_code: class_code || null,
    });

    // Optional: bulk-create sections on class creation
    let created_sections = [];
    if (Array.isArray(sections) && sections.length) {
      created_sections = await ClassModel.bulkCreateSections(lastID, sections);
    }

    logger.audit(`Class created: ${class_name} (id=${lastID})`);
    return apiResponse(res, 201, true, 'Class created', {
      id: lastID, sections: created_sections,
    });
  } catch (e) { next(e); }
};

// ─── Update class ───
const updateClass = async (req, res, next) => {
  try {
    const id = Number(req.params.classId);
    const existing = await ClassModel.findClass(id);
    if (!existing) return apiResponse(res, 404, false, 'Class not found');

    const class_name = (req.body.class_name ?? existing.class_name).trim();
    const class_code = req.body.class_code ?? existing.class_code;

    await ClassModel.updateClass(id, { class_name, class_code });
    logger.audit(`Class updated: id=${id}`);
    return apiResponse(res, 200, true, 'Class updated');
  } catch (e) { next(e); }
};

// ─── Delete class (blocks if sections exist) ───
const deleteClass = async (req, res, next) => {
  try {
    const id = Number(req.params.classId);
    const cls = await ClassModel.findClass(id);
    if (!cls) return apiResponse(res, 404, false, 'Class not found');

    const hasSections = await ClassModel.classHasSections(id);
    if (hasSections)
      return apiResponse(res, 409, false,
        'This class has sections. Delete its sections first or use ?cascade=true');

    if (req.query.cascade === 'true') {
      const sections = await ClassModel.listSections(id);
      for (const s of sections) {
        const hasStudents = await ClassModel.sectionHasStudents(s.id);
        if (hasStudents)
          return apiResponse(res, 409, false,
            `Section ${s.section_name} still has students`);
        await ClassModel.removeSection(s.id);
      }
    }

    await ClassModel.removeClass(id);
    logger.audit(`Class deleted: ${cls.class_name} (id=${id})`);
    return apiResponse(res, 200, true, 'Class deleted');
  } catch (e) { next(e); }
};

// ─── List sections of a class ───
const listSections = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    const cls = await ClassModel.findClass(classId);
    if (!cls) return apiResponse(res, 404, false, 'Class not found');
    return apiResponse(res, 200, true, 'Sections', await ClassModel.listSections(classId));
  } catch (e) { next(e); }
};

// ─── Create section ───
const createSection = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    const cls = await ClassModel.findClass(classId);
    if (!cls) return apiResponse(res, 404, false, 'Class not found');

    const { section_name, room_number = null } = req.body;
    if (!section_name || !section_name.trim())
      return apiResponse(res, 400, false, 'section_name required');

    const normalized = section_name.trim().toUpperCase();
    const taken = await ClassModel.sectionNameTaken(classId, normalized);
    if (taken)
      return apiResponse(res, 409, false, `Section ${normalized} already exists`);

    const { lastID } = await ClassModel.createSection({
      class_id: classId,
      section_name: normalized,
      room_number: room_number || null,
    });

    logger.audit(`Section ${normalized} created in class id=${classId}`);
    return apiResponse(res, 201, true, 'Section created', {
      id: lastID, section_name: normalized, room_number,
    });
  } catch (e) { next(e); }
};

// ─── Bulk create sections (A, B, C ...) ───
const bulkCreateSections = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    const cls = await ClassModel.findClass(classId);
    if (!cls) return apiResponse(res, 404, false, 'Class not found');

    const { sections } = req.body;
    if (!Array.isArray(sections) || !sections.length)
      return apiResponse(res, 400, false, 'sections[] required');

    const created = await ClassModel.bulkCreateSections(classId, sections);
    logger.audit(`Bulk created ${created.length} section(s) in class id=${classId}`);
    return apiResponse(res, 201, true, `${created.length} section(s) created`, created);
  } catch (e) { next(e); }
};

// ─── Update section ───
const updateSection = async (req, res, next) => {
  try {
    const id = Number(req.params.sectionId);
    const sec = await ClassModel.findSection(id);
    if (!sec) return apiResponse(res, 404, false, 'Section not found');

    const next_name = (req.body.section_name ?? sec.section_name).trim().toUpperCase();
    const room_number = req.body.room_number ?? sec.room_number;

    if (next_name !== sec.section_name) {
      const taken = await ClassModel.sectionNameTaken(sec.class_id, next_name, id);
      if (taken) return apiResponse(res, 409, false, `Section ${next_name} already exists`);
    }

    await ClassModel.updateSection(id, { section_name: next_name, room_number });
    logger.audit(`Section updated: id=${id}`);
    return apiResponse(res, 200, true, 'Section updated');
  } catch (e) { next(e); }
};

// ─── Delete section ───
const deleteSection = async (req, res, next) => {
  try {
    const id = Number(req.params.sectionId);
    const sec = await ClassModel.findSection(id);
    if (!sec) return apiResponse(res, 404, false, 'Section not found');

    const hasStudents = await ClassModel.sectionHasStudents(id);
    if (hasStudents && req.query.force !== 'true')
      return apiResponse(res, 409, false,
        'Section has students. Reassign them first, or pass ?force=true to orphan them.');

    await ClassModel.removeSection(id);
    logger.audit(`Section deleted: ${sec.section_name} (id=${id})`);
    return apiResponse(res, 200, true, 'Section deleted');
  } catch (e) { next(e); }
};

// ─── Students in section ───
const listStudentsInSection = async (req, res, next) => {
  try {
    const rows = await ClassModel.studentsInSection(Number(req.params.sectionId));
    return apiResponse(res, 200, true, 'Students', rows);
  } catch (e) { next(e); }
};

module.exports = {
  listClasses, getClass, createClass, updateClass, deleteClass,
  listSections, createSection, bulkCreateSections, updateSection, deleteSection,
  listStudentsInSection,
};
""".strip())


def gen_backend_routes():
    banner("backend routes")

    write(BE, "routes/classes.js", r"""
const express = require('express');
const c = require('../controllers/classController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Classes
router.get('/', authorize('admin', 'teacher', 'accountant'), c.listClasses);
router.post('/', authorize('admin'), c.createClass);
router.get('/:classId', authorize('admin', 'teacher', 'accountant'), c.getClass);
router.patch('/:classId', authorize('admin'), c.updateClass);
router.delete('/:classId', authorize('admin'), c.deleteClass);

// Sections of a class
router.get('/:classId/sections', authorize('admin', 'teacher', 'accountant'), c.listSections);
router.post('/:classId/sections', authorize('admin'), c.createSection);
router.post('/:classId/sections/bulk', authorize('admin'), c.bulkCreateSections);

// Sections directly
router.patch('/sections/:sectionId', authorize('admin'), c.updateSection);
router.delete('/sections/:sectionId', authorize('admin'), c.deleteSection);
router.get('/sections/:sectionId/students', authorize('admin', 'teacher', 'accountant'), c.listStudentsInSection);

module.exports = router;
""".strip())


# ════════════════════════════════════════════════════════════
# FRONTEND
# ════════════════════════════════════════════════════════════

def gen_frontend_api_patch():
    banner("frontend api")

    p = FE / "src/api/endpoints.js"
    if not p.exists():
        print("  ! endpoints.js missing")
        return

    src = p.read_text()
    if "createSectionBulk" in src:
        print("  · already patched")
        return

    old = """export const classesApi = {"""
    new = """export const classesApi = {
  get: (classId) => unwrap(client.get(`/classes/${classId}`)),
  update: (classId, p) => unwrap(client.patch(`/classes/${classId}`, p)),
  remove: (classId, cascade) =>
    unwrap(client.delete(`/classes/${classId}${cascade ? '?cascade=true' : ''}`)),
  createSectionBulk: (classId, sections) =>
    unwrap(client.post(`/classes/${classId}/sections/bulk`, { sections })),
  updateSection: (sectionId, p) =>
    unwrap(client.patch(`/classes/sections/${sectionId}`, p)),
  removeSection: (sectionId, force) =>
    unwrap(client.delete(`/classes/sections/${sectionId}${force ? '?force=true' : ''}`)),"""
    src = src.replace(old, new, 1)
    p.write_text(src)
    print("  ✓ patched frontend/src/api/endpoints.js")


def gen_frontend_page():
    banner("frontend page")

    write(FE, "src/pages/Classes.jsx", r"""
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  School, Layers, Users, ChevronRight, Plus, Trash2, Pencil,
  X, Save, Building2,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import Modal from '../components/Modal';
import ConfirmDelete from '../components/ConfirmDelete';
import { classesApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function Classes() {
  const { classId, sectionId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Modal state
  const [classModal, setClassModal] = useState(null);   // null | {mode:'create'|'edit', data}
  const [sectionModal, setSectionModal] = useState(null); // null | {mode:'create'|'bulk'|'edit', data}
  const [confirm, setConfirm] = useState(null);           // null | {type:'class'|'section', id, name}

  // ─── Loaders ───
  const loadClasses = async () => {
    setLoadingClasses(true);
    try {
      const d = await classesApi.list();
      setClasses(d || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoadingClasses(false); }
  };

  const loadSections = async (cid) => {
    if (!cid) { setSections([]); return; }
    setLoadingSections(true);
    try {
      const d = await classesApi.sections(cid);
      setSections(d || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoadingSections(false); }
  };

  const loadStudents = async (sid) => {
    if (!sid) { setStudents([]); return; }
    setLoadingStudents(true);
    try {
      const d = await classesApi.students(sid);
      setStudents(d || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoadingStudents(false); }
  };

  useEffect(() => { loadClasses(); }, []);
  useEffect(() => { loadSections(classId); }, [classId]);
  useEffect(() => { loadStudents(sectionId); }, [sectionId]);

  // ─── Class actions ───
  const saveClass = async (values) => {
    try {
      if (classModal?.mode === 'create') {
        const res = await classesApi.createClass(values);
        toast.success('Class created');
        setClassModal(null);
        await loadClasses();
        if (res?.id) nav(`/classes/${res.id}`);
      } else {
        await classesApi.update(classId, values);
        toast.success('Class updated');
        setClassModal(null);
        await loadClasses();
      }
    } catch (e) { toast.error(e.message); }
  };

  const deleteClass = async () => {
    try {
      const id = confirm.id;
      await classesApi.remove(id, true);
      toast.success('Class deleted');
      setConfirm(null);
      if (String(id) === String(classId)) nav('/classes');
      await loadClasses();
    } catch (e) { toast.error(e.message); }
  };

  // ─── Section actions ───
  const saveSection = async (values) => {
    try {
      if (sectionModal?.mode === 'bulk') {
        const res = await classesApi.createSectionBulk(classId, values.names);
        toast.success(`${res?.length || 0} section(s) created`);
      } else if (sectionModal?.mode === 'create') {
        await classesApi.createSection(classId, values);
        toast.success('Section created');
      } else {
        await classesApi.updateSection(sectionModal.data.id, values);
        toast.success('Section updated');
      }
      setSectionModal(null);
      await loadSections(classId);
    } catch (e) { toast.error(e.message); }
  };

  const deleteSection = async () => {
    try {
      const id = confirm.id;
      await classesApi.removeSection(id, true);
      toast.success('Section deleted');
      setConfirm(null);
      if (String(id) === String(sectionId)) nav(`/classes/${classId}`);
      await loadSections(classId);
    } catch (e) { toast.error(e.message); }
  };

  const currentClass = classes.find((c) => String(c.id) === String(classId));
  const currentSection = sections.find((s) => String(s.id) === String(sectionId));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ═══ Classes ═══ */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <School className="w-4 h-4 text-brand-600" /> Classes ({classes.length})
          </h3>
          {isAdmin && (
            <Button size="sm" icon={Plus}
              onClick={() => setClassModal({ mode: 'create', data: { class_name: '', class_code: '' } })}>
              New Class
            </Button>
          )}
        </div>

        {loadingClasses ? <Loader /> : classes.length === 0 ? (
          <Empty title="No classes yet" hint={isAdmin ? 'Click "New Class" to add one' : 'Ask admin to add classes'} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {classes.map((c) => {
              const active = String(c.id) === String(classId);
              return (
                <div key={c.id}
                  className={`relative group rounded-xl border transition ${
                    active
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}>
                  <button
                    onClick={() => nav(`/classes/${c.id}`)}
                    className="w-full text-left p-3 pr-16"
                  >
                    <div className="font-medium flex items-center gap-1.5">
                      {c.class_name}
                      {c.class_code && (
                        <span className="text-xs font-mono text-slate-500">({c.class_code})</span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.section_count} section(s) · {c.student_count} student(s)
                    </div>
                  </button>
                  {isAdmin && (
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => { e.stopPropagation();
                          setClassModal({ mode: 'edit', data: { class_name: c.class_name, class_code: c.class_code || '' } }); }}
                        className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600"
                        title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation();
                          setConfirm({ type: 'class', id: c.id, name: c.class_name }); }}
                        className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                        title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ═══ Sections ═══ */}
      {classId && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              Sections {currentClass && <span className="text-sm font-normal text-slate-500">— {currentClass.class_name}</span>}
            </h3>
            {isAdmin && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={Plus}
                  onClick={() => setSectionModal({ mode: 'bulk', data: { names: ['A', 'B', 'C'] } })}>
                  Bulk A B C
                </Button>
                <Button size="sm" icon={Plus}
                  onClick={() => setSectionModal({ mode: 'create', data: { section_name: '', room_number: '' } })}>
                  New Section
                </Button>
              </div>
            )}
          </div>

          {loadingSections ? <Loader /> : sections.length === 0 ? (
            <Empty title="No sections yet" hint={isAdmin ? 'Add sections A, B, C …' : null} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {sections.map((s) => {
                const active = String(s.id) === String(sectionId);
                return (
                  <div key={s.id}
                    className={`relative group rounded-xl border transition ${
                      active
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}>
                    <button
                      onClick={() => nav(`/classes/${classId}/sections/${s.id}`)}
                      className="w-full text-left p-3 pr-16"
                    >
                      <div className="font-medium flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-purple-500" />
                        Section {s.section_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {s.student_count} student(s){s.room_number ? ` · Room ${s.room_number}` : ''}
                      </div>
                    </button>
                    {isAdmin && (
                      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => { e.stopPropagation();
                            setSectionModal({ mode: 'edit', data: { id: s.id, section_name: s.section_name, room_number: s.room_number || '' } }); }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600"
                          title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation();
                            setConfirm({ type: 'section', id: s.id, name: `Section ${s.section_name}` }); }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                          title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ═══ Students ═══ */}
      {sectionId && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-green-600" />
            Students {currentSection && <span className="text-sm font-normal text-slate-500">— Section {currentSection.section_name}</span>}
          </h3>
          {loadingStudents ? <Loader /> : students.length === 0 ? (
            <Empty title="No students in this section" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {students.map((st) => (
                <button
                  key={st.id}
                  onClick={() => nav(`/students/${st.id}`)}
                  className="w-full flex items-center justify-between py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded"
                >
                  <div className="text-left">
                    <div className="font-medium text-sm">{st.student_name}</div>
                    <div className="text-xs text-slate-500">
                      Roll {st.roll_number || '—'} · Adm {st.admission_number}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ═══ Class modal ═══ */}
      {classModal && (
        <ClassModal
          mode={classModal.mode}
          initial={classModal.data}
          onClose={() => setClassModal(null)}
          onSave={saveClass}
        />
      )}

      {/* ═══ Section modal ═══ */}
      {sectionModal && (
        <SectionModal
          mode={sectionModal.mode}
          initial={sectionModal.data}
          onClose={() => setSectionModal(null)}
          onSave={saveSection}
        />
      )}

      {/* ═══ Confirm delete ═══ */}
      <ConfirmDelete
        open={!!confirm}
        title={confirm?.type === 'class' ? 'Delete class?' : 'Delete section?'}
        message={`${confirm?.name || ''} — this cannot be undone.`}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.type === 'class' ? deleteClass : deleteSection}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════

function ClassModal({ mode, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.class_name || '');
  const [code, setCode] = useState(initial.class_code || '');
  const [sections, setSections] = useState(['A', 'B', 'C']);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Class name required');
    setSaving(true);
    try {
      const payload = { class_name: name.trim(), class_code: code.trim() || null };
      if (mode === 'create') payload.sections = sections.map((s) => s.trim()).filter(Boolean);
      await onSave(payload);
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'create' ? 'Create Class' : 'Edit Class'}
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
        <Input label="Class name *" value={name} onChange={(e) => setName(e.target.value)}
               placeholder="e.g. Grade 5" />
        <Input label="Class code" value={code} onChange={(e) => setCode(e.target.value)}
               placeholder="e.g. G5" />

        {mode === 'create' && (
          <div>
            <label className="label">Sections to create (optional)</label>
            <div className="flex flex-wrap gap-2">
              {['A', 'B', 'C', 'D', 'E', 'F'].map((letter) => {
                const on = sections.includes(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setSections(on ? sections.filter((x) => x !== letter) : [...sections, letter])}
                    className={`w-9 h-9 rounded-lg border text-sm font-medium transition ${
                      on ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10'
                         : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">Click to toggle. Skipped letters won't be created.</p>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════

function SectionModal({ mode, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.section_name || '');
  const [room, setRoom] = useState(initial.room_number || '');
  const [bulk, setBulk] = useState(initial.names || ['A', 'B', 'C']);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (mode === 'bulk') {
        if (!bulk.length) return toast.error('Select at least one section');
        await onSave({ names: bulk });
      } else {
        if (!name.trim()) return toast.error('Section name required');
        await onSave({ section_name: name.trim(), room_number: room.trim() || null });
      }
    } finally { setSaving(false); }
  };

  const title = mode === 'create' ? 'New Section'
              : mode === 'edit'   ? 'Edit Section'
                                  : 'Bulk Add Sections';

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'edit' ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {mode === 'bulk' ? (
          <div>
            <label className="label">Choose sections</label>
            <div className="flex flex-wrap gap-2">
              {LETTERS.map((letter) => {
                const on = bulk.includes(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setBulk(on ? bulk.filter((x) => x !== letter) : [...bulk, letter])}
                    className={`w-9 h-9 rounded-lg border text-sm font-medium transition ${
                      on ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-500/10'
                         : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Existing sections are skipped automatically.
            </p>
          </div>
        ) : (
          <>
            <Input label="Section name *" value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="e.g. A" />
            <Input label="Room number" value={room} onChange={(e) => setRoom(e.target.value)}
                   placeholder="e.g. 101" />
          </>
        )}
      </form>
    </Modal>
  );
}
""".strip())


def gen_verification():
    banner("verify")
    import subprocess

    files = [
        BE / "models/classModel.js",
        BE / "controllers/classController.js",
        BE / "routes/classes.js",
    ]
    all_ok = True
    for f in files:
        if not f.exists():
            print(f"  ✗ missing: {f.relative_to(ROOT)}")
            all_ok = False
            continue
        r = subprocess.run(["node", "-c", str(f)], capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ✓ {f.relative_to(ROOT)}")
        else:
            print(f"  ✗ {f.relative_to(ROOT)}: {(r.stderr or r.stdout).strip()[:200]}")
            all_ok = False
    return all_ok


# ════════════════════════════════════════════════════════════

def main():
    print(f"Classes & Sections CRUD — project root: {ROOT}")
    gen_backend_model()
    gen_backend_controller()
    gen_backend_routes()
    gen_frontend_api_patch()
    gen_frontend_page()

    print()
    if not gen_verification():
        print("\n✗ Fix syntax errors, then re-run.")
        sys.exit(1)

    print("\n" + "═" * 62)
    print("✅ Classes & Sections CRUD generated.")
    print("═" * 62)
    print("\nRestart:")
    print("  pkill -f node")
    print("  cd ~/school/backend && npm run dev")
    print("  pkill -f vite")
    print("  cd ~/school/frontend && npm run dev")
    print("\nOpen http://localhost:5173/classes")
    print("  · Admin sees: New Class, New Section, Bulk A B C, Edit/Delete")
    print("  · Non-admin sees: browse only")
    print("\nAPI:")
    print("  GET    /api/classes")
    print("  POST   /api/classes                          {class_name, class_code?, sections?}")
    print("  GET    /api/classes/:classId                 (includes sections)")
    print("  PATCH  /api/classes/:classId")
    print("  DELETE /api/classes/:classId[?cascade=true]")
    print("  GET    /api/classes/:classId/sections")
    print("  POST   /api/classes/:classId/sections        {section_name, room_number?}")
    print("  POST   /api/classes/:classId/sections/bulk   {sections: ['A','B','C']}")
    print("  PATCH  /api/classes/sections/:sectionId")
    print("  DELETE /api/classes/sections/:sectionId[?force=true]")
    print("  GET    /api/classes/sections/:sectionId/students")


if __name__ == "__main__":
    main()
