#!/usr/bin/env python3
"""
Register page now goes: form -> OTP -> pending.
Run from ~/school: python scripts/generate_register_otp_frontend.py
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
    print(f"\n── {m} " + "─" * max(0, 60 - len(m)))


def gen_api():
    banner("endpoints")

    p = FE / "src/api/endpoints.js"
    text = p.read_text()

    if "verifyRegisterOtp" in text:
        print("  · endpoints already updated")
        return

    # insert new methods after register:
    old = "register: (p) => unwrap(client.post('/auth/register', p)),"
    new = """register: (p) => unwrap(client.post('/auth/register', p)),
  verifyRegisterOtp: (email, code) =>
    unwrap(client.post('/auth/verify-register-otp', { email, code })),
  resendRegisterOtp: (email) =>
    unwrap(client.post('/auth/resend-register-otp', { email })),"""
    text = text.replace(old, new)
    p.write_text(text)
    print("  ✓ patched frontend/src/api/endpoints.js")


def gen_register():
    banner("Register.jsx")

    write("src/pages/Register.jsx", r"""
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { School, ArrowLeft, Mail, ShieldCheck, RefreshCw, CheckCircle2 } from 'lucide-react';
import { authApi } from '../api/endpoints';
import Input from '../components/Input';
import PasswordInput from '../components/PasswordInput';
import Button from '../components/Button';

export default function Register() {
  const nav = useNavigate();
  const [step, setStep] = useState(1); // 1 = form, 2 = OTP
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '', role: 'student',
  });
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [banner, setBanner] = useState(null);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const validateForm = () => {
    if (!form.name.trim()) return 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Enter a valid email';
    if (form.password.length < 6) return 'Password must be at least 6 characters';
    if (form.password !== form.confirm) return 'Passwords do not match';
    return null;
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setBanner(null);
    const err = validateForm();
    if (err) {
      setBanner({ type: 'error', msg: err });
      toast.error(err);
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.register({
        name: form.name, email: form.email,
        password: form.password, role: form.role,
      });
      const msg = res?.message || `We sent a 6-digit code to ${form.email}`;
      setBanner({ type: 'success', msg });
      toast.success('Verification code sent');
      setStep(2);
    } catch (e2) {
      const msg = e2.message || 'Registration failed';
      setBanner({ type: 'error', msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setBanner(null);
    if (code.length !== 6) {
      setBanner({ type: 'error', msg: 'Enter the 6-digit code' });
      toast.error('Enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.verifyRegisterOtp(form.email, code);
      const msg = res?.message || 'Email verified! Waiting for admin approval.';
      setBanner({ type: 'success', msg });
      toast.success('Email verified');
      setTimeout(() => nav('/login'), 2200);
    } catch (e2) {
      const msg = e2.message || 'Invalid code';
      setBanner({ type: 'error', msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setBanner(null);
    try {
      const res = await authApi.resendRegisterOtp(form.email);
      setBanner({ type: 'success', msg: res?.message || 'Code resent' });
      toast.success('Code resent');
    } catch (e2) {
      setBanner({ type: 'error', msg: e2.message });
      toast.error(e2.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
      <form
        onSubmit={step === 1 ? submitForm : submitCode}
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-lg"
      >
        <button
          type="button"
          onClick={() => (step === 1 ? nav(-1) : setStep(1))}
          className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-800"
        >
          <ArrowLeft className="w-3 h-3" /> {step === 1 ? 'Back' : 'Edit details'}
        </button>

        <div className="text-center">
          {step === 1 ? (
            <>
              <School className="w-10 h-10 mx-auto text-brand-600" />
              <h1 className="text-xl font-bold mt-2">Create account</h1>
              <p className="text-xs text-slate-500 mt-1">
                We'll email you a code to verify
              </p>
            </>
          ) : (
            <>
              <Mail className="w-10 h-10 mx-auto text-brand-600" />
              <h1 className="text-xl font-bold mt-2">Verify your email</h1>
              <p className="text-xs text-slate-500 mt-1">Code sent to {form.email}</p>
            </>
          )}
        </div>

        {banner && (
          <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
            banner.type === 'success'
              ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300'
          }`}>
            {banner.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              : <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{banner.msg}</span>
          </div>
        )}

        {step === 1 ? (
          <>
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

            <Button type="submit" loading={loading} className="w-full">
              {loading ? 'Sending code…' : 'Send verification code'}
            </Button>

            <div className="text-center text-xs text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="text-brand-600 hover:underline">Sign in</Link>
            </div>
          </>
        ) : (
          <>
            <Input
              label="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
            />

            <Button type="submit" loading={loading} className="w-full">
              {loading ? 'Verifying…' : 'Verify email'}
            </Button>

            <div className="text-center text-xs text-slate-500">
              Didn't get it?{' '}
              <button
                type="button"
                onClick={resend}
                disabled={resending}
                className="text-brand-600 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
                Resend code
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
""".strip())


def gen_login_block():
    banner("Login.jsx — handle unverified")

    # Optional: catch "unverified" on login and redirect to /register step 2
    p = FE / "src/pages/Login.jsx"
    if not p.exists():
        print("  ! Login.jsx missing — skipping")
        return

    text = p.read_text()
    if "status === 'unverified'" in text:
        print("  · Login.jsx already handled")
        return

    old = """    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };"""
    new = """    } catch (err) {
      // if backend says email unverified, push user to /register to enter code
      if (/verify your email/i.test(err.message || '')) {
        toast.error('Please verify your email — check your inbox');
        setTimeout(() => nav('/register'), 800);
      } else {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };"""
    text = text.replace(old, new, 1)
    p.write_text(text)
    print("  ✓ patched Login.jsx")


def main():
    print(f"Updating frontend register flow in {FE}")
    gen_api()
    gen_register()
    gen_login_block()
    print("\n" + "═" * 66)
    print("✅ Frontend updated.")
    print("═" * 66)


if __name__ == "__main__":
    main()
