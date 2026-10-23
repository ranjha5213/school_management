import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { School } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import Input from '../components/Input';
import PasswordInput from '../components/PasswordInput';
import Button from '../components/Button';

export default function Login() {
  const { user, login } = useAuth();
  const { school_name } = useSettings();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) nav('/dashboard', { replace: true });
  }, [user, nav]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Enter email and password');
    setLoading(true);
    try {
      await login(form);
      toast.success('Welcome back');
      nav('/dashboard', { replace: true });
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
          <h1 className="text-xl font-bold mt-2">{school_name}</h1>
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
