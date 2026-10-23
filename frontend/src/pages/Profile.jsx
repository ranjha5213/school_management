import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  User, Lock, Mail, Shield, CheckCircle2, AlertCircle,
  Upload, Trash2, Camera,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi, userApi } from '../api/endpoints';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import PasswordInput from '../components/PasswordInput';
import Button from '../components/Button';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  // avatar state
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const reset = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirm('');
  };

  const validate = () => {
    if (!oldPassword) return 'Enter your current password';
    if (newPassword.length < 6) return 'New password must be at least 6 characters';
    if (newPassword !== confirm) return 'New passwords do not match';
    if (oldPassword === newPassword) return 'New password must be different from current';
    return null;
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setStatus(null);

    const err = validate();
    if (err) {
      setStatus({ type: 'error', msg: err });
      toast.error(err);
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      const msg = 'Password changed successfully. Use the new password next time you sign in.';
      setStatus({ type: 'success', msg });
      toast.success('Password updated');
      reset();
    } catch (e2) {
      const msg = e2.message || 'Could not change password';
      setStatus({ type: 'error', msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast.error('Choose an image file');
    if (file.size > 3 * 1024 * 1024) return toast.error('Max 3 MB');

    setUploading(true);
    try {
      const res = await userApi.uploadAvatar(file);
      await refreshUser();
      toast.success('Photo updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    if (!confirm && !window.confirm('Remove your profile photo?')) return;
    try {
      await userApi.removeAvatar();
      await refreshUser();
      toast.success('Photo removed');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-2xl">
      {/* ═══ Avatar + identity ═══ */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-brand-600" /> My Profile
        </h3>

        <div className="flex items-start gap-5 flex-wrap">
          <div className="relative">
            <Avatar src={user?.avatar_url} name={user?.name} size={96} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 p-2 rounded-full bg-brand-600 text-white shadow-lg
                         hover:bg-brand-700 transition disabled:opacity-60"
              title="Upload photo"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          <div className="space-y-1.5 flex-1 min-w-[180px]">
            <div className="font-medium text-lg">{user?.name}</div>
            <div className="text-sm text-slate-500 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> {user?.email}
            </div>
            <div className="text-sm text-slate-500 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" /> {user?.role}
            </div>

            <div className="pt-2 flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="secondary"
                icon={Upload}
                onClick={() => fileRef.current?.click()}
                loading={uploading}
              >
                {user?.avatar_url ? 'Change photo' : 'Upload photo'}
              </Button>
              {user?.avatar_url && (
                <Button size="sm" variant="ghost" icon={Trash2} onClick={removeAvatar}>
                  Remove
                </Button>
              )}
            </div>

            <p className="text-xs text-slate-400 pt-1">
              JPG, PNG, WEBP or GIF. Max 3 MB.
            </p>
          </div>
        </div>
      </Card>

      {/* ═══ Change password ═══ */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand-600" /> Change Password
        </h3>

        {status && (
          <div
            className={`mb-4 flex items-start gap-2 p-3 rounded-lg text-sm ${
              status.type === 'success'
                ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300'
            }`}
          >
            {status.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{status.msg}</span>
          </div>
        )}

        <form onSubmit={changePassword} className="space-y-3 max-w-md">
          <PasswordInput
            label="Current password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
          <PasswordInput
            label="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <PasswordInput
            label="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          <div className="pt-1">
            <Button type="submit" loading={loading} disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
