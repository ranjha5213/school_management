#!/usr/bin/env python3
"""
Notices CRUD:
  Backend : notices table + targeted reads + notifications
  Frontend: notices list, create, edit, delete, detail view

Run from ~/school:  python scripts/generate_notices_crud.py
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

    write(BE, "models/noticeModel.js", r"""
const { run, get, all } = require('../config/database');

const NoticeModel = {
  // ─── List with poster name + target labels ───
  list: (filters = {}) => {
    let sql = `
      SELECT n.*,
             u.name AS posted_by_name,
             c.class_name AS target_class_name,
             sec.section_name AS target_section_name
      FROM notices n
      LEFT JOIN users u ON n.posted_by = u.id
      LEFT JOIN classes c ON n.target_class_id = c.id
      LEFT JOIN sections sec ON n.target_section_id = sec.id
    `;
    const where = [];
    const params = [];

    if (filters.active_only) {
      where.push(`(n.expires_at IS NULL OR n.expires_at >= date('now'))`);
      where.push(`n.is_active = 1`);
    }
    if (filters.role) {
      where.push(`(n.target_role = 'all' OR n.target_role = ?)`);
      params.push(filters.role);
    }
    if (filters.q) {
      where.push(`(n.title LIKE ? OR n.content LIKE ?)`);
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY n.posted_at DESC, n.id DESC LIMIT 300';
    return all(sql, params);
  },

  findById: (id) =>
    get(
      `SELECT n.*,
              u.name AS posted_by_name,
              c.class_name AS target_class_name,
              sec.section_name AS target_section_name
       FROM notices n
       LEFT JOIN users u ON n.posted_by = u.id
       LEFT JOIN classes c ON n.target_class_id = c.id
       LEFT JOIN sections sec ON n.target_section_id = sec.id
       WHERE n.id = ?`,
      [id]
    ),

  create: ({ title, content, target_role = 'all',
             target_class_id = null, target_section_id = null,
             posted_by, expires_at = null }) =>
    run(
      `INSERT INTO notices
         (title, content, target_role, target_class_id, target_section_id,
          posted_by, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [title, content, target_role, target_class_id, target_section_id,
       posted_by, expires_at]
    ),

  update: (id, patch) => {
    const allowed = ['title', 'content', 'target_role', 'target_class_id',
                     'target_section_id', 'expires_at', 'is_active'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE notices SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  remove: (id) => run(`DELETE FROM notices WHERE id = ?`, [id]),

  // ─── Notifications (read tracking) ───
  createNotification: ({ user_id, notice_id }) =>
    run(
      `INSERT OR IGNORE INTO notifications (user_id, notice_id) VALUES (?, ?)`,
      [user_id, notice_id]
    ),

  markRead: ({ user_id, notice_id }) =>
    run(
      `UPDATE notifications
       SET is_read = 1, read_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND notice_id = ?`,
      [user_id, notice_id]
    ),

  // ─── Users who should receive a notice (target resolution) ───
  resolveRecipients: ({ target_role, target_class_id, target_section_id }) => {
    const where = ["u.status = 'active'"];
    const params = [];

    if (target_role && target_role !== 'all') {
      where.push('u.role = ?');
      params.push(target_role);
    }

    let join = '';
    if (target_section_id) {
      join = `JOIN students st ON st.user_id = u.id`;
      where.push('st.section_id = ?');
      params.push(target_section_id);
    } else if (target_class_id) {
      join = `JOIN students st ON st.user_id = u.id
              JOIN sections sc ON st.section_id = sc.id`;
      where.push('sc.class_id = ?');
      params.push(target_class_id);
    }

    return all(
      `SELECT DISTINCT u.id AS user_id
       FROM users u
       ${join}
       WHERE ${where.join(' AND ')}`,
      params
    );
  },

  // ─── Inbox for a user ───
  inboxForUser: (user_id, { unread_only = false } = {}) => {
    let sql = `
      SELECT n.*, u.name AS posted_by_name,
             c.class_name AS target_class_name,
             sec.section_name AS target_section_name,
             nf.is_read, nf.read_at
      FROM notifications nf
      JOIN notices n ON nf.notice_id = n.id
      LEFT JOIN users u ON n.posted_by = u.id
      LEFT JOIN classes c ON n.target_class_id = c.id
      LEFT JOIN sections sec ON n.target_section_id = sec.id
      WHERE nf.user_id = ?
    `;
    const params = [user_id];
    if (unread_only) sql += ' AND nf.is_read = 0';
    sql += ' ORDER BY n.posted_at DESC LIMIT 200';
    return all(sql, params);
  },

  unreadCount: (user_id) =>
    get(
      `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0`,
      [user_id]
    ),
};

module.exports = NoticeModel;
""".strip())


def gen_backend_controller():
    banner("backend controller")

    write(BE, "controllers/noticeController.js", r"""
const NoticeModel = require('../models/noticeModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

const ROLES = ['all', 'admin', 'teacher', 'student', 'parent', 'accountant'];

// ─── List ───
const listNotices = async (req, res, next) => {
  try {
    const rows = await NoticeModel.list({
      active_only: req.query.active_only === 'true',
      role: req.user.role,
      q: req.query.q || undefined,
    });
    return apiResponse(res, 200, true, 'Notices', rows);
  } catch (e) { next(e); }
};

// ─── Get one ───
const getNotice = async (req, res, next) => {
  try {
    const notice = await NoticeModel.findById(Number(req.params.id));
    if (!notice) return apiResponse(res, 404, false, 'Notice not found');

    // Mark as read for this user
    if (req.user?.id) {
      await NoticeModel.markRead({ user_id: req.user.id, notice_id: notice.id });
    }

    return apiResponse(res, 200, true, 'Notice', notice);
  } catch (e) { next(e); }
};

// ─── Create ───
const createNotice = async (req, res, next) => {
  try {
    const { title, content, target_role = 'all',
            target_class_id = null, target_section_id = null,
            expires_at = null } = req.body;

    if (!title || !title.trim())
      return apiResponse(res, 400, false, 'title required');
    if (!content || !content.trim())
      return apiResponse(res, 400, false, 'content required');
    if (!ROLES.includes(target_role))
      return apiResponse(res, 400, false, `target_role must be one of ${ROLES.join(', ')}`);

    const { lastID } = await NoticeModel.create({
      title: title.trim(),
      content: content.trim(),
      target_role,
      target_class_id: target_class_id ? Number(target_class_id) : null,
      target_section_id: target_section_id ? Number(target_section_id) : null,
      posted_by: req.user.id,
      expires_at: expires_at || null,
    });

    // Fan out to matching users
    const recipients = await NoticeModel.resolveRecipients({
      target_role,
      target_class_id: target_class_id ? Number(target_class_id) : null,
      target_section_id: target_section_id ? Number(target_section_id) : null,
    });

    for (const r of recipients) {
      await NoticeModel.createNotification({ user_id: r.user_id, notice_id: lastID });
    }

    logger.audit(`Notice created: "${title}" (id=${lastID}) → ${recipients.length} recipient(s)`);
    return apiResponse(res, 201, true, 'Notice created', {
      id: lastID,
      recipients: recipients.length,
    });
  } catch (e) { next(e); }
};

// ─── Update ───
const updateNotice = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await NoticeModel.findById(id);
    if (!existing) return apiResponse(res, 404, false, 'Notice not found');

    const patch = {};
    for (const k of ['title', 'content', 'target_role',
                     'target_class_id', 'target_section_id',
                     'expires_at', 'is_active']) {
      if (k in req.body) patch[k] = req.body[k];
    }
    if (patch.target_role && !ROLES.includes(patch.target_role))
      return apiResponse(res, 400, false, `target_role must be one of ${ROLES.join(', ')}`);

    await NoticeModel.update(id, patch);
    logger.audit(`Notice updated: id=${id}`);
    return apiResponse(res, 200, true, 'Notice updated');
  } catch (e) { next(e); }
};

// ─── Delete ───
const deleteNotice = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const n = await NoticeModel.findById(id);
    if (!n) return apiResponse(res, 404, false, 'Notice not found');

    await NoticeModel.remove(id);
    logger.audit(`Notice deleted: "${n.title}" (id=${id})`);
    return apiResponse(res, 200, true, 'Notice deleted');
  } catch (e) { next(e); }
};

// ─── Inbox (my notifications) ───
const myInbox = async (req, res, next) => {
  try {
    const rows = await NoticeModel.inboxForUser(req.user.id, {
      unread_only: req.query.unread === 'true',
    });
    const count = await NoticeModel.unreadCount(req.user.id);
    return apiResponse(res, 200, true, 'Inbox', {
      notices: rows,
      unread_count: count?.c || 0,
    });
  } catch (e) { next(e); }
};

const markNoticeRead = async (req, res, next) => {
  try {
    await NoticeModel.markRead({
      user_id: req.user.id,
      notice_id: Number(req.params.id),
    });
    return apiResponse(res, 200, true, 'Marked read');
  } catch (e) { next(e); }
};

module.exports = {
  listNotices, getNotice, createNotice, updateNotice, deleteNotice,
  myInbox, markNoticeRead,
};
""".strip())


def gen_backend_routes():
    banner("backend routes")

    write(BE, "routes/notices.js", r"""
const express = require('express');
const c = require('../controllers/noticeController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Personal inbox
router.get('/inbox', c.myInbox);
router.post('/:id/read', c.markNoticeRead);

// CRUD
router.get('/', c.listNotices);
router.get('/:id', c.getNotice);
router.post('/', authorize('admin', 'teacher'), c.createNotice);
router.patch('/:id', authorize('admin', 'teacher'), c.updateNotice);
router.delete('/:id', authorize('admin'), c.deleteNotice);

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
    pattern = re.compile(r"export const noticesApi = \{.*?\n\};", re.DOTALL)
    replacement = """export const noticesApi = {
  list: (params) => unwrap(client.get('/notices', { params })),
  get: (id) => unwrap(client.get(`/notices/${id}`)),
  create: (p) => unwrap(client.post('/notices', p)),
  update: (id, p) => unwrap(client.patch(`/notices/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/notices/${id}`)),
  inbox: (params) => unwrap(client.get('/notices/inbox', { params })),
  markRead: (id) => unwrap(client.post(`/notices/${id}/read`)),
};"""
    if pattern.search(src):
        src = pattern.sub(replacement, src, count=1)
        p.write_text(src)
        print("  ✓ expanded noticesApi")
    else:
        print("  ! couldn't find noticesApi block — patch manually")


def gen_frontend_modal():
    banner("NoticeModal")

    write(FE, "src/components/NoticeModal.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, Bell } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { noticesApi, classesApi } from '../api/endpoints';

const ROLES = [
  { value: 'all', label: 'Everyone' },
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'parent', label: 'Parents' },
  { value: 'accountant', label: 'Accountants' },
];

export default function NoticeModal({ mode = 'create', initial = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    content: initial?.content || '',
    target_role: initial?.target_role || 'all',
    target_class_id: initial?.target_class_id || '',
    target_section_id: initial?.target_section_id || '',
    expires_at: initial?.expires_at || '',
  });
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    classesApi.list().then((d) => setClasses(d || [])).catch(() => setClasses([]));
  }, []);

  useEffect(() => {
    if (!form.target_class_id) { setSections([]); return; }
    classesApi.sections(form.target_class_id).then((d) => setSections(d || [])).catch(() => setSections([]));
  }, [form.target_class_id]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title required');
    if (!form.content.trim()) return toast.error('Content required');

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        target_role: form.target_role,
        target_class_id: form.target_class_id ? Number(form.target_class_id) : null,
        target_section_id: form.target_section_id ? Number(form.target_section_id) : null,
        expires_at: form.expires_at || null,
      };

      if (mode === 'create') {
        const res = await noticesApi.create(payload);
        toast.success(`Notice posted (${res?.recipients || 0} recipient${res?.recipients === 1 ? '' : 's'})`);
        onSaved?.(res?.id);
      } else {
        await noticesApi.update(initial.id, payload);
        toast.success('Notice updated');
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
      title={mode === 'create' ? 'Post Notice' : 'Edit Notice'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Post Notice' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Title *" name="title" value={form.title} onChange={onChange}
               placeholder="e.g. Parent-teacher meeting" />

        <div>
          <label className="label">Content *</label>
          <textarea
            name="content"
            value={form.content}
            onChange={onChange}
            rows={5}
            className="input"
            placeholder="Write the announcement…"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Audience</label>
            <select name="target_role" value={form.target_role} onChange={onChange} className="input">
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Class (optional)</label>
            <select name="target_class_id" value={form.target_class_id} onChange={onChange} className="input">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Section (optional)</label>
            <select name="target_section_id" value={form.target_section_id} onChange={onChange}
                    className="input" disabled={!form.target_class_id}>
              <option value="">All sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>Section {s.section_name}</option>
              ))}
            </select>
          </div>
        </div>

        <Input label="Expires on (optional)" name="expires_at" type="date"
               value={form.expires_at} onChange={onChange} />

        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
          <Bell className="w-3.5 h-3.5" />
          Matching users will see this in their Notices page.
        </div>
      </form>
    </Modal>
  );
}
""".strip())


def gen_frontend_page():
    banner("Notices.jsx")

    write(FE, "src/pages/Notices.jsx", r"""
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Bell, Plus, Pencil, Trash2, ChevronRight, ArrowLeft,
  Users, Clock, User, AlertCircle, Inbox,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import NoticeModal from '../components/NoticeModal';
import { noticesApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Notices() {
  const { noticeId } = useParams();
  return noticeId
    ? <NoticeDetail noticeId={Number(noticeId)} />
    : <NoticeList />;
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

function roleLabel(role) {
  const map = {
    all: 'Everyone', student: 'Students', teacher: 'Teachers',
    parent: 'Parents', accountant: 'Accountants',
    admin: 'Admins',
  };
  return map[role] || role;
}

function isExpired(expires_at) {
  if (!expires_at) return false;
  const today = new Date().toISOString().slice(0, 10);
  return expires_at < today;
}

// ════════════════════════════════════════════════════════════
// LIST
// ════════════════════════════════════════════════════════════

function NoticeList() {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showExpired, setShowExpired] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = () => {
    setLoading(true);
    noticesApi.list().then((d) => setRows(d || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleDelete = async () => {
    try {
      await noticesApi.remove(confirm.id);
      toast.success('Notice deleted');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  const filtered = useMemo(() => {
    let list = rows;
    if (!showExpired) list = list.filter((r) => !isExpired(r.expires_at));
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((r) =>
        (r.title || '').toLowerCase().includes(needle) ||
        (r.content || '').toLowerCase().includes(needle));
    }
    return list;
  }, [rows, q, showExpired]);

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-brand-600" /> Notices ({filtered.length})
          </h3>
          {canWrite && (
            <Button size="sm" icon={Plus} onClick={() => setModal({ mode: 'create' })}>
              Post Notice
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <div className="sm:col-span-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Search notices…" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={showExpired}
                   onChange={(e) => setShowExpired(e.target.checked)}
                   className="rounded" />
            Show expired
          </label>
        </div>

        {loading ? <Loader /> : filtered.length === 0 ? (
          <Empty title="No notices" hint={canWrite ? 'Click "Post Notice" to create one' : null} />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map((n) => {
              const expired = isExpired(n.expires_at);
              return (
                <div key={n.id} className="group relative">
                  <button onClick={() => nav(`/notices/${n.id}`)}
                    className="w-full text-left py-3 pr-20 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded transition">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        expired ? 'bg-slate-100 dark:bg-slate-800' : 'bg-brand-50 dark:bg-brand-500/10'
                      }`}>
                        <Bell className={`w-4 h-4 ${expired ? 'text-slate-400' : 'text-brand-600'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          {n.title}
                          {expired && <span className="badge badge-gray">expired</span>}
                          {n.target_role !== 'all' && (
                            <span className="badge badge-blue">{roleLabel(n.target_role)}</span>
                          )}
                          {n.target_class_name && (
                            <span className="badge badge-purple">{n.target_class_name}</span>
                          )}
                          {n.target_section_name && (
                            <span className="badge badge-gray">{n.target_section_name}</span>
                          )}
                        </div>
                        <div className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                          {n.content}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-3">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" /> {n.posted_by_name || '—'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatDateTime(n.posted_at)}
                          </span>
                          {n.expires_at && (
                            <span>Expires {n.expires_at}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                    </div>
                  </button>

                  {(canWrite && (isAdmin || n.posted_by === user?.id)) && (
                    <div className="absolute right-2 top-3 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', data: n }); }}
                        className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirm({ id: n.id, name: n.title }); }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {modal && (
        <NoticeModal
          mode={modal.mode}
          initial={modal.data}
          onClose={() => setModal(null)}
          onSaved={async (id) => {
            setModal(null);
            await load();
            if (modal.mode === 'create' && id) nav(`/notices/${id}`);
          }}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete notice?"
        message={`"${confirm?.name || ''}" will be removed for all recipients.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL
// ════════════════════════════════════════════════════════════

function NoticeDetail({ noticeId }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    noticesApi.get(noticeId).then(setNotice).catch(() => setNotice(null)).finally(() => setLoading(false));
  }, [noticeId]);

  if (loading) return <Loader />;
  if (!notice) return <Card><Empty title="Notice not found" /></Card>;

  const expired = isExpired(notice.expires_at);

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav('/notices')}
        className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to notices
      </button>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            expired ? 'bg-slate-100 dark:bg-slate-800' : 'bg-brand-50 dark:bg-brand-500/10'
          }`}>
            <Bell className={`w-5 h-5 ${expired ? 'text-slate-400' : 'text-brand-600'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold flex items-center gap-2 flex-wrap">
              {notice.title}
              {expired && <span className="badge badge-gray">expired</span>}
              {!notice.is_active && <span className="badge badge-gray">inactive</span>}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="badge badge-blue">{roleLabel(notice.target_role)}</span>
              {notice.target_class_name && (
                <span className="badge badge-purple">{notice.target_class_name}</span>
              )}
              {notice.target_section_name && (
                <span className="badge badge-gray">Section {notice.target_section_name}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-400 flex flex-wrap gap-4">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> Posted by <b className="text-slate-600 dark:text-slate-300">{notice.posted_by_name || '—'}</b>
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {formatDateTime(notice.posted_at)}
          </span>
          {notice.expires_at && <span>Expires {notice.expires_at}</span>}
        </div>

        <div className="prose dark:prose-invert max-w-none mt-4 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
          {notice.content}
        </div>
      </Card>
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
    if "/notices/:noticeId" in src:
        print("  · already routed")
        return
    old = '<Route path="notices" element={<Notices />} />'
    new = ('<Route path="notices" element={<Notices />} />\n'
           '              <Route path="notices/:noticeId" element={<Notices />} />')
    if old in src:
        p.write_text(src.replace(old, new, 1))
        print("  ✓ added /notices/:noticeId route")
    else:
        print("  ! couldn't find notices route — add manually")


def verify():
    banner("verify")
    import subprocess
    files = [
        BE / "models/noticeModel.js",
        BE / "controllers/noticeController.js",
        BE / "routes/notices.js",
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
    print(f"Notices CRUD — root: {ROOT}")
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
    print("✅ Notices CRUD generated.")
    print("═" * 62)
    print("\nRestart:")
    print("  ~/school/start.sh --stop")
    print("  ~/school/start.sh")
    print("\nUI:")
    print("  /notices            list + create + edit + delete")
    print("  /notices/:id        detail (marks read automatically)")


if __name__ == "__main__":
    main()
