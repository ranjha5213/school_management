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
