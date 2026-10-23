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
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 p-6 space-y-4 shadow-lg">
        <button type="button" onClick={() => nav('/login')} className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-800 dark:text-slate-100">
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
