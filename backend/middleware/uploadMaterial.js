const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const MATERIALS_DIR = path.join(UPLOAD_ROOT, 'materials');
if (!fs.existsSync(MATERIALS_DIR)) fs.mkdirSync(MATERIALS_DIR, { recursive: true });

const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/mp4', 'audio/webm',
  'video/mp4', 'video/webm',
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MATERIALS_DIR),
  filename: (req, file, cb) => {
    const raw = path.extname(file.originalname).toLowerCase();
    const safe = /^[a-z0-9.]{2,8}$/.test(raw) ? raw : '';
    const uid = req.user?.id || 'anon';
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    cb(null, `u${uid}-${ts}-${rand}${safe}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ok = ALLOWED_MIME.includes(file.mimetype);
  cb(ok ? null : new Error(`File type ${file.mimetype} not allowed`), ok);
};

const materialUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },  // 20 MB
}).single('file');

module.exports = { materialUpload, MATERIALS_DIR };
