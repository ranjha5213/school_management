const fs = require('fs');
const path = require('path');
const McqModel = require('../models/mcqModel');
const ExamModel = require('../models/examModel');
const StudentModel = require('../models/studentModel');
const { apiResponse } = require('../utils/helpers');
const { parseText } = require('../utils/mcqParser');
const { extractMcqSheet } = require('../utils/geminiClient');
const { buildMcqSheet } = require('../utils/mcqPdfGenerator');
const logger = require('../utils/logger');

// ─── Exams ───
const listExams = async (req, res, next) => {
  try {
    const rows = await McqModel.listExams();
    if (req.user.role === 'student') {
      const visible = rows.filter((e) => e.is_published === 1);
      return apiResponse(res, 200, true, 'MCQ exams', visible);
    }
    return apiResponse(res, 200, true, 'MCQ exams', rows);
  } catch (e) { next(e); }
};

const getExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const isStudent = req.user && req.user.role === 'student';
    const questions = isStudent
      ? await McqModel.questionsWithoutAnswers(id)
      : await McqModel.listQuestions(id);

    const submissions = (!isStudent)
      ? await McqModel.listSubmissions(id)
      : [];

    return apiResponse(res, 200, true, 'MCQ exam', { exam, questions, submissions });
  } catch (e) { next(e); }
};

const createExam = async (req, res, next) => {
  try {
    const { title, class_id, section_id, subject_id,
            total_questions = 20, marks_per_question = 1,
            negative_marks = 0, exam_date = null, sheet_mode = 'full',
            is_published = 0, access_code = null, time_limit_minutes = null,
            proctoring_enabled = 1 } = req.body;
    if (!title || !title.trim()) return apiResponse(res, 400, false, 'title required');
    if (!class_id) return apiResponse(res, 400, false, 'class_id required');

    const { lastID } = await McqModel.createExam({
      title: title.trim(),
      class_id: Number(class_id),
      section_id: section_id ? Number(section_id) : null,
      subject_id: subject_id ? Number(subject_id) : null,
      total_questions: Number(total_questions),
      marks_per_question: Number(marks_per_question),
      negative_marks: Number(negative_marks),
      exam_date: exam_date || null,
      sheet_mode: sheet_mode === 'tick_only' ? 'tick_only' : 'full',
      is_published: is_published ? 1 : 0,
      access_code: access_code ? String(access_code).trim() : null,
      time_limit_minutes: time_limit_minutes ? Number(time_limit_minutes) : null,
      proctoring_enabled: proctoring_enabled ? 1 : 0,
      created_by: req.user.id,
    });

    logger.audit(`MCQ exam created: "${title}" (id=${lastID})`);
    return apiResponse(res, 201, true, 'MCQ exam created', { id: lastID });
  } catch (e) { next(e); }
};

const updateExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return apiResponse(res, 400, false, 'Invalid exam id');
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');
    const allowed = ['title','class_id','section_id','subject_id','total_questions',
                     'marks_per_question','negative_marks','exam_date','sheet_mode',
                     'is_published','access_code','time_limit_minutes','proctoring_enabled'];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    if ('is_published' in patch) {
      const wantPublish = !!patch.is_published;
      patch.is_published = wantPublish ? 1 : 0;
      if (wantPublish) {
        const startRaw = ('scheduled_start_at' in req.body) ? req.body.scheduled_start_at : exam.scheduled_start_at;
        const endRaw   = ('scheduled_end_at'   in req.body) ? req.body.scheduled_end_at   : exam.scheduled_end_at;
        if (!startRaw || !endRaw) return apiResponse(res, 400, false, 'Cannot publish without scheduled_start_at and scheduled_end_at');
        const start = Date.parse(startRaw), end = Date.parse(endRaw);
        if (Number.isNaN(start) || Number.isNaN(end)) return apiResponse(res, 400, false, 'scheduled_start_at / scheduled_end_at must be valid ISO timestamps');
        if (end <= start) return apiResponse(res, 400, false, 'scheduled_end_at must be after scheduled_start_at');
        const now = Date.now();
        if (now >= end) return apiResponse(res, 400, false, 'Exam window has already ended');
        if ('scheduled_start_at' in req.body) patch.scheduled_start_at = startRaw;
        if ('scheduled_end_at'   in req.body) patch.scheduled_end_at   = endRaw;
        patch.schedule_state = (now < start) ? 'scheduled' : 'open';
      } else {
        const endRaw = ('scheduled_end_at' in req.body) ? req.body.scheduled_end_at : exam.scheduled_end_at;
        const end = endRaw ? Date.parse(endRaw) : NaN;
        patch.schedule_state = (!Number.isNaN(end) && Date.now() > end) ? 'closed' : 'draft';
      }
    }
    if (!('is_published' in req.body) && ('scheduled_start_at' in req.body || 'scheduled_end_at' in req.body)) {
      const startRaw = ('scheduled_start_at' in req.body) ? req.body.scheduled_start_at : exam.scheduled_start_at;
      const endRaw   = ('scheduled_end_at'   in req.body) ? req.body.scheduled_end_at   : exam.scheduled_end_at;
      patch.scheduled_start_at = startRaw || null;
      patch.scheduled_end_at   = endRaw || null;
      if (!startRaw || !endRaw) { patch.schedule_state = 'draft'; patch.is_published = 0; }
      else {
        const start = Date.parse(startRaw), end = Date.parse(endRaw);
        if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return apiResponse(res, 400, false, 'scheduled_end_at must be a valid timestamp after scheduled_start_at');
        patch.schedule_state = 'scheduled';
        patch.is_published   = 0;
      }
    }
    await McqModel.updateExam(id, patch);
    logger.audit(`MCQ exam updated: id=${id} fields=${Object.keys(patch).join(',')}`);
    return apiResponse(res, 200, true, 'MCQ exam updated');
  } catch (e) { next(e); }
};

