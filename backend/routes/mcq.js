const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const c = require('../controllers/mcqController');
const att = require('../controllers/mcqAttemptController');
const { authenticate, authorize } = require('../middleware/auth');

const MCQ_DIR = path.join(__dirname, '..', 'uploads', 'mcq');
if (!fs.existsSync(MCQ_DIR)) fs.mkdirSync(MCQ_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, MCQ_DIR),
    filename: (_r, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, `mcq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => {
    const ok = /^image\//.test(file.mimetype);
    cb(ok ? null : new Error('Only images'), ok);
  },
});

const router = express.Router();
router.use(authenticate);

// ─── In-app attempts (registered BEFORE /:id to avoid capture) ───
router.get('/my-attempts', authorize('student'), att.myAttempts);
router.post('/:id/attempt/start', authorize('student'), att.startAttempt);
router.get('/attempts/:attemptId',
  authorize('student', 'admin', 'teacher'), att.getAttemptDetail);
router.post('/attempts/:attemptId/proctor', 
  authorize('student', 'admin', 'teacher'), 
  att.logProctorEvent);
router.post('/attempts/:attemptId/snapshot', 
  authorize('student'), 
  att.uploadSnapshot);
router.post('/attempts/:attemptId/recording', 
  authorize('student', 'admin', 'teacher'), 
  att.recUploadMiddleware, 
  att.uploadRecordingChunk);
router.get('/attempts/:attemptId/recordings',
  authorize('admin', 'teacher', 'student'), att.listRecordings);
router.post('/attempts/:attemptId/submit', 
  authorize('student', 'admin', 'teacher'), 
  att.submitAttempt);
router.post('/attempts/:attemptId/review', 
  authorize('admin', 'teacher'), 
  att.reviewAttempt);

// ─── Exams CRUD ───
router.get('/',    authorize('admin', 'teacher', 'student'), c.listExams);
router.post('/',   authorize('admin', 'teacher'), c.createExam);
router.get('/:id', authorize('admin', 'teacher', 'student'), c.getExam);
router.patch('/:id', authorize('admin', 'teacher'), c.updateExam);
router.delete('/:id', authorize('admin'), c.deleteExam);

// ─── Questions ───
router.post('/:id/questions', authorize('admin', 'teacher'), c.saveQuestions);
router.get('/:id/print/:studentId', authorize('admin', 'teacher'), c.printSheet);
router.get('/:id/print-all', authorize('admin', 'teacher'), c.printAllSheets);

// ─── Bulk import ───
router.post('/:id/import/preview', authorize('admin', 'teacher'), c.previewImport);
router.post('/:id/import', authorize('admin', 'teacher'), c.bulkImport);

// ─── Scan (Gemini OCR) ───
router.post('/:id/scan', authorize('admin', 'teacher'),
  upload.array('sheets', 4), c.scan);
router.post('/submissions/:submissionId/confirm', 
  authorize('admin', 'teacher'), 
  c.confirmSubmission);
router.delete('/submissions/:submissionId', 
  authorize('admin'), 
  c.deleteSubmission);

// ─── Teacher/admin: attempts per exam ───
router.get('/:id/attempts', authorize('admin', 'teacher'), att.listExamAttempts);

// Teacher: schedule / unschedule
router.patch('/:id/schedule',
  authenticate, authorize('admin', 'teacher'),
  c.updateExamSchedule);

// Teacher: full results + proctoring flags
router.get('/:id/results',
  authenticate, authorize('admin', 'teacher'),
  c.getExamResults);

module.exports = router;

