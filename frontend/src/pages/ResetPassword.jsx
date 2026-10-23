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
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 p-6 space-y-4 shadow-lg">
        <button type="button" onClick={() => nav('/login')} className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-800 dark:text-slate-100">
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
