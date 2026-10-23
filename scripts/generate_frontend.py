#!/usr/bin/env python3
"""
Frontend-only generator for school_management.
Writes the entire React app to ./frontend (overwrites matching files).
Run from repo root: python scripts/generate_frontend.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FE = ROOT / "frontend"


def write(rel: str, content: str):
    p = FE / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")
    print(f"  ✓ frontend/{rel}")


def banner(msg: str):
    print(f"\n── {msg} " + "─" * max(0, 62 - len(msg)))


# ════════════════════════════════════════════════════════════
# ROOT
# ════════════════════════════════════════════════════════════

def gen_root():
    banner("root")

    write("package.json", r"""
{
  "name": "school-management-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "lucide-react": "^0.400.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hot-toast": "^2.4.1",
    "react-router-dom": "^6.23.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "vite": "^5.3.1"
  }
}
""".strip())

    write("vite.config.js", r"""
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
    },
  },
});
""".strip())

    write("tailwind.config.js", r"""
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
};
""".strip())

    write("postcss.config.js", r"""
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
""".strip())

    write("index.html", r"""
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>School Management</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
""".strip())

    write(".env.example", r"""
VITE_API_URL=/api
VITE_SOCKET_URL=http://localhost:5000
""".strip())


# ════════════════════════════════════════════════════════════
# SRC ROOT
# ════════════════════════════════════════════════════════════

def gen_src_root():
    banner("src root")

    write("src/main.jsx", r"""
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
""".strip())

    write("src/index.css", r"""
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html { -webkit-tap-highlight-color: transparent; }
  body { @apply bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100; }
}

@layer components {
  .input {
    @apply w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700
           bg-white dark:bg-slate-900 text-sm
           focus:outline-none focus:ring-2 focus:ring-brand-500;
  }
  .label {
    @apply block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1;
  }
  .badge {
    @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium;
  }
  .badge-blue   { @apply bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300; }
  .badge-purple { @apply bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300; }
  .badge-gray   { @apply bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300; }
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}
.animate-fade-in { animation: fade-in .2s ease-out; }
""".strip())


# ════════════════════════════════════════════════════════════
# API
# ════════════════════════════════════════════════════════════

def gen_api():
    banner("api")

    write("src/api/client.js", r"""
import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    const msg = err.response?.data?.message || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

export default client;
""".strip())

    write("src/api/endpoints.js", r"""
import client from './client';

const unwrap = (p) => p.then((r) => r.data?.data ?? r.data);

export const authApi = {
  login: (p) => unwrap(client.post('/auth/login', p)),
  me: () => unwrap(client.get('/auth/me')),
  logout: (refresh) => client.post('/auth/logout', { refresh }),
  register: (p) => unwrap(client.post('/auth/register', p)),
};

export const classesApi = {
  list: () => unwrap(client.get('/classes')),
  sections: (classId) => unwrap(client.get(`/classes/${classId}/sections`)),
  students: (sectionId) => unwrap(client.get(`/classes/sections/${sectionId}/students`)),
  createClass: (p) => unwrap(client.post('/classes', p)),
  createSection: (classId, p) => unwrap(client.post(`/classes/${classId}/sections`, p)),
};

export const studentsApi = {
  list: (params) => unwrap(client.get('/students', { params })),
  byClassSection: (classId, sectionId) =>
    unwrap(client.get(`/classes/sections/${sectionId}/students`)),
  overview: (id) => unwrap(client.get(`/students/${id}/overview`)),
  attendance: (id, params) =>
    unwrap(client.get(`/students/${id}/attendance`, { params })),
  create: (p) => unwrap(client.post('/students', p)),
  update: (id, p) => unwrap(client.patch(`/students/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/students/${id}`)),
};

export const teachersApi = {
  list: () => unwrap(client.get('/teachers')),
  overview: (id) => unwrap(client.get(`/teachers/${id}/overview`)),
  create: (p) => unwrap(client.post('/teachers', p)),
  update: (id, p) => unwrap(client.patch(`/teachers/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/teachers/${id}`)),
};

export const attendanceApi = {
  byDate: (date, sectionId) =>
    unwrap(client.get('/attendance/date', { params: { date, section_id: sectionId } })),
  bulk: (records, sectionId) =>
    unwrap(client.post('/attendance/bulk', { records, section_id: sectionId })),
  updateRemarks: (studentId, date, remarks) =>
    unwrap(client.patch('/attendance/remarks', { student_id: studentId, date, remarks })),
  summary: (studentId) => unwrap(client.get(`/attendance/summary/${studentId}`)),
  classSummary: (params) => unwrap(client.get('/attendance/class-summary', { params })),
};

export const examsApi = {
  list: () => unwrap(client.get('/exams')),
  create: (p) => unwrap(client.post('/exams', p)),
  get: (id) => unwrap(client.get(`/exams/${id}`)),
  saveMarks: (marks) => unwrap(client.post('/exams/marks', { marks })),
  studentMarks: (studentId) => unwrap(client.get(`/exams/student/${studentId}`)),
};

