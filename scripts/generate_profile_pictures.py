#!/usr/bin/env python3
"""
Profile pictures:
  Backend: POST /api/users/avatar (multipart upload), DELETE /api/users/avatar
           Static serving from /uploads/avatars
  Frontend: Avatar component, upload UI on Profile page, updated Topbar

Run from ~/school:  python scripts/generate_profile_pictures.py
"""
import sys
import json
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

def add_deps():
    banner("package.json")
    p = BE / "package.json"
    pkg = json.loads(p.read_text())
    deps = pkg.setdefault("dependencies", {})
    deps.setdefault("multer", "^1.4.5-lts.1")
    p.write_text(json.dumps(pkg, indent=2) + "\n")
    print("  ✓ multer ensured in package.json")


def gen_upload_middleware():
    banner("middleware/upload.js")

    write(BE, "middleware/upload.js", r"""
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const AVATARS_DIR = path.join(UPLOAD_ROOT, 'avatars');

// Ensure directories exist
[UPLOAD_ROOT, AVATARS_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const uid = req.user?.id || 'anon';
    const ts = Date.now();
    cb(null, `u${uid}-${ts}${safeExt}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
  cb(ok ? null : new Error('Only image files (jpg, png, webp, gif) allowed'), ok);
};

const avatarUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
}).single('avatar');

module.exports = { avatarUpload, AVATARS_DIR };
""".strip())


def gen_user_controller():
    banner("controllers/userController.js")

    write(BE, "controllers/userController.js", r"""
const fs = require('fs');
const path = require('path');
const UserModel = require('../models/userModel');
const { apiResponse } = require('../utils/helpers');
const { AVATARS_DIR } = require('../middleware/upload');
const logger = require('../utils/logger');

// POST /api/users/avatar
const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) return apiResponse(res, 400, false, 'No file uploaded');

    const user = await UserModel.findById(req.user.id);
    if (!user) return apiResponse(res, 404, false, 'User not found');

    const url = `/uploads/avatars/${req.file.filename}`;

    // delete previous avatar if it was stored on disk and belongs to this user
    if (user.avatar_url && user.avatar_url.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(AVATARS_DIR, path.basename(user.avatar_url));
      try { fs.unlinkSync(oldPath); } catch {}
    }

    await UserModel.update(user.id, { avatar_url: url });
    logger.audit(`Avatar uploaded for ${user.email}`);

    return apiResponse(res, 200, true, 'Avatar updated', { avatar_url: url });
  } catch (e) { next(e); }
};

// DELETE /api/users/avatar
const removeAvatar = async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) return apiResponse(res, 404, false, 'User not found');

    if (user.avatar_url && user.avatar_url.startsWith('/uploads/avatars/')) {
      const p = path.join(AVATARS_DIR, path.basename(user.avatar_url));
      try { fs.unlinkSync(p); } catch {}
    }

    await UserModel.update(user.id, { avatar_url: null });
    return apiResponse(res, 200, true, 'Avatar removed');
  } catch (e) { next(e); }
};

module.exports = { uploadAvatar, removeAvatar };
""".strip())


def gen_user_routes():
    banner("routes/users.js")

    write(BE, "routes/users.js", r"""
const express = require('express');
const c = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { avatarUpload } = require('../middleware/upload');

const router = express.Router();
router.use(authenticate);

router.post('/avatar', avatarUpload, c.uploadAvatar);
router.delete('/avatar', c.removeAvatar);

module.exports = router;
""".strip())


def patch_routes_index():
    banner("routes/index.js")

    p = BE / "routes/index.js"
    if not p.exists():
        print("  ! routes/index.js missing")
        return
    src = p.read_text()
    if "'/users'" in src or '"/users"' in src:
        print("  · /users already mounted")
        return
    anchor = "router.use('/settings',     require('./settings'));"
    line = "router.use('/users',        require('./users'));"
    if anchor in src:
        src = src.replace(anchor, line + "\n" + anchor, 1)
    else:
        src += "\n" + line + "\n"
    p.write_text(src)
    print("  ✓ mounted /api/users")