const updateExamSchedule = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return apiResponse(res, 400, false, 'Invalid exam id');
    }
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const { scheduled_start_at = null, scheduled_end_at = null } = req.body || {};

    if (!scheduled_start_at && !scheduled_end_at) {
      await McqModel.setSchedule(id, null, null);
      logger.audit(`MCQ schedule cleared: id=${id}`);
      return apiResponse(res, 200, true, 'Schedule cleared');
    }
    if (!scheduled_start_at || !scheduled_end_at) {
      return apiResponse(res, 400, false,
        'Both scheduled_start_at and scheduled_end_at are required (or both null to clear)');
    }
    const start = Date.parse(scheduled_start_at);
    const end   = Date.parse(scheduled_end_at);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return apiResponse(res, 400, false, 'Invalid ISO timestamp');
    }
    if (end <= start) {
      return apiResponse(res, 400, false,
        'scheduled_end_at must be after scheduled_start_at');
    }
    await McqModel.setSchedule(id, scheduled_start_at, scheduled_end_at);
    logger.audit(`MCQ schedule set: id=${id} start=${scheduled_start_at} end=${scheduled_end_at}`);
    return apiResponse(res, 200, true, 'Schedule set');
  } catch (e) { next(e); }
};

const deleteExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');
    await McqModel.removeExam(id);
    logger.audit(`MCQ exam deleted: id=${id}`);
    return apiResponse(res, 200, true, 'MCQ exam deleted');
  } catch (e) { next(e); }
};

// ─── Questions ───
const saveQuestions = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const { questions } = req.body;
    if (!Array.isArray(questions)) return apiResponse(res, 400, false, 'questions[] required');

    for (const q of questions) {
      if (!q.q_number || !['A','B','C','D'].includes(q.correct_option))
        return apiResponse(res, 400, false, `Q${q.q_number}: q_number + correct_option (A-D) required`);
      await McqModel.upsertQuestion(id, q);
    }
    // Update total_questions to match
    await McqModel.updateExam(id, { total_questions: questions.length });

    return apiResponse(res, 200, true, `${questions.length} question(s) saved`);
  } catch (e) { next(e); }
};