export const homeworkApi = {
  list: (params) => unwrap(client.get('/homework', { params })),
  create: (p) => unwrap(client.post('/homework', p)),
  get: (id) => unwrap(client.get(`/homework/${id}`)),
  remove: (id) => unwrap(client.delete(`/homework/${id}`)),
  submit: (id, p) => unwrap(client.post(`/homework/${id}/submit`, p)),
};

export const feesApi = {
  invoices: (params) => unwrap(client.get('/fees/invoices', { params })),
  createInvoice: (p) => unwrap(client.post('/fees/invoices', p)),
  pay: (p) => unwrap(client.post('/fees/payments', p)),
  summary: () => unwrap(client.get('/fees/summary')),
};

export const libraryApi = {
  books: () => unwrap(client.get('/library/books')),
  createBook: (p) => unwrap(client.post('/library/books', p)),
  issues: () => unwrap(client.get('/library/issues')),
  issue: (p) => unwrap(client.post('/library/issues', p)),
  returnBook: (id, return_date) => unwrap(client.patch(`/library/issues/${id}/return`, { return_date })),
};

export const noticesApi = {
  list: () => unwrap(client.get('/notices')),
  create: (p) => unwrap(client.post('/notices', p)),
  update: (id, p) => unwrap(client.patch(`/notices/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/notices/${id}`)),
};

export const timetableApi = {
  list: (params) => unwrap(client.get('/timetable', { params })),
  create: (p) => unwrap(client.post('/timetable', p)),
  remove: (id) => unwrap(client.delete(`/timetable/${id}`)),
};

export const reportsApi = {
  dashboard: () => unwrap(client.get('/reports/dashboard')),
  attendance: (params) => unwrap(client.get('/reports/attendance', { params })),
};

export const searchApi = {
  query: (q) => unwrap(client.get('/search', { params: { q } })),
};

export const parentApi = {
  children: () => unwrap(client.get('/parent/children')),
};
""".strip())

    write("src/api/socket.js", r"""
import { io } from 'socket.io-client';

let socket = null;

export const connectSocket = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  if (socket) return socket;
  socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
    auth: { token },
    transports: ['websocket'],
  });
  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

export const getSocket = () => socket;
""".strip())


# ════════════════════════════════════════════════════════════
# CONTEXT
# ════════════════════════════════════════════════════════════

def gen_context():
    banner("context")

    write("src/context/AuthContext.jsx", r"""
