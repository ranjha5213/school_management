#!/usr/bin/env python3
"""
Auth frontend: register, forgot-password (OTP), reset-password, profile/change-password,
admin pending-approval page.
Run from repo root: python scripts/generate_auth_frontend.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FE = ROOT / "frontend"


def write(rel, content):
    p = FE / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")
    print(f"  ✓ frontend/{rel}")


def banner(m):
    print(f"\n── {m} " + "─" * max(0, 62 - len(m)))


def gen_api():
    banner("api")

    write("src/api/endpoints.js", r"""
import client from './client';

const unwrap = (p) => p.then((r) => r.data?.data ?? r.data);

export const authApi = {
  login: (p) => unwrap(client.post('/auth/login', p)),
  me: () => unwrap(client.get('/auth/me')),
  logout: (refresh) => client.post('/auth/logout', { refresh }),
  register: (p) => unwrap(client.post('/auth/register', p)),

  // password reset
  sendOtp: (email) => unwrap(client.post('/auth/send-otp', { email })),
  verifyOtp: (email, code) => unwrap(client.post('/auth/verify-otp', { email, code })),
  resetPassword: (reset_token, newPassword) =>
    unwrap(client.post('/auth/reset-password', { reset_token, newPassword })),

  // authenticated
  changePassword: (oldPassword, newPassword) =>
    unwrap(client.patch('/auth/change-password', { oldPassword, newPassword })),

  // admin
  listPending: () => unwrap(client.get('/auth/pending')),
  approve: (id) => unwrap(client.post(`/auth/approve/${id}`)),
  reject: (id, reason) => unwrap(client.post(`/auth/reject/${id}`, { reason })),
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
  attendance: (id, params) => unwrap(client.get(`/students/${id}/attendance`, { params })),
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


def gen_pages():
    banner("pages")

    # Login with Register + Forgot links
    write("src/pages/Login.jsx", r"""
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

        <div className="flex items-center justify-between text-xs">
          <Link to="/forgot-password" className="text-brand-600 hover:underline">Forgot password?</Link>
          <Link to="/register" className="text-brand-600 hover:underline">Create account</Link>
        </div>

        <Button type="submit" loading={loading} className="w-full">Sign in</Button>
      </form>
    </div>
  );
}
""".strip())

    # Register
    write("src/pages/Register.jsx", r"""
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { School, ArrowLeft } from 'lucide-react';
import { authApi } from '../api/endpoints';
import Input from '../components/Input';
import PasswordInput from '../components/PasswordInput';
import Button from '../components/Button';

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '', role: 'student',
  });
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password)
      return toast.error('Fill all fields');
    if (form.password !== form.confirm)
      return toast.error('Passwords do not match');
    if (form.password.length < 6)
      return toast.error('Password min 6 chars');

    setLoading(true);
    try {
      const res = await authApi.register({
        name: form.name, email: form.email, password: form.password, role: form.role,
      });
      toast.success(res?.message || 'Registration submitted. Await admin approval.');
      nav('/login');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-lg">
        <button type="button" onClick={() => nav(-1)} className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-800">
          <ArrowLeft className="w-3 h-3" /> Back
        </button>

        <div className="text-center">
          <School className="w-10 h-10 mx-auto text-brand-600" />
          <h1 className="text-xl font-bold mt-2">Create account</h1>
          <p className="text-xs text-slate-500 mt-1">Registration is reviewed by admin</p>
        </div>

        <Input label="Full name" name="name" value={form.name} onChange={onChange} />
        <Input label="Email" name="email" type="email" value={form.email} onChange={onChange} />
        <PasswordInput label="Password" name="password" value={form.password} onChange={onChange} />
        <PasswordInput label="Confirm password" name="confirm" value={form.confirm} onChange={onChange} />

        <div>
          <label className="label">I am a</label>
          <select name="role" value={form.role} onChange={onChange} className="input">
            <option value="student">Student</option>
            <option value="parent">Parent</option>
          </select>
        </div>

        <Button type="submit" loading={loading} className="w-full">Submit registration</Button>

        <div className="text-center text-xs text-slate-500">
          Already have an account? <Link to="/login" className="text-brand-600 hover:underline">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
""".strip())

    # Forgot password (email → send OTP)
    write("src/pages/ForgotPassword.jsx", r"""
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Mail } from 'lucide-react';
import { authApi } from '../api/endpoints';
import Input from '../components/Input';
import Button from '../components/Button';

export default function ForgotPassword() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Enter your email');
    setLoading(true);
    try {
      const res = await authApi.sendOtp(email);
      toast.success(res?.message || 'OTP sent to your email');
      nav(`/verify-otp?email=${encodeURIComponent(email)}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-lg">
        <button type="button" onClick={() => nav('/login')} className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-800">
          <ArrowLeft className="w-3 h-3" /> Back to sign in
        </button>

        <div className="text-center">
          <Mail className="w-10 h-10 mx-auto text-brand-600" />
          <h1 className="text-xl font-bold mt-2">Forgot password?</h1>
          <p className="text-xs text-slate-500 mt-1">We'll send a 6-digit code to your email</p>
        </div>

        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.local" />

        <Button type="submit" loading={loading} className="w-full">Send code</Button>

        <div className="text-center text-xs text-slate-500">
          Remembered it? <Link to="/login" className="text-brand-600 hover:underline">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
""".strip())

    # Verify OTP
    write("src/pages/VerifyOtp.jsx", r"""
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { authApi } from '../api/endpoints';
import Input from '../components/Input';
import Button from '../components/Button';

export default function VerifyOtp() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !code) return toast.error('Email and code required');
    if (code.length !== 6) return toast.error('Enter the 6-digit code');
    setLoading(true);
    try {
      const res = await authApi.verifyOtp(email, code);
      toast.success('Code verified');
      nav(`/reset-password?token=${res.reset_token}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      const res = await authApi.sendOtp(email);
      toast.success(res?.message || 'Code resent');
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-lg">
        <button type="button" onClick={() => nav('/forgot-password')} className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-800">
          <ArrowLeft className="w-3 h-3" /> Change email
        </button>

        <div className="text-center">
          <ShieldCheck className="w-10 h-10 mx-auto text-brand-600" />
          <h1 className="text-xl font-bold mt-2">Enter code</h1>
          <p className="text-xs text-slate-500 mt-1">Sent to {email}</p>
        </div>

        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
        />

        <Button type="submit" loading={loading} className="w-full">Verify</Button>

        <div className="text-center text-xs text-slate-500">
          Didn't get it?{' '}
          <button type="button" onClick={resend} className="text-brand-600 hover:underline">Resend code</button>
        </div>
      </form>
    </div>
  );
}
""".strip())

    # Reset password
    write("src/pages/ResetPassword.jsx", r"""
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { authApi } from '../api/endpoints';
import PasswordInput from '../components/PasswordInput';
import Button from '../components/Button';

export default function ResetPassword() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!token) return toast.error('Missing reset token');
    if (password.length < 6) return toast.error('Password min 6 chars');
    if (password !== confirm) return toast.error('Passwords do not match');

    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      toast.success('Password reset. Sign in with your new password.');
      nav('/login');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-lg">
        <button type="button" onClick={() => nav('/login')} className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-800">
          <ArrowLeft className="w-3 h-3" /> Back to sign in
        </button>

        <div className="text-center">
          <KeyRound className="w-10 h-10 mx-auto text-brand-600" />
          <h1 className="text-xl font-bold mt-2">Set new password</h1>
        </div>

        <PasswordInput label="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordInput label="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />

        <Button type="submit" loading={loading} className="w-full">Reset password</Button>

        <div className="text-center text-xs text-slate-500">
          <Link to="/login" className="text-brand-600 hover:underline">Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}
""".strip())

    # Profile with change password
    write("src/pages/Profile.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { User, Lock, Mail, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/endpoints';
import Card from '../components/Card';
import Input from '../components/Input';
import PasswordInput from '../components/PasswordInput';
import Button from '../components/Button';

export default function Profile() {
  const { user } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) return toast.error('Fill both fields');
    if (newPassword.length < 6) return toast.error('New password min 6 chars');
    if (newPassword !== confirm) return toast.error('Passwords do not match');

    setLoading(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      toast.success('Password changed');
      setOldPassword(''); setNewPassword(''); setConfirm('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-2xl">
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-brand-600" /> My Profile
        </h3>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-xl">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="space-y-1">
            <div className="font-medium">{user?.name}</div>
            <div className="text-sm text-slate-500 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> {user?.email}
            </div>
            <div className="text-sm text-slate-500 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" /> {user?.role}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand-600" /> Change Password
        </h3>
        <form onSubmit={changePassword} className="space-y-3 max-w-md">
          <PasswordInput label="Current password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
          <PasswordInput label="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <PasswordInput label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <Button type="submit" loading={loading}>Update password</Button>
        </form>
      </Card>
    </div>
  );
}
""".strip())

    # Admin pending approvals
    write("src/pages/PendingUsers.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UserCheck, UserX, RefreshCw } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import Modal from '../components/Modal';
import Input from '../components/Input';
import { authApi } from '../api/endpoints';

export default function PendingUsers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reason, setReason] = useState('');

  const load = () => {
    setLoading(true);
    authApi.listPending().then((d) => setRows(d || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const approve = async (id) => {
    try {
      await authApi.approve(id);
      toast.success('User approved');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    try {
      await authApi.reject(rejectTarget.id, reason);
      toast.success('User rejected');
      setRejectTarget(null); setReason('');
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-brand-600" /> Pending Registrations ({rows.length})
          </h3>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
        </div>

        {loading ? <Loader /> : rows.length === 0 ? (
          <Empty title="No pending registrations" hint="New sign-ups will appear here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Requested</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3">{r.email}</td>
                    <td className="p-3 capitalize">{r.role}</td>
                    <td className="p-3 text-slate-500">{r.created_at?.slice(0, 10)}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => approve(r.id)} className="text-green-600 text-xs font-medium flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => setRejectTarget(r)} className="text-red-600 text-xs font-medium flex items-center gap-1">
                          <UserX className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject registration"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={reject}>Reject</Button>
          </>
        }
      >
        <p className="text-sm text-slate-500 mb-3">
          Rejecting <b>{rejectTarget?.name}</b> ({rejectTarget?.email}).
        </p>
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}
""".strip())


def gen_app_and_sidebar():
    banner("App + sidebar")

    write("src/App.jsx", r"""
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import VerifyOtp from './pages/VerifyOtp';
import ResetPassword from './pages/ResetPassword';
import PendingUsers from './pages/PendingUsers';
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

function Protected({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
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
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-otp" element={<VerifyOtp />} />
            <Route path="/reset-password" element={<ResetPassword />} />

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
              <Route path="pending-users" element={<Protected adminOnly><PendingUsers /></Protected>} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
""".strip())

    write("src/components/Sidebar.jsx", r"""
import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  LayoutDashboard, CalendarCheck, Users, GraduationCap, BookOpen,
  FileText, DollarSign, Library as LibraryIcon, ClipboardList, Bell, User, School, UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const BASE_NAV = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/classes',    label: 'Classes',    icon: School },
  { to: '/students',   label: 'Students',   icon: Users },
  { to: '/teachers',   label: 'Teachers',   icon: GraduationCap },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/exams',      label: 'Exams',      icon: FileText },
  { to: '/homework',   label: 'Homework',   icon: ClipboardList },
  { to: '/timetable',  label: 'Timetable',  icon: BookOpen },
  { to: '/fees',       label: 'Fees',       icon: DollarSign },
  { to: '/library',    label: 'Library',    icon: LibraryIcon },
  { to: '/notices',    label: 'Notices',    icon: Bell },
  { to: '/profile',    label: 'Profile',    icon: User },
];

export default function Sidebar({ mobileOpen = false, onClose = () => {} }) {
  const { user } = useAuth();

  const nav = [...BASE_NAV];
  if (user?.role === 'admin') {
    nav.splice(1, 0, { to: '/pending-users', label: 'Pending Users', icon: UserCheck });
  }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
      isActive
        ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 font-medium'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

  const content = (
    <>
      <div className="px-3 py-4 font-bold text-brand-600 text-lg flex items-center justify-between">
        <span>School MS</span>
        <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <nav className="flex flex-col gap-0.5">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass} onClick={onClose}>
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );

  return (
    <>
      <aside className="w-56 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 min-h-screen p-3 hidden md:block">
        {content}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <aside className="relative w-64 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-3 overflow-y-auto">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
""".strip())


def gen_pkg_patch():
    banner("package.json patch")
    import json
    pkg_file = FE / "package.json"
    if pkg_file.exists():
        pkg = json.loads(pkg_file.read_text())
        deps = pkg.setdefault('dependencies', {})
        deps['socket.io-client'] = deps.get('socket.io-client', '^4.7.5')
        pkg_file.write_text(json.dumps(pkg, indent=2) + "\n")
        print("  ✓ ensured socket.io-client in frontend/package.json")


def main():
    print(f"Generating auth frontend in {FE}")
    gen_api()
    gen_pages()
    gen_app_and_sidebar()
    gen_pkg_patch()

    print("\n" + "═" * 66)
    print("✅ Auth frontend generated.")
    print("═" * 66)
    print("\nNew pages:")
    print("  ✓ /register          — signup (student/parent)")
    print("  ✓ /forgot-password   — enter email")
    print("  ✓ /verify-otp        — enter 6-digit code")
    print("  ✓ /reset-password    — set new password")
    print("  ✓ /profile           — view + change password")
    print("  ✓ /pending-users     — admin approval queue")
    print("Login now has links to Register + Forgot password.")


if __name__ == "__main__":
    main()