def ensure_uploads_dir():
    banner("uploads/avatars")
    d = BE / "uploads/avatars"
    d.mkdir(parents=True, exist_ok=True)
    # keep the folder in git
    (d / ".gitkeep").write_text("")
    print(f"  ✓ {d.relative_to(ROOT)}")


def verify_backend():
    banner("verify backend")
    import subprocess
    ok = True
    for f in [
        BE / "middleware/upload.js",
        BE / "controllers/userController.js",
        BE / "routes/users.js",
    ]:
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


# ════════════════════════════════════════════════════════════
# FRONTEND
# ════════════════════════════════════════════════════════════

def gen_avatar_component():
    banner("Avatar component")

    write(FE, "src/components/Avatar.jsx", r"""
/**
 * Avatar — displays a profile picture or initials fallback.
 *
 * Props:
 *   src      {string}  URL (relative or absolute)
 *   name     {string}  used for initials fallback
 *   size     {number}  px, default 40
 *   className {string} additional classes
 */
export default function Avatar({ src, name = '?', size = 40, className = '' }) {
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('') || '?';

  const fontSize = Math.max(10, Math.round(size * 0.4));

  const base = `rounded-full overflow-hidden flex items-center justify-center shrink-0 ${className}`;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`${base} object-cover bg-slate-100 dark:bg-slate-800`}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize }}
      className={`${base} bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 font-bold`}
      title={name}
    >
      {initials}
    </div>
  );
}
""".strip())


def patch_endpoints():
    banner("api/endpoints.js")

    p = FE / "src/api/endpoints.js"
    if not p.exists():
        print("  ! endpoints.js missing")
        return
    src = p.read_text()

    if "uploadAvatar" in src:
        print("  · already has userApi")
        return

    block = """
export const userApi = {
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return client
      .post('/users/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data?.data ?? r.data);
  },
  removeAvatar: () =>
    client.delete('/users/avatar').then((r) => r.data?.data ?? r.data),
};
"""
    src += block
    p.write_text(src)
    print("  ✓ added userApi")


def patch_auth_context():
    banner("AuthContext — refreshUser")

    p = FE / "src/context/AuthContext.jsx"
    if not p.exists():
        print("  ! AuthContext.jsx missing")
        return
    src = p.read_text()

    if "refreshUser" in src:
        print("  · already has refreshUser")
        return

    # Add refreshUser function before logout
    src = src.replace(
        "  const logout = async () => {",
        """  const refreshUser = async () => {
    try {
      const u = await authApi.me();
      setUser(u);
      return u;
    } catch {
      return null;
    }
  };

  const logout = async () => {""",
        1,
    )

    # Expose in context value
    src = src.replace(
        "value={{ user, loading, login, logout }}",
        "value={{ user, loading, login, logout, refreshUser }}",
        1,
    )

    p.write_text(src)
    print("  ✓ AuthContext exposes refreshUser")


def patch_topbar_avatar():
    banner("Topbar shows avatar")

    p = FE / "src/components/Topbar.jsx"
    if not p.exists():
        print("  ! Topbar.jsx missing")
        return
    src = p.read_text()

    if "Avatar" in src:
        print("  · already has Avatar")
        return

    src = src.replace(
        "import NoticeBell from './NoticeBell';",
        "import NoticeBell from './NoticeBell';\nimport Avatar from './Avatar';",
        1,
    )

    # Replace the "green dot + name" block with avatar + dot + name
    old = """<div className="text-sm text-slate-600 dark:text-slate-300 hidden sm:flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-300'}`}
              title={connected ? 'Live' : 'Offline'} />
        {user?.name}
      </div>"""

    new = """<button
        onClick={() => nav('/profile')}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        title="Profile"
      >
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-300'}`}
              title={connected ? 'Live' : 'Offline'} />
        <Avatar src={user?.avatar_url} name={user?.name} size={28} />
        <span className="text-sm text-slate-600 dark:text-slate-300 hidden sm:inline">{user?.name}</span>
      </button>"""

    if old in src:
        src = src.replace(old, new, 1)
        p.write_text(src)
        print("  ✓ Topbar shows avatar + name")
    else:
        print("  ! anchor not found — Topbar unchanged")


