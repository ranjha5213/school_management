const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const AVATARS_DIR = path.join(UPLOAD_ROOT, 'avatars');
const DOCUMENTS_DIR = path.join(UPLOAD_ROOT, 'documents');

// Ensure directories exist
[UPLOAD_ROOT, AVATARS_DIR, DOCUMENTS_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// 1. Multer instance for Documents (enables `upload.single('file')`)
const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOCUMENTS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    const uid = req.user?.id || 'anon';
    const ts = Date.now();
    cb(null, `doc-${uid}-${ts}${ext}`);
  },
});

const docFileFilter = (_req, file, cb) => {
  const ok = /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.mimetype);
  cb(ok ? null : new Error('Only PDF and image files allowed'), ok);
};

const upload = multer({
  storage: docStorage,
  fileFilter: docFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// 2. Avatar upload configuration (preserved for existing routes)
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const uid = req.user?.id || 'anon';
    const ts = Date.now();
    cb(null, `u${uid}-${ts}${safeExt}`);
  },
});

const avatarFileFilter = (_req, file, cb) => {
  const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
  cb(ok ? null : new Error('Only image files (jpg, png, webp, gif) allowed'), ok);
};

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
}).single('avatar');

// Attach avatar properties to the multer instance export for full backward compatibility
upload.avatarUpload = avatarUpload;
upload.AVATARS_DIR = AVATARS_DIR;

module.exports = upload;

