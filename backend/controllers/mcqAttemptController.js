const multer = require('multer');
const McqAttemptModel = require('../models/mcqAttemptModel');
const McqModel         = require('../models/mcqModel');
const StudentModel     = require('../models/studentModel');
const { apiResponse }  = require('../utils/helpers');
const logger           = require('../utils/logger');
const fs               = require('fs');
const path             = require('path');

const PROCTOR_DIR = path.join(__dirname, '..', 'uploads', 'proctoring');
if (!fs.existsSync(PROCTOR_DIR)) fs.mkdirSync(PROCTOR_DIR, { recursive: true });

const PROCTOR_KINDS = new Set([
  'tab_hidden','tab_visible','blur','focus','fullscreen_exit','fullscreen_enter',
  'copy','paste','contextmenu','snapshot','submit',
  'face_missing','face_multiple','face_mismatch','gaze_away',
  'identity_check','identity_fail',
]);

// Recording upload (video chunk)
const recStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(PROCTOR_DIR, String(req.params.attemptId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webm`);
  },
});

const recUpload = multer({
  storage: recStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => {
    const ok = /^video\/(webm|mp4|quicktime)$/.test(file.mimetype)
            || file.mimetype === 'application/octet-stream';
    cb(ok ? null : new Error(`Video type ${file.mimetype} not allowed`), ok);
  },
}).single('chunk');

// ─── Start ───
const startAttempt = async (req, res, next) => {
  try {
    const examId = Number(req.params.id);
    const exam = await McqModel.findExam(examId);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');
    // ─── Schedule + publish-window enforcement ───
    const nowMs   = Date.now();
    const startMs = exam.scheduled_start_at ? Date.parse(exam.scheduled_start_at) : null;
    const endMs   = exam.scheduled_end_at   ? Date.parse(exam.scheduled_end_at)   : null;

    if (exam.schedule_state !== 'open') {
      if (exam.schedule_state === 'scheduled' && startMs != null && nowMs < startMs) {
        return apiResponse(res, 403, false, 'Exam is scheduled but has not started yet',
          { starts_at: exam.scheduled_start_at });
      }
      if (exam.schedule_state === 'closed' || (endMs != null && nowMs > endMs)) {
        return apiResponse(res, 403, false, 'Exam window has ended');
      }
      return apiResponse(res, 403, false, 'Exam is not available');
    }
    if (endMs != null && nowMs > endMs) {
      return apiResponse(res, 403, false, 'Exam window has ended');
    }

    const student = await StudentModel.findByUserId(req.user.id);
    if (!student) return apiResponse(res, 403, false, 'Not a student');

    if (exam.access_code) {
      const code = String(req.body.access_code || '').trim();
      if (code !== String(exam.access_code))
        return apiResponse(res, 403, false, 'Invalid access code');
    }

    const existing = await McqAttemptModel.findByExamAndStudent(examId, student.id);
    if (existing) {
      if (existing.status === 'in_progress') {
        const questions = await McqModel.questionsWithoutAnswers(examId);
        return apiResponse(res, 200, true, 'Resumed', { attempt: existing, questions });
      }
      return apiResponse(res, 409, false, 'You already attempted this exam');
    }

    const questions = await McqModel.questionsWithoutAnswers(examId);
    if (!questions.length)
      return apiResponse(res, 400, false, 'No questions defined yet');

    const time_limit_seconds = exam.time_limit_minutes
      ? exam.time_limit_minutes * 60
      : null;

    const { lastID } = await McqAttemptModel.create({
      mcq_exam_id: examId,
      student_id: student.id,
      total_questions: questions.length,
      time_limit_seconds,
    });

    const attempt = await McqAttemptModel.findById(lastID);
    logger.audit(`MCQ attempt started: exam=${examId} student=${student.id} attempt=${lastID}`);
    return apiResponse(res, 201, true, 'Attempt started', { attempt, questions });
  } catch (e) { next(e); }
};

// ─── Get my attempt ───
const getMyAttempt = async (req, res, next) => {
  try {
    const id = Number(req.params.attemptId);
    const a = await McqAttemptModel.findById(id);
    if (!a) return apiResponse(res, 404, false, 'Attempt not found');

    const student = await StudentModel.findByUserId(req.user.id);
    if (!student || student.id !== a.student_id)
      return apiResponse(res, 403, false, 'Forbidden');

    if (a.status === 'in_progress') {
      const questions = await McqModel.questionsWithoutAnswers(a.mcq_exam_id);
      return apiResponse(res, 200, true, 'Attempt', { attempt: a, questions });
    }
    return apiResponse(res, 200, true, 'Attempt', { attempt: a });
  } catch (e) { next(e); }
};

// ─── Log proctoring event ───
const logProctorEvent = async (req, res, next) => {
  try {
    const attemptId = Number(req.params.attemptId);
    const a = await McqAttemptModel.findById(attemptId);
    if (!a) return apiResponse(res, 404, false, 'Attempt not found');

    const student = await StudentModel.findByUserId(req.user.id);
    if (!student || student.id !== a.student_id)
      return apiResponse(res, 403, false, 'Forbidden');

    const { kind, payload } = req.body;
    if (!PROCTOR_KINDS.has(kind))
      return apiResponse(res, 400, false, `Unknown kind: ${kind}`);

    await McqAttemptModel.logEvent({ attempt_id: attemptId, kind, payload });
    return apiResponse(res, 200, true, 'Logged');
  } catch (e) { next(e); }
};

// ─── Webcam snapshot ───
const uploadSnapshot = async (req, res, next) => {
  try {
    const attemptId = Number(req.params.attemptId);
    const a = await McqAttemptModel.findById(attemptId);
    if (!a) return apiResponse(res, 404, false, 'Attempt not found');

    const student = await StudentModel.findByUserId(req.user.id);
    if (!student || student.id !== a.student_id)
      return apiResponse(res, 403, false, 'Forbidden');

    const { dataUrl } = req.body;
    if (!dataUrl || !/^data:image\/jpeg;base64,/.test(dataUrl))
      return apiResponse(res, 400, false, 'dataUrl (image/jpeg base64) required');

    const raw = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    const buf = Buffer.from(raw, 'base64');
    if (buf.length > 800 * 1024)
      return apiResponse(res, 400, false, 'Snapshot too large (max 800KB)');

    const dir = path.join(PROCTOR_DIR, String(attemptId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const fname = `snap-${Date.now()}.jpg`;
    fs.writeFileSync(path.join(dir, fname), buf);
    const relPath = `/uploads/proctoring/${attemptId}/${fname}`;

    await McqAttemptModel.logEvent({
      attempt_id: attemptId, kind: 'snapshot', payload: { file: relPath },
    });

    return apiResponse(res, 200, true, 'Snapshot saved', { file: relPath });
  } catch (e) { next(e); }
};

// ─── Recording chunk upload ───
const uploadRecordingChunk = async (req, res, next) => {
  try {
    const attemptId = Number(req.params.attemptId);
    const a = await McqAttemptModel.findById(attemptId);
    if (!a) return apiResponse(res, 404, false, 'Attempt not found');

    const student = await StudentModel.findByUserId(req.user.id);
    if (!student || student.id !== a.student_id)
      return apiResponse(res, 403, false, 'Forbidden');

    if (a.status !== 'in_progress')
      return apiResponse(res, 400, false, `Attempt is ${a.status}, not accepting uploads`);
    if (!req.file) return apiResponse(res, 400, false, 'chunk file required');

    const seqRow = await McqAttemptModel.nextRecordingSeq(attemptId);
    const seq = seqRow?.next_seq || 1;
    const relPath = `/uploads/proctoring/${attemptId}/${req.file.filename}`;

    await McqAttemptModel.addRecordingChunk({
      attempt_id: attemptId, seq, file_url: relPath,
      size_bytes: req.file.size, mime_type: req.file.mimetype,
    });

    await McqAttemptModel.logEvent({
      attempt_id: attemptId, kind: 'snapshot',
      payload: { recording_chunk: seq, file: relPath, size: req.file.size },
    });

    return apiResponse(res, 201, true, 'Chunk uploaded', { seq, file: relPath });
  } catch (e) { next(e); }
};

// ─── List recordings ───
const listRecordings = async (req, res, next) => {
  try {
    const attemptId = Number(req.params.attemptId);
    const a = await McqAttemptModel.findById(attemptId);
    if (!a) return apiResponse(res, 404, false, 'Attempt not found');

    const chunks = await McqAttemptModel.listRecordingChunks(attemptId);
    const sizeRow = await McqAttemptModel.totalRecordingBytes(attemptId);
    return apiResponse(res, 200, true, 'Recordings', {
      chunks, total_bytes: sizeRow?.total || 0,
    });
  } catch (e) { next(e); }
};

// ─── Submit ───
const submitAttempt = async (req, res, next) => {
  try {
    const attemptId = Number(req.params.attemptId);
    const a = await McqAttemptModel.findById(attemptId);
    if (!a) return apiResponse(res, 404, false, 'Attempt not found');
    if (a.status !== 'in_progress')
      return apiResponse(res, 400, false, `Already ${a.status}`);

    const student = await StudentModel.findByUserId(req.user.id);
    if (!student || student.id !== a.student_id)
      return apiResponse(res, 403, false, 'Forbidden');

    const { answers } = req.body;
    if (!answers || typeof answers !== 'object')
      return apiResponse(res, 400, false, 'answers object required');

    const questions = await McqModel.listQuestions(a.mcq_exam_id);
    const marks_per = Number(a.marks_per_question || 1);
    const neg       = Number(a.negative_marks || 0);

    let correct = 0, wrong = 0, blank = 0;
    for (const q of questions) {
      const given = answers[String(q.q_number)];
      if (!given || given === 'X') { blank++; continue; }
      if (given === q.correct_option) correct++;
      else wrong++;
    }
    const score = correct * marks_per - wrong * neg;

    await McqAttemptModel.submit(attemptId, {
      answers, score, correct_count: correct, wrong_count: wrong, blank_count: blank,
    });

    const flagRow = await McqAttemptModel.countFlaggedEvents(attemptId);
    const flagged_count = flagRow?.c || 0;
    await McqAttemptModel.setFlaggedCount(attemptId, flagged_count);
    if (flagged_count > 0) await McqAttemptModel.markFlagged(attemptId);

    await McqAttemptModel.logEvent({ attempt_id: attemptId, kind: 'submit' });

    logger.audit(`MCQ attempt submitted: id=${attemptId} score=${score} flags=${flagged_count}`);
    return apiResponse(res, 200, true, 'Submitted', {
      score, correct_count: correct, wrong_count: wrong, blank_count: blank,
      flagged_count,
    });
  } catch (e) { next(e); }
};

// ─── Teacher: list attempts for exam ───
const listExamAttempts = async (req, res, next) => {
  try {
    const examId = Number(req.params.id);
    const rows = await McqAttemptModel.listByExam(examId);
    const stats = await McqAttemptModel.statsForExam(examId);
    return apiResponse(res, 200, true, 'Attempts', { attempts: rows, stats });
  } catch (e) { next(e); }
};

// ─── Teacher: attempt detail ───
const getAttemptDetail = async (req, res, next) => {
  try {
    const id = Number(req.params.attemptId);
    const a = await McqAttemptModel.findById(id);
    if (!a) return apiResponse(res, 404, false, 'Attempt not found');
    const events = await McqAttemptModel.listEvents(id);
    return apiResponse(res, 200, true, 'Attempt', { attempt: a, events });
  } catch (e) { next(e); }
};

// ─── Teacher: review ───
const reviewAttempt = async (req, res, next) => {
  try {
    const id = Number(req.params.attemptId);
    const a = await McqAttemptModel.findById(id);
    if (!a) return apiResponse(res, 404, false, 'Attempt not found');

    const { note = null, status = null } = req.body;
    await McqAttemptModel.review(id, req.user.id, note, status);
    logger.audit(`MCQ attempt reviewed: id=${id} status=${status || 'unchanged'} by ${req.user.name}`);
    return apiResponse(res, 200, true, 'Reviewed');
  } catch (e) { next(e); }
};

// ─── Student: my attempts ───
const myAttempts = async (req, res, next) => {
  try {
    const student = await StudentModel.findByUserId(req.user.id);
    if (!student) return apiResponse(res, 403, false, 'Not a student');
    const rows = await McqAttemptModel.listByStudent(student.id);
    return apiResponse(res, 200, true, 'My attempts', rows);
  } catch (e) { next(e); }
};

module.exports = {
  startAttempt, getMyAttempt,
  logProctorEvent, uploadSnapshot, uploadRecordingChunk, listRecordings,
  submitAttempt,
  listExamAttempts, getAttemptDetail, reviewAttempt, myAttempts,
  recUploadMiddleware: recUpload,
};