def patch_profile_page():
    banner("Profile page — avatar uploader")

    p = FE / "src/pages/Profile.jsx"
    if not p.exists():
        print("  ! Profile.jsx missing — will create fresh")

    write(FE, "src/pages/Profile.jsx", r"""
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
""".strip())


def patch_student_detail_avatar():
    banner("StudentDetail — avatar in header")

    p = FE / "src/pages/StudentDetail.jsx"
    if not p.exists():
        print("  ! StudentDetail.jsx missing")
        return
    src = p.read_text()

    if "Avatar" in src:
        print("  · already has Avatar")
        return

    src = src.replace(
        "import Card from '../components/Card';",
        "import Card from '../components/Card';\nimport Avatar from '../components/Avatar';",
        1,
    )

    # Find the header block with the initials div
    old = """<div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-xl">
            {profile.name?.[0]?.toUpperCase()}
          </div>"""
    new = """<Avatar src={profile.avatar_url} name={profile.name} size={56} />"""

    if old in src:
        src = src.replace(old, new, 1)
        p.write_text(src)
        print("  ✓ StudentDetail uses Avatar")
    else:
        print("  ! anchor not found — Skipping")


def patch_teacher_detail_avatar():
    banner("TeacherDetail — avatar in header")

    p = FE / "src/pages/TeacherDetail.jsx"
    if not p.exists():
        print("  ! TeacherDetail.jsx missing")
        return
    src = p.read_text()

    if "Avatar" in src:
        print("  · already has Avatar")
        return

    src = src.replace(
        "import Card from '../components/Card';",
        "import Card from '../components/Card';\nimport Avatar from '../components/Avatar';",
        1,
    )

    old = """<div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold text-xl">
            {profile.name?.[0]?.toUpperCase()}
          </div>"""
    new = """<Avatar src={profile.avatar_url} name={profile.name} size={56} />"""

    if old in src:
        src = src.replace(old, new, 1)
        p.write_text(src)
        print("  ✓ TeacherDetail uses Avatar")
    else:
        print("  ! anchor not found — Skipping")


def ensure_static_uploads():
    """Server already serves /uploads in server.js. Confirm."""
    banner("server.js static /uploads")
    p = BE / "server.js"
    src = p.read_text()
    if "app.use('/uploads'" in src or 'app.use("/uploads"' in src:
        print("  · already serving /uploads")
    else:
        print("  ! /uploads static route missing — check server.js")


# ════════════════════════════════════════════════════════════

def main():
    print(f"Profile pictures — root: {ROOT}")
    add_deps()
    gen_upload_middleware()
    gen_user_controller()
    gen_user_routes()
    patch_routes_index()
    ensure_uploads_dir()

    if not verify_backend():
        sys.exit(1)

    gen_avatar_component()
    patch_endpoints()
    patch_auth_context()
    patch_topbar_avatar()
    patch_profile_page()
    patch_student_detail_avatar()
    patch_teacher_detail_avatar()
    ensure_static_uploads()

    print("\n" + "═" * 62)
    print("✅ Profile pictures added.")
    print("═" * 62)
    print("\nNext:")
    print("  cd ~/school/backend && npm install")
    print("  cd ~/school && ./start.sh")
    print("\nUI:")
    print("  /profile       → upload / remove avatar")
    print("  Topbar         → click your avatar to go to profile")
    print("  /students/:id  → avatar in header")
    print("  /teachers/:id  → avatar in header")


if __name__ == "__main__":
    main()