import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/endpoints';
import { connectSocket, disconnectSocket } from '../api/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(setUser)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) connectSocket();
    else disconnectSocket();
  }, [user]);

  const login = async (creds) => {
    const res = await authApi.login(creds);
    const token = res.token;
    const u = res.user;
    if (token) localStorage.setItem('token', token);
    if (res.refresh) localStorage.setItem('refresh', res.refresh);
    setUser(u);
    return u;
  };

  const logout = async () => {
    const refresh = localStorage.getItem('refresh');
    try { await authApi.logout(refresh); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('refresh');
    setUser(null);
    disconnectSocket();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
""".strip())

    write("src/context/ThemeContext.jsx", r"""
import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
""".strip())

    write("src/context/SocketContext.jsx", r"""
import { createContext, useContext, useEffect, useState } from 'react';
import { connectSocket } from '../api/socket';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const s = connectSocket();
    setSocket(s);
    return () => s?.disconnect();
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);
""".strip())


# ════════════════════════════════════════════════════════════
# COMPONENTS
# ════════════════════════════════════════════════════════════

def gen_components():
    banner("components")

    write("src/components/Card.jsx", r"""
export default function Card({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
""".strip())

    write("src/components/Button.jsx", r"""
import { Loader2 } from 'lucide-react';

const variants = {
  primary:   'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  danger:    'bg-red-600 text-white hover:bg-red-700',
  ghost:     'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800',
};

const sizes = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export default function Button({
  children, onClick, type = 'button', variant = 'primary',
  size = 'md', loading = false, disabled = false, icon: Icon, className = '',
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition
        ${variants[variant]} ${sizes[size]} ${className} disabled:cursor-not-allowed`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}
""".strip())

    write("src/components/Input.jsx", r"""
export default function Input({
  label, value, onChange, type = 'text', placeholder, error,
  disabled, max, min, name, className = '',
}) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        max={max}
        min={min}
        className={`input ${error ? 'border-red-400' : ''}`}
      />
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}
""".strip())

    write("src/components/PasswordInput.jsx", r"""
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({ label, value, onChange, name, error }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <div className="relative">
        <input
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className={`input pr-10 ${error ? 'border-red-400' : ''}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}
""".strip())

    write("src/components/Loader.jsx", r"""
export default function Loader({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-brand-500 animate-spin" />
      {label && <div className="text-xs text-slate-500">{label}</div>}
    </div>
  );
}
""".strip())

    write("src/components/Empty.jsx", r"""
export default function Empty({ title = 'Nothing here', hint, icon: Icon }) {
  return (
    <div className="text-center py-10">
      {Icon && <Icon className="w-10 h-10 mx-auto text-slate-300 mb-2" />}
      <div className="font-medium text-slate-600 dark:text-slate-300">{title}</div>
      {hint && <div className="text-sm text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
""".strip())

    write("src/components/Modal.jsx", r"""
import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose?.();
    if (open) document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} bg-white dark:bg-slate-900 rounded-2xl shadow-xl animate-fade-in`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
""".strip())

    write("src/components/ConfirmDelete.jsx", r"""
import Modal from './Modal';
import Button from './Button';

export default function ConfirmDelete({ open, onClose, onConfirm, title = 'Delete?', message }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Delete</Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{message || 'This action cannot be undone.'}</p>
    </Modal>
  );
}
""".strip())

    write("src/components/FileUpload.jsx", r"""
import { Upload } from 'lucide-react';

export default function FileUpload({ label, accept = '*/*', onFile }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
        <Upload className="w-6 h-6 text-slate-400 mb-2" />
        <span className="text-sm text-slate-500">Click to upload</span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onFile?.(e.target.files?.[0])}
        />
      </label>
    </div>
  );
}
""".strip())

    write("src/components/Sidebar.jsx", r"""
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, CalendarCheck, Users, GraduationCap, BookOpen,
  FileText, DollarSign, Library, ClipboardList, Bell, User, School,
} from 'lucide-react';

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/classes',    label: 'Classes',    icon: School },
  { to: '/students',   label: 'Students',   icon: Users },
  { to: '/teachers',   label: 'Teachers',   icon: GraduationCap },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/exams',      label: 'Exams',      icon: FileText },
  { to: '/homework',   label: 'Homework',   icon: ClipboardList },
  { to: '/timetable',  label: 'Timetable',  icon: BookOpen },
  { to: '/fees',       label: 'Fees',       icon: DollarSign },
  { to: '/library',    label: 'Library',    icon: Library },
  { to: '/notices',    label: 'Notices',    icon: Bell },
  { to: '/profile',    label: 'Profile',    icon: User },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 min-h-screen p-3 hidden md:block">
      <div className="px-3 py-4 font-bold text-brand-600 text-lg">School MS</div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                isActive
                  ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 font-medium'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
""".strip())

    write("src/components/SearchCombobox.jsx", r"""
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, GraduationCap } from 'lucide-react';
import { searchApi } from '../api/endpoints';

export default function SearchCombobox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ students: [], teachers: [] });
  const ref = useRef();
  const nav = useNavigate();

  useEffect(() => {
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setData({ students: [], teachers: [] }); return; }
    const t = setTimeout(() => {
      searchApi.query(q).then((d) => { setData(d || { students: [], teachers: [] }); setOpen(true); }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (type, id) => {
    setOpen(false); setQ('');
    nav(type === 'student' ? `/students/${id}` : `/teachers/${id}`);
  };

  const has = data.students?.length || data.teachers?.length;

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => has && setOpen(true)}
          placeholder="Search students or teachers…"
          className="input pl-9 w-full"
        />
      </div>
      {open && has && (
        <div className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-80 overflow-auto">
          {data.students?.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1 text-xs uppercase text-slate-400">Students</div>
              {data.students.map((s) => (
                <button key={s.id} onClick={() => go('student', s.id)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-sm">
                  <User className="w-3.5 h-3.5 text-brand-500" />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-xs text-slate-400">{s.class_name} · {s.section_name}</span>
                </button>
              ))}
            </div>
          )}
          {data.teachers?.length > 0 && (
            <div className="py-1 border-t border-slate-100 dark:border-slate-700">
              <div className="px-3 py-1 text-xs uppercase text-slate-400">Teachers</div>
              {data.teachers.map((t) => (
                <button key={t.id} onClick={() => go('teacher', t.id)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-sm">
                  <GraduationCap className="w-3.5 h-3.5 text-purple-500" />
                  <span className="flex-1">{t.name}</span>
                  <span className="text-xs text-slate-400">{t.employee_code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
""".strip())

    write("src/components/Topbar.jsx", r"""
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SearchCombobox from './SearchCombobox';
import { LogOut, Moon, Sun } from 'lucide-react';

export default function Topbar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 px-4 sticky top-0 z-20">
      <div className="md:hidden font-bold text-brand-600">SMS</div>
      <div className="flex-1"><SearchCombobox /></div>
      <button onClick={toggle} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Toggle theme">
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
      <div className="text-sm text-slate-600 dark:text-slate-300 hidden sm:block">{user?.name}</div>
      <button onClick={logout} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Logout">
        <LogOut className="w-4 h-4" />
      </button>
    </header>
  );
}
""".strip())

    write("src/components/Layout.jsx", r"""
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="p-4 flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
""".strip())

    write("src/components/ProtectedRoute.jsx", r"""
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
""".strip())


# ════════════════════════════════════════════════════════════
# PAGES
# ════════════════════════════════════════════════════════════

def gen_pages():
    banner("pages")

    write("src/pages/Login.jsx", r"""
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { School } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Input from '../components/Input';
import PasswordInput from '../components/PasswordInput';
import Button from '../components/Button';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Enter email and password');
    setLoading(true);
    try {
      await login(form);
      toast.success('Welcome back');
      nav('/dashboard');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-lg">
        <div className="text-center">
          <School className="w-10 h-10 mx-auto text-brand-600" />
          <h1 className="text-xl font-bold mt-2">School Management</h1>
          <p className="text-xs text-slate-500 mt-1">Sign in to continue</p>
        </div>
        <Input label="Email" name="email" type="email" value={form.email} onChange={onChange} placeholder="you@school.local" />
        <PasswordInput label="Password" name="password" value={form.password} onChange={onChange} />
        <Button type="submit" loading={loading} className="w-full">Sign in</Button>
      </form>
    </div>
  );
}
""".strip())

    write("src/pages/Dashboard.jsx", r"""
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, School, CalendarCheck, DollarSign, ClipboardList,
} from 'lucide-react';
import Card from '../components/Card';
import { classesApi, reportsApi } from '../api/endpoints';

export default function Dashboard() {
  const nav = useNavigate();
  const [classes, setClasses] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      classesApi.list().catch(() => []),
      reportsApi.dashboard().catch(() => null),
    ]).then(([c, s]) => {
      setClasses(Array.isArray(c) ? c : []);
      setStats(s);
    }).finally(() => setLoading(false));
  }, []);

  const tiles = [
    { label: 'Classes',    value: stats?.classes ?? classes.length,     icon: School,        to: '/classes',    color: 'from-blue-500' },
    { label: 'Sections',   value: stats?.sections ?? '—',               icon: School,        to: '/classes',    color: 'from-purple-500' },
    { label: 'Students',   value: stats?.students ?? '—',               icon: Users,         to: '/students',   color: 'from-green-500' },
    { label: 'Teachers',   value: stats?.teachers ?? '—',               icon: GraduationCap, to: '/teachers',   color: 'from-amber-500' },
    { label: 'Attendance', value: stats?.attendanceToday?.total ?? '—', icon: CalendarCheck, to: '/attendance', color: 'from-red-500' },
    { label: 'Homework',   value: 'View',                               icon: ClipboardList, to: '/homework',   color: 'from-teal-500' },
    { label: 'Fees',       value: 'View',                               icon: DollarSign,    to: '/fees',       color: 'from-pink-500' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-semibold">Dashboard</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.label}
              onClick={() => nav(t.to)}
              className={`group relative overflow-hidden text-left p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition`}
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.color} to-transparent opacity-70`} />
              <div className="flex items-center justify-between">
                <Icon className="w-5 h-5 text-brand-600" />
                <span className="text-2xl font-bold">{t.value}</span>
              </div>
              <div className="mt-2 text-sm text-slate-500">{t.label}</div>
            </button>
          );
        })}
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Classes</h3>
        {loading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : classes.length === 0 ? (
          <div className="text-sm text-slate-500">No classes yet</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => nav(`/classes/${c.id}`)}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition"
              >
                <div className="font-medium">{c.class_name}</div>
                <div className="text-xs text-slate-500">
                  {c.section_count} sections · {c.student_count} students
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {stats?.attendanceToday && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Today's Attendance</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300">
              <div className="text-xs uppercase">Present</div>
              <div className="text-2xl font-bold">{stats.attendanceToday.present || 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300">
              <div className="text-xs uppercase">Absent</div>
              <div className="text-2xl font-bold">{stats.attendanceToday.absent || 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
              <div className="text-xs uppercase">Total</div>
              <div className="text-2xl font-bold">{stats.attendanceToday.total || 0}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
""".strip())

    write("src/pages/Classes.jsx", r"""
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { School, Layers, Users, ChevronRight } from 'lucide-react';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { classesApi } from '../api/endpoints';

export default function Classes() {
  const { classId, sectionId } = useParams();
  const nav = useNavigate();
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  useEffect(() => {
    setLoadingClasses(true);
    classesApi.list().then((d) => setClasses(d || [])).finally(() => setLoadingClasses(false));
  }, []);

  useEffect(() => {
    if (!classId) { setSections([]); return; }
    setLoadingSections(true);
    classesApi.sections(classId).then((d) => setSections(d || [])).finally(() => setLoadingSections(false));
  }, [classId]);

  useEffect(() => {
    if (!sectionId) { setStudents([]); return; }
    setLoadingStudents(true);
    classesApi.students(sectionId).then((d) => setStudents(d || [])).finally(() => setLoadingStudents(false));
  }, [sectionId]);

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <School className="w-4 h-4 text-brand-600" /> Classes
        </h3>
        {loadingClasses ? <Loader /> : classes.length === 0 ? <Empty title="No classes" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => nav(`/classes/${c.id}`)}
                className={`p-3 rounded-xl border text-left transition ${
                  String(c.id) === String(classId)
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="font-medium flex items-center gap-1.5">
                  {c.class_name} <ChevronRight className="w-3.5 h-3.5" />
                </div>
                <div className="text-xs text-slate-500">
                  {c.section_count} sections · {c.student_count} students
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {classId && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" /> Sections
          </h3>
          {loadingSections ? <Loader /> : sections.length === 0 ? <Empty title="No sections" /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => nav(`/classes/${classId}/sections/${s.id}`)}
                  className={`p-3 rounded-xl border text-left transition ${
                    String(s.id) === String(sectionId)
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="font-medium">{s.section_name}</div>
                  <div className="text-xs text-slate-500">
                    {s.student_count} students{s.room_number ? ` · Room ${s.room_number}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {sectionId && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-green-600" /> Students
          </h3>
          {loadingStudents ? <Loader /> : students.length === 0 ? <Empty title="No students" /> : (
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
    </div>
  );
}
""".strip())

    write("src/pages/Students.jsx", r"""
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search } from 'lucide-react';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { studentsApi } from '../api/endpoints';

export default function Students() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    studentsApi.list().then((d) => setRows(d || [])).finally(() => setLoading(false));
  }, []);

  const filtered = q
    ? rows.filter((r) =>
        r.student_name?.toLowerCase().includes(q.toLowerCase()) ||
        r.admission_number?.toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-600" /> Students ({filtered.length})
        </h3>
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name or admission #"
            className="input pl-9"
          />
        </div>
        {loading ? <Loader /> : filtered.length === 0 ? <Empty title="No students" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Admission #</th>
                  <th className="text-left p-3">Roll</th>
                  <th className="text-left p-3">Class</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => nav(`/students/${r.id}`)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-medium">{r.student_name}</td>
                    <td className="p-3 font-mono text-xs">{r.admission_number}</td>
                    <td className="p-3">{r.roll_number || '—'}</td>
                    <td className="p-3 text-slate-500">{r.class_name} · {r.section_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
""".strip())

    write("src/pages/Teachers.jsx", r"""
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Search } from 'lucide-react';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { teachersApi } from '../api/endpoints';

export default function Teachers() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    teachersApi.list().then((d) => setRows(d || [])).finally(() => setLoading(false));
  }, []);

  const filtered = q
    ? rows.filter((r) =>
        r.name?.toLowerCase().includes(q.toLowerCase()) ||
        r.employee_code?.toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-purple-600" /> Teachers ({filtered.length})
        </h3>
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name or employee code"
            className="input pl-9"
          />
        </div>
        {loading ? <Loader /> : filtered.length === 0 ? <Empty title="No teachers" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => nav(`/teachers/${t.id}`)}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition"
              >
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-slate-500">{t.employee_code}</div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
""".strip())

    write("src/pages/StudentDetail.jsx", r"""
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Hash, BookOpen, DollarSign, ClipboardList,
  FileText, CalendarCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { studentsApi, attendanceApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { id: 'attendance', label: 'Attendance',   icon: CalendarCheck },
  { id: 'exams',      label: 'Test Reports', icon: FileText },
  { id: 'fees',       label: 'Fees',         icon: DollarSign },
  { id: 'homework',   label: 'Homework',     icon: ClipboardList },
];

export default function StudentDetail() {
  const { studentId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('attendance');

  useEffect(() => {
    setLoading(true);
    studentsApi.overview(studentId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <Loader />;
  if (!data?.profile) return <Card><Empty title="Student not found" /></Card>;

  const { profile, attendanceSummary, fees, homework, exams } = data;

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav(-1)} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-xl">
            {profile.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{profile.name}</h2>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-3">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{profile.email}</span>
              <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />Adm {profile.admission_number}</span>
              <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{profile.class_name || '—'} — {profile.section_name || '—'}</span>
            </div>
          </div>
        </div>

        {attendanceSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
            <Stat label="Total Days" value={attendanceSummary.total_days} />
            <Stat label="Present"    value={attendanceSummary.present_days} tone="green" />
            <Stat label="Absent"     value={attendanceSummary.absent_days} tone="red" />
            <Stat label="Late"       value={attendanceSummary.late_days} tone="amber" />
            <Stat label="Rate %"     value={attendanceSummary.attendance_percentage} tone="blue" />
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px transition ${
              tab === id ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'attendance' && <AttendanceTab studentId={studentId} />}
      {tab === 'exams'      && <ExamsTab rows={exams} />}
      {tab === 'fees'       && <FeesTab rows={fees} />}
      {tab === 'homework'   && <HomeworkTab rows={homework} />}
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }) {
  const map = {
    slate: 'bg-slate-50 dark:bg-slate-800',
    green: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
    red:   'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
    blue:  'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
  };
  return (
    <div className={`p-3 rounded-xl ${map[tone]}`}>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-lg font-bold">{value ?? '—'}</div>
    </div>
  );
}

function AttendanceTab({ studentId }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [newRemarks, setNewRemarks] = useState('');

  const load = () => {
    setLoading(true);
    studentsApi.attendance(studentId).then((d) => setRows(d || [])).finally(() => setLoading(false));
  };
  useEffect(load, [studentId]);

  const startEdit = (r) => { setEditRow(r); setNewRemarks(r.remarks || ''); };
  const cancelEdit = () => { setEditRow(null); setNewRemarks(''); };

  const saveRemarks = async () => {
    try {
      await attendanceApi.updateRemarks(editRow.student_id, editRow.date, newRemarks);
      toast.success('Remarks updated');
      cancelEdit();
      load();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <Loader />;
  if (!rows.length) return <Card><Empty title="No attendance records" /></Card>;

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Remarks</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3 font-mono text-xs">{r.date}</td>
                <td className="p-3 capitalize">{r.status}</td>
                <td className="p-3 text-slate-500">
                  {editRow?.id === r.id ? (
                    <input
                      className="input"
                      value={newRemarks}
                      onChange={(e) => setNewRemarks(e.target.value)}
                    />
                  ) : (r.remarks || '—')}
                </td>
                <td className="p-3 text-right">
                  {editRow?.id === r.id ? (
                    <div className="flex justify-end gap-1">
                      <button onClick={saveRemarks} className="text-xs text-green-600 font-medium">Save</button>
                      <button onClick={cancelEdit} className="text-xs text-slate-500">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(r)} className="text-xs text-brand-600 font-medium">Edit remarks</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ExamsTab({ rows }) {
  if (!rows?.length) return <Card><Empty title="No test reports yet" /></Card>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="text-left p-3">Exam</th>
            <th className="text-left p-3">Subject</th>
            <th className="text-left p-3">Marks</th>
            <th className="text-left p-3">Remarks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="p-3">{r.exam_name}<div className="text-xs text-slate-400">{r.type_name}</div></td>
              <td className="p-3">{r.subject_name}</td>
              <td className="p-3">{r.marks_obtained}/{r.total_marks}</td>
              <td className="p-3 text-slate-500">{r.remarks || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function FeesTab({ rows }) {
  if (!rows?.length) return <Card><Empty title="No fee records" /></Card>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="text-left p-3">Invoice</th>
            <th className="text-left p-3">Amount</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="p-3 font-mono text-xs">{r.invoice_number || r.id}</td>
              <td className="p-3">{r.total_amount ?? r.amount ?? '—'}</td>
              <td className="p-3 capitalize">{r.status || '—'}</td>
              <td className="p-3 text-slate-500">{r.created_at?.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function HomeworkTab({ rows }) {
  if (!rows?.length) return <Card><Empty title="No homework records" /></Card>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="text-left p-3">Homework</th>
            <th className="text-left p-3">Subject</th>
            <th className="text-left p-3">Due</th>
            <th className="text-left p-3">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="p-3">{r.title}</td>
              <td className="p-3">{r.subject_name || '—'}</td>
              <td className="p-3 font-mono text-xs">{r.due_date}</td>
              <td className="p-3">{r.submission_date ? '✓ Yes' : <span className="text-red-500">Pending</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
""".strip())

    write("src/pages/TeacherDetail.jsx", r"""
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Hash, Clock, ClipboardList } from 'lucide-react';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { teachersApi } from '../api/endpoints';

export default function TeacherDetail() {
  const { teacherId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    teachersApi.overview(teacherId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [teacherId]);

  if (loading) return <Loader />;
  if (!data?.profile) return <Card><Empty title="Teacher not found" /></Card>;

  const { profile, sections, timetable, homework, attendanceMarked } = data;

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav(-1)} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold text-xl">
            {profile.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold">{profile.name}</h2>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-3">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{profile.email}</span>
              <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{profile.employee_code}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Sections Handled</h3>
          {!sections?.length ? <div className="text-sm text-slate-500">None assigned</div> : (
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => (
                <span key={s.section_id} className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                  {s.class_name} — {s.section_name}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Attendance Marked (last 60 days)
          </h3>
          {!attendanceMarked?.length ? <div className="text-sm text-slate-500">No records</div> : (
            <div className="max-h-64 overflow-auto divide-y divide-slate-100 dark:divide-slate-700">
              {attendanceMarked.map((r) => (
                <div key={r.date} className="py-1.5 flex justify-between text-sm">
                  <span className="font-mono text-xs">{r.date}</span>
                  <span className="text-slate-500">{r.present}P · {r.absent}A · {r.total} total</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold mb-3">Timetable</h3>
          {!timetable?.length ? <div className="text-sm text-slate-500">No timetable</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left p-2">Day</th>
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Subject</th>
                    <th className="text-left p-2">Class · Section</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {timetable.map((t) => (
                    <tr key={t.id}>
                      <td className="p-2">{t.day_of_week}</td>
                      <td className="p-2 font-mono text-xs">{t.start_time}–{t.end_time}</td>
                      <td className="p-2">{t.subject_name}</td>
                      <td className="p-2">{t.class_name} · {t.section_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Homework Posted
          </h3>
          {!homework?.length ? <div className="text-sm text-slate-500">None</div> : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {homework.map((h) => (
                <div key={h.id} className="py-2">
                  <div className="font-medium text-sm">{h.title}</div>
                  <div className="text-xs text-slate-500">
                    {h.subject_name} · {h.class_name} · due {h.due_date}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
""".strip())

    write("src/pages/Attendance.jsx", r"""
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck, Save, CheckCircle2, XCircle, Clock, AlertCircle,
  Users, BookOpen, Layers, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import Empty from '../components/Empty';
import { attendanceApi, studentsApi, classesApi } from '../api/endpoints';

const STATUSES = [
  { id: 'present', label: 'Present', color: 'green',  icon: CheckCircle2 },
  { id: 'absent',  label: 'Absent',  color: 'red',    icon: XCircle },
  { id: 'late',    label: 'Late',    color: 'yellow', icon: Clock },
  { id: 'excused', label: 'Excused', color: 'gray',   icon: AlertCircle },
];

const chipActiveClass = {
  green:  'bg-green-100 text-green-700 ring-2 ring-green-500 dark:bg-green-500/20 dark:text-green-300',
  red:    'bg-red-100 text-red-700 ring-2 ring-red-500 dark:bg-red-500/20 dark:text-red-300',
  yellow: 'bg-amber-100 text-amber-700 ring-2 ring-amber-500 dark:bg-amber-500/20 dark:text-amber-300',
  gray:   'bg-slate-200 text-slate-700 ring-2 ring-slate-500 dark:bg-slate-600/40 dark:text-slate-300',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Attendance() {
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(todayISO());

  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState({});
  const [lock, setLock] = useState(null);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const locked = !!lock;

  useEffect(() => {
    (async () => {
      setLoadingClasses(true);
      try {
        const data = await classesApi.list();
        setClasses(Array.isArray(data) ? data : []);
      } catch (e) { toast.error(e.message); }
      finally { setLoadingClasses(false); }
    })();
  }, []);

  useEffect(() => {
    if (!classId) { setSections([]); setSectionId(''); return; }
    (async () => {
      setLoadingSections(true);
      setSectionId('');
      try {
        const data = await classesApi.sections(classId);
        const list = Array.isArray(data) ? data : [];
        setSections(list);
        if (list.length === 1) setSectionId(String(list[0].id));
      } catch (e) { toast.error(e.message); }
      finally { setLoadingSections(false); }
    })();
  }, [classId]);

  const loadGrid = async () => {
    if (!classId || !sectionId) return toast.error('Select class and section');
    if (date !== todayISO()) return toast.error('Attendance can only be marked for today');

    setLoadingStudents(true);
    setLoaded(false);
    setLock(null);
    try {
      const [s, a] = await Promise.all([
        studentsApi.byClassSection(classId, sectionId),
        attendanceApi.byDate(date, sectionId).catch(() => ({ records: [], lock: null })),
      ]);

      const list = Array.isArray(s) ? s : [];
      setStudents(list);

      const serverRecords = a?.records || [];
      const existing = {};
      serverRecords.forEach((r) => { existing[r.student_id] = r.status; });

      const initial = {};
      list.forEach((st) => { initial[st.id] = existing[st.id] || 'present'; });
      setRecords(initial);
      setLock(a?.lock || null);

      setLoaded(true);
      if (!list.length) toast('No students in this section yet');
      else if (a?.lock) toast(`Loaded — locked by ${a.lock.marked_by_name || 'user'} at ${a.lock.marked_at}`);
      else toast.success(`Loaded ${list.length} students`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingStudents(false);
    }
  };

  const setStatus = (id, status) => {
    if (locked) return toast.error('Attendance is locked. Only remarks can be edited.');
    setRecords((r) => ({ ...r, [id]: status }));
  };

  const markAll = (status) => {
    if (locked) return toast.error('Attendance is locked.');
    const next = {};
    students.forEach((st) => { next[st.id] = status; });
    setRecords(next);
    toast.success(`All marked ${status}`);
  };

  const saveAll = async () => {
    if (!students.length) return toast.error('Nothing to save');
    if (date !== todayISO()) return toast.error('Can only mark today');
    const missing = students.filter((s) => !records[s.id]);
    if (missing.length) return toast.error(`${missing.length} student(s) unmarked`);

    setSaving(true);
    try {
      const payload = students.map((s) => ({
        student_id: s.id,
        date,
        status: records[s.id],
      }));
      await attendanceApi.bulk(payload, sectionId);
      toast.success(`Saved ${payload.length} records`);
      await loadGrid();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    Object.values(records).forEach((v) => { if (c[v] !== undefined) c[v]++; });
    return c;
  }, [records]);

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-brand-600" /> Mark Attendance
          {locked && (
            <span className="badge badge-gray ml-auto flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {lock.marked_by_name || 'user'} · {lock.marked_at}
            </span>
          )}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="label flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" /> Class
            </label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="input" disabled={loadingClasses}>
              <option value="">{loadingClasses ? 'Loading…' : 'Select class'}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.class_name}{c.class_code ? ` (${c.class_code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" /> Section
            </label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="input" disabled={!classId || loadingSections}>
              <option value="">
                {!classId ? 'Select class first'
                  : loadingSections ? 'Loading…'
                  : sections.length ? 'Select section'
                  : 'No sections'}
              </option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.section_name}</option>
              ))}
            </select>
          </div>

          <Input
            label="Date"
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />

          <div className="flex items-end">
            <Button onClick={loadGrid} icon={Users} className="w-full" disabled={!classId || !sectionId || loadingStudents} loading={loadingStudents}>
              Load Students
            </Button>
          </div>
        </div>
      </Card>

      {!loaded ? (
        <Card><Empty title="No attendance loaded" hint="Pick a class, section, and date, then click Load Students" /></Card>
      ) : students.length === 0 ? (
        <Card><Empty title="No students in this section" /></Card>
      ) : (
        <>
          {!locked && (
            <div className="flex flex-wrap gap-2 items-center">
              <Button size="sm" variant="secondary" onClick={() => markAll('present')}>All Present</Button>
              <Button size="sm" variant="secondary" onClick={() => markAll('absent')}>All Absent</Button>
              <Button size="sm" variant="secondary" onClick={() => markAll('late')}>All Late</Button>
              <Button size="sm" variant="secondary" onClick={() => markAll('excused')}>All Excused</Button>
              <div className="flex-1" />
              <Button onClick={saveAll} loading={saving} icon={Save} className="bg-green-600 hover:bg-green-700">
                Save Attendance
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATUSES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.id} className={`flex items-center justify-between p-3 rounded-xl ${counts[s.id] ? chipActiveClass[s.color] : 'bg-slate-50 dark:bg-slate-800 text-slate-500'}`}>
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium capitalize">{s.label}</span>
                  </div>
                  <span className="text-lg font-bold">{counts[s.id]}</span>
                </div>
              );
            })}
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left p-3 w-12">#</th>
                    <th className="text-left p-3">Admission #</th>
                    <th className="text-left p-3">Roll</th>
                    <th className="text-left p-3">Student</th>
                    <th className="text-center p-3">Mark Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {students.map((s, i) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3 text-slate-500">{i + 1}</td>
                      <td className="p-3 font-mono text-xs">{s.admission_number}</td>
                      <td className="p-3 text-slate-500">{s.roll_number || '—'}</td>
                      <td className="p-3 font-medium">{s.student_name}</td>
                      <td className="p-3">
                        <div className="flex justify-center gap-1.5 flex-wrap">
                          {STATUSES.map((st) => {
                            const Icon = st.icon;
                            const active = records[s.id] === st.id;
                            return (
                              <button
                                key={st.id}
                                type="button"
                                disabled={locked}
                                onClick={() => setStatus(s.id, st.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                                  active ? chipActiveClass[st.color]
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'
                                } ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{st.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {!locked && (
            <div className="flex justify-end">
              <Button onClick={saveAll} loading={saving} icon={Save} className="bg-green-600 hover:bg-green-700">
                Save Attendance ({students.length})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
""".strip())

    # Simple stubs for remaining pages
    for name, title, icon in [
        ("Exams", "Exams", "FileText"),
        ("Homework", "Homework", "ClipboardList"),
        ("Timetable", "Timetable", "BookOpen"),
        ("Fees", "Fees", "DollarSign"),
        ("Library", "Library", "Library"),
        ("Notices", "Notices", "Bell"),
        ("Profile", "Profile", "User"),
    ]:
        write(f"src/pages/{name}.jsx", f"""
import {{ {icon} }} from 'lucide-react';
import Card from '../components/Card';
import Empty from '../components/Empty';

export default function {name}() {{
  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <{icon} className="w-4 h-4 text-brand-600" /> {title}
        </h3>
        <Empty title="{title} page" hint="Wire up CRUD as needed" />
      </Card>
    </div>
  );
}}
""".strip())


# ════════════════════════════════════════════════════════════
# APP + ROUTER
# ════════════════════════════════════════════════════════════

def gen_app():
    banner("App + router")

    write("src/App.jsx", r"""
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Students from './pages/Students';
import Teachers from './pages/Teachers';
import StudentDetail from './pages/StudentDetail';
import TeacherDetail from './pages/TeacherDetail';
import Attendance from './pages/Attendance';
import Exams from './pages/Exams';
import Homework from './pages/Homework';
import Timetable from './pages/Timetable';
import Fees from './pages/Fees';
import Library from './pages/Library';
import Notices from './pages/Notices';
import Profile from './pages/Profile';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="classes" element={<Classes />} />
              <Route path="classes/:classId" element={<Classes />} />
              <Route path="classes/:classId/sections/:sectionId" element={<Classes />} />
              <Route path="students" element={<Students />} />
              <Route path="students/:studentId" element={<StudentDetail />} />
              <Route path="teachers" element={<Teachers />} />
              <Route path="teachers/:teacherId" element={<TeacherDetail />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="exams" element={<Exams />} />
              <Route path="homework" element={<Homework />} />
              <Route path="timetable" element={<Timetable />} />
              <Route path="fees" element={<Fees />} />
              <Route path="library" element={<Library />} />
              <Route path="notices" element={<Notices />} />
              <Route path="profile" element={<Profile />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
""".strip())


# ════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════

def main():
    print(f"Generating frontend in {FE}")
    gen_root()
    gen_src_root()
    gen_api()
    gen_context()
    gen_components()
    gen_pages()
    gen_app()

    print("\n" + "═" * 66)
    print("✅ Frontend generation complete.")
    print("═" * 66)
    print("\nNext steps:")
    print("  1. cd frontend")
    print("  2. npm install")
    print("  3. cp .env.example .env    (edit if backend isn't on :5000)")
    print("  4. npm run dev")
    print("\nThen open http://localhost:5173")
    print("\nPages included:")
    print("  ✓ Login")
    print("  ✓ Dashboard (clickable tiles + classes grid)")
    print("  ✓ Classes → Sections → Students drill-down")
    print("  ✓ Students list → StudentDetail (attendance, tests, fees, homework)")
    print("  ✓ Teachers list → TeacherDetail (sections, timetable, homework, attendance stats)")
    print("  ✓ Attendance (locked after submit; remarks editable; today only)")
    print("  ✓ Search (topbar) routes to Student/Teacher detail")
    print("  · Exams, Homework, Timetable, Fees, Library, Notices, Profile (stubs)")
    print("\n⚠️  Overwrites files with the same names in frontend/.")


if __name__ == "__main__":
    main()
