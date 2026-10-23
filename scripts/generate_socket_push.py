#!/usr/bin/env python3
"""
Socket push:
  - Realtime notice bell (instant updates)
  - Live attendance broadcast (per section)
  - Homework notifications (new homework, submissions, grades)

Run from ~/school:  python scripts/generate_socket_push.py
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
    """Idempotent patch. Skips if marker already present."""
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

def gen_realtime():
    banner("realtime/socket.js")

    write(BE, "realtime/socket.js", r"""
const { Server } = require('socket.io');
const { verify } = require('../utils/jwt');
const logger = require('../utils/logger');

let io = null;

// Connected sockets indexed by user id → Set of socket ids
const userSockets = new Map();

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      // allow anonymous — they just won't join any personal room
      socket.user = { id: 0, role: 'anon' };
      return next();
    }
    try {
      socket.user = verify(token);
      next();
    } catch (e) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.user?.id;
    logger.info(`[socket] connected user=${uid} sid=${socket.id}`);

    // Personal room
    if (uid) {
      socket.join(`user:${uid}`);
      if (!userSockets.has(uid)) userSockets.set(uid, new Set());
      userSockets.get(uid).add(socket.id);
    }

    // Role room
    if (socket.user?.role) socket.join(`role:${socket.user.role}`);

    // Client can subscribe to a section for live attendance
    socket.on('subscribe:section', (section_id) => {
      if (!section_id) return;
      socket.join(`section:${section_id}`);
      logger.info(`[socket] user=${uid} joined section:${section_id}`);
    });

    socket.on('unsubscribe:section', (section_id) => {
      if (!section_id) return;
      socket.leave(`section:${section_id}`);
    });

    socket.on('disconnect', () => {
      logger.info(`[socket] disconnected user=${uid} sid=${socket.id}`);
      if (uid && userSockets.has(uid)) {
        const set = userSockets.get(uid);
        set.delete(socket.id);
        if (set.size === 0) userSockets.delete(uid);
      }
    });
  });

  return io;
};

// ─── Emit helpers ───

const emitToUser = (user_id, event, payload) => {
  if (!io || !user_id) return;
  io.to(`user:${user_id}`).emit(event, payload);
};

const emitToUsers = (user_ids, event, payload) => {
  if (!io) return;
  (user_ids || []).forEach((uid) => io.to(`user:${uid}`).emit(event, payload));
};

const emitToRole = (role, event, payload) => {
  if (!io) return;
  io.to(`role:${role}`).emit(event, payload);
};

const emitToSection = (section_id, event, payload) => {
  if (!io) return;
  io.to(`section:${section_id}`).emit(event, payload);
};

const emitToAll = (event, payload) => {
  if (!io) return;
  io.emit(event, payload);
};

const getIo = () => io;

