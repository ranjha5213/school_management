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
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 p-6 space-y-4 shadow-lg">
        <button type="button" onClick={() => nav('/forgot-password')} className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-800 dark:text-slate-100">
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