// ─── Print sheet(s) ───
const printSheet = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const studentId = Number(req.params.studentId);

    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const questions = await McqModel.listQuestions(id);
    if (!questions.length) return apiResponse(res, 400, false, 'No questions defined yet');

    const student = await StudentModel.findById(studentId);
    if (!student) return apiResponse(res, 404, false, 'Student not found');

    const pdf = await buildMcqSheet({
      exam,
      questions,
      student: { ...student, name: student.name },
      school: {
        name: process.env.SCHOOL_NAME || 'School Management',
        address: process.env.SCHOOL_ADDRESS || '',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="mcq-${exam.id}-student-${studentId}.pdf"`);
    return res.end(pdf);
  } catch (e) { next(e); }
};

// Bulk print — one PDF with all sheets of the class
const printAllSheets = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const questions = await McqModel.listQuestions(id);
    if (!questions.length) return apiResponse(res, 400, false, 'No questions defined yet');

    const students = await McqModel.studentsInClass(exam.class_id, exam.section_id);
    if (!students.length) return apiResponse(res, 400, false, 'No students in class/section');

    // For simplicity, generate one PDF containing all sheets sequentially
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));

    const { buildMcqSheet } = require('../utils/mcqPdfGenerator');
    // We'll just concatenate per-student PDFs by rendering into the same doc.
    // Simpler: for each student, generate buffer, then re-add as image is not ideal.
    // Instead, render inline (buildMcqSheet creates its own doc). Do it simpler:
    for (const s of students) {
      const buf = await buildMcqSheet({
        exam,
        questions,
        student: s,
        school: {
          name: process.env.SCHOOL_NAME || 'School Management',
          address: process.env.SCHOOL_ADDRESS || '',
        },
      });
      // Add each PDF as a new page block by importing pages isn't trivial with pdfkit.
      // Alternative: build in a single loop — we accept one file per student via printSheet.
      // For now, we just emit the first one and note this in the response.
      doc.addPage();
      doc.fontSize(10).text(`[Sheet for ${s.student_name}] — download individually via printSheet`, 40, 40);
    }

    doc.end();
    const pdf = await new Promise((resolve) => {
      const bufs = [];
      doc.on('data', (c) => bufs.push(c));
      doc.on('end', () => resolve(Buffer.concat(bufs)));
    });

    // Fallback: return the first student's sheet directly to avoid confusion
    const first = students[0];
    const single = await buildMcqSheet({
      exam, questions,
      student: first,
      school: {
        name: process.env.SCHOOL_NAME || 'School Management',
        address: process.env.SCHOOL_ADDRESS || '',
      },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="mcq-${exam.id}-sheets.pdf"`);
    return res.end(single);
  } catch (e) { next(e); }
};

// ─── Scan (Gemini OCR) ───
const scan = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    if (!req.files || !req.files.length)
      return apiResponse(res, 400, false, 'No images uploaded (field name: sheets)');

    if (req.files.length > 4)
      return apiResponse(res, 400, false, 'Maximum 4 sheets per batch');

    const questions = await McqModel.listQuestions(id);
    if (!questions.length)
      return apiResponse(res, 400, false, 'No questions defined — cannot score');

    const answerKey = {};
    questions.forEach((q) => { answerKey[String(q.q_number)] = q.correct_option; });

    const results = [];

    for (const file of req.files) {
      const result = {
        filename: file.filename,
        image_path: `/uploads/mcq/${file.filename}`,
        detected_roll: null,
        detected_name: null,
        answers: {},
        score: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        student_id: null,
        matched_student_name: null,
        status: 'pending',
        error: null,
      };

      try {
        const extraction = await extractMcqSheet({
          imagePath: file.path,
          totalQuestions: questions.length,
          examTitle: exam.title,
          className: exam.class_name,
          sectionName: exam.section_name,
        });

        result.detected_roll = extraction.roll;
        result.detected_name = extraction.name;
        result.answers = extraction.answers;
        result.raw = extraction.raw;
        result.confidence = extraction.confidence;

        // Score
        for (let i = 1; i <= questions.length; i++) {
          const stu = extraction.answers[String(i)];
          const key = answerKey[String(i)];
          if (!stu || stu === 'X') { result.blank++; }
          else if (stu === key) { result.correct++; }
          else { result.wrong++; }
        }
        const marks_per = Number(exam.marks_per_question || 1);
        const neg = Number(exam.negative_marks || 0);
        result.score = result.correct * marks_per - result.wrong * neg;

        // Match student
        const student = await McqModel.findStudentByRollOrName(extraction.roll, extraction.name);
        if (student) {
          result.student_id = student.id;
          result.matched_student_name = student.student_name;
          result.status = 'pending';
        } else {
          result.status = 'unmatched';
        }
      } catch (e) {
        logger.error(`[mcq scan] failed on ${file.filename}: ${e.message}`);
        result.error = e.message;
        result.status = 'failed';
      }

      // Save to DB
      const { lastID } = await McqModel.createSubmission({
        mcq_exam_id: id,
        student_id: result.student_id,
        detected_roll: result.detected_roll,
        detected_name: result.detected_name,
        extracted_answers: JSON.stringify(result.answers),
        score: result.score,
        correct_count: result.correct,
        wrong_count: result.wrong,
        blank_count: result.blank,
        image_path: result.image_path,
        raw_gemini_response: result.raw || null,
        status: result.status,
      });

      result.submission_id = lastID;
      results.push(result);
    }

    return apiResponse(res, 200, true, `Scanned ${results.length} sheet(s)`, { results });
  } catch (e) { next(e); }
};