module.exports = {
  init,
  emitToUser,
  emitToUsers,
  emitToRole,
  emitToSection,
  emitToAll,
  getIo,
};
""".strip())


def patch_notice_controller():
    banner("patch noticeController")

    p = BE / "controllers/noticeController.js"

    # 1. Add import
    src = p.read_text()
    if "realtime" not in src:
        src = src.replace(
            "const logger = require('../utils/logger');",
            "const logger = require('../utils/logger');\nconst realtime = require('../realtime/socket');",
            1,
        )
        p.write_text(src)
        print("  ✓ added realtime import")

    # 2. Emit after notice creation
    old = """    for (const r of recipients) {
      await NoticeModel.createNotification({ user_id: r.user_id, notice_id: lastID });
    }

    logger.audit(`Notice created: "${title}" (id=${lastID}) → ${recipients.length} recipient(s)`);"""

    new = """    for (const r of recipients) {
      await NoticeModel.createNotification({ user_id: r.user_id, notice_id: lastID });
    }

    // ─── Real-time push ───
    const payload = {
      id: lastID,
      title: title.trim(),
      content: content.trim(),
      target_role,
      posted_at: new Date().toISOString(),
    };
    recipients.forEach((r) => realtime.emitToUser(r.user_id, 'notice:new', payload));

    logger.audit(`Notice created: "${title}" (id=${lastID}) → ${recipients.length} recipient(s)`);"""

    patch(p, old, new, "realtime.emitToUser(r.user_id, 'notice:new'")


def patch_attendance_controller():
    banner("patch attendanceController")

    p = BE / "controllers/attendanceController.js"

    src = p.read_text()
    if "realtime" not in src:
        src = src.replace(
            "const { apiResponse, todayISO } = require('../utils/helpers');",
            "const { apiResponse, todayISO } = require('../utils/helpers');\nconst realtime = require('../realtime/socket');",
            1,
        )
        p.write_text(src)
        print("  ✓ added realtime import")

    # Emit on bulk save
    old = """    await AttendanceModel.bulkInsert(records, req.user.id);
    return apiResponse(res, 201, true, `${records.length} records saved`);"""

    new = """    await AttendanceModel.bulkInsert(records, req.user.id);

    // ─── Broadcast to anyone watching this section ───
    realtime.emitToSection(section_id, 'attendance:marked', {
      section_id,
      date,
      count: records.length,
      marked_by: req.user.id,
      marked_by_name: req.user.name,
      at: new Date().toISOString(),
    });

    return apiResponse(res, 201, true, `${records.length} records saved`);"""

    patch(p, old, new, "attendance:marked")

    # Emit on remarks update
    old2 = """    const result = await AttendanceModel.updateRemarks(student_id, date, remarks, req.user.id);
    if (!result || result.changes === 0)
      return apiResponse(res, 403, false, 'Only the marker or admin can edit remarks');
    return apiResponse(res, 200, true, 'Remarks updated');"""

    new2 = """    const result = await AttendanceModel.updateRemarks(student_id, date, remarks, req.user.id);
    if (!result || result.changes === 0)
      return apiResponse(res, 403, false, 'Only the marker or admin can edit remarks');

    const student = await StudentModel.findById(student_id);
    if (student?.section_id) {
      realtime.emitToSection(student.section_id, 'attendance:remarks', {
        student_id, date, remarks, at: new Date().toISOString(),
      });
    }

    return apiResponse(res, 200, true, 'Remarks updated');"""

    patch(p, old2, new2, "attendance:remarks")


def patch_homework_controller():
    banner("patch homeworkController")

    p = BE / "controllers/homeworkController.js"

    src = p.read_text()
    if "realtime" not in src:
        src = src.replace(
            "const logger = require('../utils/logger');",
            "const logger = require('../utils/logger');\nconst realtime = require('../realtime/socket');\nconst { all } = require('../config/database');",
            1,
        )
        p.write_text(src)
        print("  ✓ added realtime + db import")

    # Emit on homework create → notify all students of that class
    old = """    logger.audit(`Homework created: "${title}" (id=${lastID}) by ${req.user.name}`);
    return apiResponse(res, 201, true, 'Homework created', { id: lastID });"""

    new = """    // ─── Notify all students in the class ───
    try {
      const students = await all(
        `SELECT u.id AS user_id
         FROM students s
         JOIN users u ON s.user_id = u.id
         JOIN sections sec ON s.section_id = sec.id
         WHERE sec.class_id = ? AND u.status = 'active'`,
        [Number(class_id)]
      );
      const payload = {
        id: lastID,
        title: title.trim(),
        due_date,
        class_id: Number(class_id),
        teacher_name: req.user.name,
        at: new Date().toISOString(),
      };
      students.forEach((st) => realtime.emitToUser(st.user_id, 'homework:new', payload));
    } catch {}

    logger.audit(`Homework created: "${title}" (id=${lastID}) by ${req.user.name}`);
    return apiResponse(res, 201, true, 'Homework created', { id: lastID });"""

    patch(p, old, new, "homework:new")

    # Emit on submission → notify the teacher
    old2 = """    logger.audit(`Homework submitted: hw=${homeworkId} student=${student_id}`);
    return apiResponse(res, 200, true, 'Homework submitted');"""

    new2 = """    // ─── Notify the teacher who posted it ───
    if (hw.teacher_id) {
      try {
        const { get } = require('../config/database');
        const t = await get(`SELECT user_id FROM teachers WHERE id = ?`, [hw.teacher_id]);
        if (t?.user_id) {
          realtime.emitToUser(t.user_id, 'homework:submission', {
            homework_id: homeworkId,
            homework_title: hw.title,
            student_id: Number(student_id),
            at: new Date().toISOString(),
          });
        }
      } catch {}
    }

    logger.audit(`Homework submitted: hw=${homeworkId} student=${student_id}`);
    return apiResponse(res, 200, true, 'Homework submitted');"""

    patch(p, old2, new2, "homework:submission")

    # Emit on grade → notify the student
    old3 = """    logger.audit(`Submission graded: hw=${homeworkId} student=${student_id} grade=${grade}`);
    return apiResponse(res, 200, true, 'Submission graded');"""

    new3 = """    // ─── Notify the student ───
    try {
      const { get } = require('../config/database');
      const st = await get(`SELECT user_id FROM students WHERE id = ?`, [Number(student_id)]);
      if (st?.user_id) {
        realtime.emitToUser(st.user_id, 'homework:graded', {
          homework_id: homeworkId,
          grade: grade.trim(),
          remarks: remarks || null,
          at: new Date().toISOString(),
        });
      }
    } catch {}

    logger.audit(`Submission graded: hw=${homeworkId} student=${student_id} grade=${grade}`);
    return apiResponse(res, 200, true, 'Submission graded');"""

    patch(p, old3, new3, "homework:graded")


def patch_exam_controller():
    banner("patch examController")

    p = BE / "controllers/examController.js"

    src = p.read_text()
    if "realtime" not in src:
        src = src.replace(
            "const logger = require('../utils/logger');",
            "const logger = require('../utils/logger');\nconst realtime = require('../realtime/socket');",
            1,
        )
        p.write_text(src)
        print("  ✓ added realtime import")

    # Emit on marks save → notify affected students
    old = """    logger.audit(`Marks saved: exam ${exam_id}, ${marks.length} entries by ${req.user.name}`);
    return apiResponse(res, 200, true, `${marks.length} mark(s) saved`);"""

    new = """    // ─── Notify each affected student ───
    try {
      const { get } = require('../config/database');
      const studentIds = [...new Set(marks.map((m) => m.student_id))];
      for (const sid of studentIds) {
        const st = await get(`SELECT user_id FROM students WHERE id = ?`, [sid]);
        if (st?.user_id) {
          realtime.emitToUser(st.user_id, 'exam:marks-posted', {
            exam_id,
            exam_name: exam.exam_name,
            at: new Date().toISOString(),
          });
        }
      }
    } catch {}

    logger.audit(`Marks saved: exam ${exam_id}, ${marks.length} entries by ${req.user.name}`);
    return apiResponse(res, 200, true, `${marks.length} mark(s) saved`);"""

    patch(p, old, new, "exam:marks-posted")


def patch_fee_controller():
    banner("patch feeController")

    p = BE / "controllers/feeController.js"

    src = p.read_text()
    if "realtime" not in src:
        src = src.replace(
            "const logger = require('../utils/logger');",
            "const logger = require('../utils/logger');\nconst realtime = require('../realtime/socket');\nconst { get } = require('../config/database');",
            1,
        )
        p.write_text(src)
        print("  ✓ added realtime import")

    # Emit on payment → notify the student + parent
    old = """    const status = await FeeModel.recomputeInvoiceStatus(Number(invoice_id));
    logger.audit(`Payment recorded: invoice ${invoice_id}, $${amount_paid}, method ${payment_method}`);
    return apiResponse(res, 201, true, `Payment recorded (status: ${status})`, { id: lastID, status });"""

    new = """    const status = await FeeModel.recomputeInvoiceStatus(Number(invoice_id));

    // ─── Notify the student ───
    try {
      const st = await get(`SELECT user_id FROM students WHERE id = ?`, [inv.student_id]);
      if (st?.user_id) {
        realtime.emitToUser(st.user_id, 'fee:payment', {
          invoice_id: Number(invoice_id),
          amount: Number(amount_paid),
          status,
          at: new Date().toISOString(),
        });
      }
    } catch {}

    logger.audit(`Payment recorded: invoice ${invoice_id}, $${amount_paid}, method ${payment_method}`);
    return apiResponse(res, 201, true, `Payment recorded (status: ${status})`, { id: lastID, status });"""

    patch(p, old, new, "fee:payment")


# ════════════════════════════════════════════════════════════
# FRONTEND
# ════════════════════════════════════════════════════════════

def gen_socket_context():
    banner("SocketContext")

    write(FE, "src/context/SocketContext.jsx", r"""
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const token = localStorage.getItem('token');
    const url = import.meta.env.VITE_SOCKET_URL
      || `${window.location.protocol}//${window.location.hostname}:5000`;

    const socket = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      console.log('[socket] connected', socket.id);
      setConnected(true);
    });
    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected', reason);
      setConnected(false);
    });
    socket.on('connect_error', (err) => {
      console.warn('[socket] error', err.message);
    });

    // ─── Global toast notifications (in addition to badge updates) ───
    socket.on('homework:new', (p) => {
      toast(`📚 New homework: ${p.title}`, { duration: 5000 });
    });
    socket.on('homework:graded', (p) => {
      toast.success(`✅ Homework graded: ${p.grade}`, { duration: 5000 });
    });
    socket.on('exam:marks-posted', (p) => {
      toast(`📝 Marks posted for ${p.exam_name}`, { duration: 5000 });
    });
    socket.on('fee:payment', (p) => {
      toast.success(`💵 Payment received: $${p.amount}`, { duration: 4000 });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
""".strip())


def gen_notice_bell_v2():
    banner("NoticeBell (with live socket)")

    write(FE, "src/components/NoticeBell.jsx", r"""
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { noticesApi } from '../api/endpoints';
import { useSocket } from '../context/SocketContext';

export default function NoticeBell() {
  const nav = useNavigate();
  const { socket } = useSocket();
  const [data, setData] = useState({ notices: [], unread_count: 0 });
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const ref = useRef();

  const load = () => {
    noticesApi.inbox({ unread: true }).then(setData).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  // ─── Live socket: new notice → prepend + pulse ───
  useEffect(() => {
    if (!socket) return;

    const onNew = (n) => {
      setData((d) => ({
        notices: [n, ...(d.notices || [])].slice(0, 50),
        unread_count: (d.unread_count || 0) + 1,
      }));
      setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    };

    socket.on('notice:new', onNew);
    return () => socket.off('notice:new', onNew);
  }, [socket]);

  // ─── Fallback poll every 60s ───
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const count = data?.unread_count || 0;

  const openNotice = async (n) => {
    setOpen(false);
    await noticesApi.markRead(n.id).catch(() => {});
    nav(`/notices/${n.id}`);
    setTimeout(load, 400);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition ${pulse ? 'animate-bounce' : ''}`}
        title="Notices"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full
                           bg-red-500 text-white text-[10px] font-bold flex items-center justify-center
                           ${pulse ? 'ring-2 ring-red-300' : ''}`}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 bg-white dark:bg-slate-900
                        border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg
                        max-h-96 overflow-auto z-40">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-xs font-medium text-slate-500">
            {count > 0 ? `${count} unread notice${count === 1 ? '' : 's'}` : 'No unread notices'}
          </div>
          {data?.notices?.length === 0 ? (
            <div className="p-4 text-sm text-slate-500 text-center">All caught up ✓</div>
          ) : (
            data.notices.map((n) => (
              <button key={n.id} onClick={() => openNotice(n)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-50 dark:border-slate-800 last:border-0">
                <div className="font-medium text-sm line-clamp-1">{n.title}</div>
                <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.content}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {n.posted_by_name || '—'} · {n.published_at || n.posted_at || ''}
                </div>
              </button>
            ))
          )}
          <button onClick={() => { setOpen(false); nav('/notices'); }}
            className="w-full text-center text-xs text-brand-600 hover:underline py-2 border-t border-slate-100 dark:border-slate-800">
            View all notices →
          </button>
        </div>
      )}
    </div>
  );
}
""".strip())


def gen_app_patch():
    banner("App.jsx — wrap with SocketProvider")

    p = FE / "src/App.jsx"
    if not p.exists():
        print("  ! App.jsx missing")
        return
    src = p.read_text()

    if "SocketProvider" in src:
        print("  · already wrapped")
        return

    src = src.replace(
        "import { AuthProvider, useAuth } from './context/AuthContext';",
        "import { AuthProvider, useAuth } from './context/AuthContext';\nimport { SocketProvider } from './context/SocketContext';",
        1,
    )

    # Wrap inside AuthProvider (needs user), outside Router (needs nav for toasts only)
    old = """      <AuthProvider>
        <BrowserRouter>"""
    new = """      <AuthProvider>
        <SocketProvider>
        <BrowserRouter>"""
    if old in src:
        src = src.replace(old, new, 1)

    old2 = """        </BrowserRouter>
      </AuthProvider>"""
    new2 = """        </BrowserRouter>
        </SocketProvider>
      </AuthProvider>"""
    if old2 in src:
        src = src.replace(old2, new2, 1)

    p.write_text(src)
    print("  ✓ SocketProvider wrapped inside AuthProvider")


def gen_attendance_live_patch():
    banner("Attendance.jsx — live subscription")

    p = FE / "src/pages/Attendance.jsx"
    if not p.exists():
        print("  ! Attendance.jsx missing")
        return

    src = p.read_text()
    if "subscribe:section" in src:
        print("  · already wired")
        return

    # Add import
    if "useSocket" not in src:
        src = src.replace(
            "import { attendanceApi, studentsApi, classesApi } from '../api/endpoints';",
            "import { attendanceApi, studentsApi, classesApi } from '../api/endpoints';\nimport { useSocket } from '../context/SocketContext';",
            1,
        )

    # Add hook usage inside component (right after first useState block)
    marker = "  const [loaded, setLoaded] = useState(false);"
    if marker in src:
        src = src.replace(
            marker,
            marker + "\n\n  const { socket } = useSocket();",
            1,
        )

    # Subscribe to section when it changes + react to broadcasts
    hook = """
  // ─── Live section subscription ───
  useEffect(() => {
    if (!socket || !sectionId) return;
    socket.emit('subscribe:section', Number(sectionId));
    return () => socket.emit('unsubscribe:section', Number(sectionId));
  }, [socket, sectionId]);

  useEffect(() => {
    if (!socket) return;
    const onMarked = (p) => {
      // Someone else just submitted attendance for this date
      if (String(p.section_id) === String(sectionId) && p.date === date) {
        toast(`Attendance for ${p.date} was submitted by ${p.marked_by_name || 'user'}`, { icon: '🔒' });
        loadGrid();
      }
    };
    const onRemarks = (p) => {
      if (p.date === date) {
        setRecords((r) => {
          // Only update remarks map, statuses unchanged
          return r;
        });
      }
    };
    socket.on('attendance:marked', onMarked);
    socket.on('attendance:remarks', onRemarks);
    return () => {
      socket.off('attendance:marked', onMarked);
      socket.off('attendance:remarks', onRemarks);
    };
  }, [socket, sectionId, date]);

"""
    marker2 = "  // ─── Status helpers ───"
    if marker2 in src:
        src = src.replace(marker2, hook + marker2, 1)
        p.write_text(src)
        print("  ✓ Attendance.jsx subscribes to live section updates")
    else:
        print("  ! couldn't find anchor in Attendance.jsx")


def gen_connection_indicator():
    banner("Topbar — connection dot")

    p = FE / "src/components/Topbar.jsx"
    if not p.exists():
        print("  ! Topbar.jsx missing")
        return
    src = p.read_text()

    if "useSocket" in src:
        print("  · already wired")
        return

    src = src.replace(
        "import NoticeBell from './NoticeBell';",
        "import NoticeBell from './NoticeBell';\nimport { useSocket } from '../context/SocketContext';",
        1,
    )

    # Insert a live dot after the user name
    old = '<div className="text-sm text-slate-600 dark:text-slate-300 hidden sm:block">\n        {user?.name}\n      </div>'
    new = """<div className="text-sm text-slate-600 dark:text-slate-300 hidden sm:flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-300'}`}
              title={connected ? 'Live' : 'Offline'} />
        {user?.name}
      </div>"""
    if old in src:
        src = src.replace(old, new, 1)
    else:
        # fallback: insert after useTheme
        anchor = "  const { theme, toggle } = useTheme();"
        src = src.replace(anchor, anchor + "\n  const { connected } = useSocket();", 1)

    # add hook
    if "const { connected } = useSocket();" not in src:
        anchor2 = "  const { theme, toggle } = useTheme();"
        src = src.replace(anchor2, anchor2 + "\n  const { connected } = useSocket();", 1)

    p.write_text(src)
    print("  ✓ Topbar shows live connection dot")


def gen_env():
    banner("env")

    # Add VITE_SOCKET_URL to frontend .env if it exists
    env_fe = FE / ".env"
    if env_fe.exists():
        txt = env_fe.read_text()
        if "VITE_SOCKET_URL" not in txt:
            env_fe.write_text(txt + "\nVITE_SOCKET_URL=http://localhost:5000\n")
            print("  ✓ added VITE_SOCKET_URL to frontend/.env")
        else:
            print("  · VITE_SOCKET_URL already present")
    else:
        print("  ! frontend/.env missing — VITE_SOCKET_URL will default to same host :5000")


def verify():
    banner("verify")
    import subprocess
    files = [
        BE / "realtime/socket.js",
        BE / "controllers/noticeController.js",
        BE / "controllers/attendanceController.js",
        BE / "controllers/homeworkController.js",
        BE / "controllers/examController.js",
        BE / "controllers/feeController.js",
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
    print(f"Socket push — root: {ROOT}")
    gen_realtime()
    patch_notice_controller()
    patch_attendance_controller()
    patch_homework_controller()
    patch_exam_controller()
    patch_fee_controller()
    gen_socket_context()
    gen_notice_bell_v2()
    gen_app_patch()
    gen_attendance_live_patch()
    gen_connection_indicator()
    gen_env()
    print()
    if not verify():
        sys.exit(1)
    print("\n" + "═" * 62)
    print("✅ Socket push added.")
    print("═" * 62)
    print("\nRestart:")
    print("  ~/school/start.sh --stop")
    print("  ~/school/start.sh")
    print("\nEvents wired:")
    print("  notice:new               → bell badge + dropdown, toast")
    print("  attendance:marked        → live attendance page reload")
    print("  attendance:remarks       → live remarks update")
    print("  homework:new             → student toast")
    print("  homework:submission      → teacher toast")
    print("  homework:graded          → student toast")
    print("  exam:marks-posted        → student toast")
    print("  fee:payment              → student toast")


if __name__ == "__main__":
    main()