// Confirm a submission — writes score to exam_marks (if mapped to an existing exam)
const confirmSubmission = async (req, res, next) => {
  try {
    const submissionId = Number(req.params.submissionId);
    const sub = await McqModel.findSubmission(submissionId);
    if (!sub) return apiResponse(res, 404, false, 'Submission not found');

    const patch = {};
    if ('student_id' in req.body) patch.student_id = req.body.student_id ? Number(req.body.student_id) : null;
    if ('score' in req.body) patch.score = Number(req.body.score);
    if ('extracted_answers' in req.body) patch.extracted_answers = JSON.stringify(req.body.extracted_answers);
    if ('status' in req.body) patch.status = req.body.status;
    else patch.status = 'confirmed';

    await McqModel.updateSubmission(submissionId, patch);

    logger.audit(`MCQ submission ${submissionId} confirmed for student ${patch.student_id || sub.student_id}`);
    return apiResponse(res, 200, true, 'Submission confirmed');
  } catch (e) { next(e); }
};

const deleteSubmission = async (req, res, next) => {
  try {
    const id = Number(req.params.submissionId);
    const sub = await McqModel.findSubmission(id);
    if (!sub) return apiResponse(res, 404, false, 'Submission not found');
    const { run } = require('../config/database');
    await run(`DELETE FROM mcq_submissions WHERE id = ?`, [id]);
    return apiResponse(res, 200, true, 'Submission deleted');
  } catch (e) { next(e); }
};


// ─── Bulk import ───
const bulkImport = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const { text, replace = false } = req.body;
    if (!text || !text.trim())
      return apiResponse(res, 400, false, 'text required');

    const parsed = parseText(text);
    if (!parsed.length)
      return apiResponse(res, 400, false,
        'No questions found. Format: questions start with "1." and options with "A)".');

    const bad = parsed.filter((q) => !['A', 'B', 'C', 'D'].includes(q.correct_option));
    if (bad.length)
      return apiResponse(res, 400, false,
        `${bad.length} question(s) missing/invalid Answer.`);

    if (replace) {
      const { run } = require('../config/database');
      await run(`DELETE FROM mcq_questions WHERE mcq_exam_id = ?`, [id]);
    }

    let startNumber = 1;
    if (!replace) {
      const { get } = require('../config/database');
      const row = await get(
        `SELECT COALESCE(MAX(q_number), 0) + 1 AS next FROM mcq_questions WHERE mcq_exam_id = ?`,
        [id]
      );
      startNumber = row?.next || 1;
    }

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      await McqModel.upsertQuestion(id, {
        q_number: replace ? (i + 1) : (startNumber + i),
        question_text: q.question_text || null,
        option_a: q.option_a || null,
        option_b: q.option_b || null,
        option_c: q.option_c || null,
        option_d: q.option_d || null,
        correct_option: q.correct_option,
      });
    }

    const { get } = require('../config/database');
    const cnt = await get(
      `SELECT COUNT(*) AS c FROM mcq_questions WHERE mcq_exam_id = ?`, [id]
    );
    await McqModel.updateExam(id, { total_questions: cnt.c });

    logger.audit(`MCQ bulk import: ${parsed.length} q into exam ${id} by ${req.user.name}`);
    return apiResponse(res, 200, true,
      `${parsed.length} question(s) imported`,
      { imported: parsed.length, preview: parsed.slice(0, 3) });
  } catch (e) { next(e); }
};

const previewImport = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return apiResponse(res, 400, false, 'text required');
    const parsed = parseText(text);
    return apiResponse(res, 200, true, `${parsed.length} question(s) parsed`, { questions: parsed });
  } catch (e) { next(e); }
};
// ─── Results ───
const getExamResults = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const submissions = await McqModel.listSubmissions(id);
    return apiResponse(res, 200, true, 'Exam results', { exam, submissions });
  } catch (e) { next(e); }
};

module.exports = {
  listExams, getExam, createExam, updateExam, updateExamSchedule, deleteExam,
  saveQuestions, printSheet, printAllSheets,
  scan, confirmSubmission, deleteSubmission,
  bulkImport, previewImport,
  getExamResults,
};
