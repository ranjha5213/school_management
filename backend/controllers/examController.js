const ExamModel = require('../models/examModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const realtime = require('../realtime/socket');

// ─── Exam types ───
const listTypes = async (_req, res, next) => {
  try { return apiResponse(res, 200, true, 'Exam types', await ExamModel.listTypes()); }
  catch (e) { next(e); }
};

const createType = async (req, res, next) => {
  try {
    const { type_name, weightage = null } = req.body;
    if (!type_name || !type_name.trim())
      return apiResponse(res, 400, false, 'type_name required');
    const { lastID } = await ExamModel.createType({
      type_name: type_name.trim(), weightage,
    });
    return apiResponse(res, 201, true, 'Exam type created', { id: lastID });
  } catch (e) { next(e); }
};

// ─── Exams ───
const listExams = async (req, res, next) => {
  try {
    const rows = await ExamModel.list({
      class_id: req.query.class_id ? Number(req.query.class_id) : undefined,
    });
    return apiResponse(res, 200, true, 'Exams', rows);
  } catch (e) { next(e); }
};

const getExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await ExamModel.findById(id);
    if (!exam) return apiResponse(res, 404, false, 'Exam not found');

    const [marks, students, subjects, summary] = await Promise.all([
      ExamModel.marksForExam(id),
      exam.class_id ? ExamModel.studentsForClass(exam.class_id) : [],
      exam.class_id ? ExamModel.subjectsForClass(exam.class_id) : [],
      ExamModel.summary(id),
    ]);

    return apiResponse(res, 200, true, 'Exam', {
      exam, marks, students, subjects, summary,
    });
  } catch (e) { next(e); }
};

const createExam = async (req, res, next) => {
  try {
    const { exam_name } = req.body;
    if (!exam_name || !exam_name.trim())
      return apiResponse(res, 400, false, 'exam_name required');

    const { lastID } = await ExamModel.create({
      exam_name: exam_name.trim(),
      exam_type_id: req.body.exam_type_id || null,
      class_id: req.body.class_id || null,
      start_date: req.body.start_date || null,
      end_date: req.body.end_date || null,
      total_marks: req.body.total_marks || null,
      passing_marks: req.body.passing_marks || null,
    });

    logger.audit(`Exam created: ${exam_name} (id=${lastID})`);
    return apiResponse(res, 201, true, 'Exam created', { id: lastID });
  } catch (e) { next(e); }
};

const updateExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await ExamModel.findById(id);
    if (!existing) return apiResponse(res, 404, false, 'Exam not found');

    const allowed = ['exam_name', 'exam_type_id', 'class_id',
                     'start_date', 'end_date', 'total_marks', 'passing_marks', 'is_active'];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];

    await ExamModel.update(id, patch);
    logger.audit(`Exam updated: id=${id}`);
    return apiResponse(res, 200, true, 'Exam updated');
  } catch (e) { next(e); }
};

const deleteExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await ExamModel.findById(id);
    if (!exam) return apiResponse(res, 404, false, 'Exam not found');

    await ExamModel.remove(id);
    logger.audit(`Exam deleted: ${exam.exam_name} (id=${id})`);
    return apiResponse(res, 200, true, 'Exam deleted');
  } catch (e) { next(e); }
};

// ─── Marks ───
const saveMarks = async (req, res, next) => {
  try {
    const { exam_id, marks } = req.body;
    if (!exam_id) return apiResponse(res, 400, false, 'exam_id required');
    if (!Array.isArray(marks) || !marks.length)
      return apiResponse(res, 400, false, 'marks[] required');

    const exam = await ExamModel.findById(exam_id);
    if (!exam) return apiResponse(res, 404, false, 'Exam not found');

    const bad = marks.find((m) =>
      !m.student_id || !m.subject_id ||
      m.marks_obtained === undefined || m.total_marks === undefined
    );
    if (bad) return apiResponse(res, 400, false,
      'Each mark needs student_id, subject_id, marks_obtained, total_marks');

    const over = marks.find((m) => Number(m.marks_obtained) > Number(m.total_marks));
    if (over) return apiResponse(res, 400, false,
      `Marks cannot exceed total (student ${over.student_id})`);

    for (const m of marks) {
      await ExamModel.upsertMark({
        exam_id,
        student_id: m.student_id,
        subject_id: m.subject_id,
        marks_obtained: Number(m.marks_obtained),
        total_marks: Number(m.total_marks),
        remarks: m.remarks || null,
        entered_by: req.user.id,
      });
    }

    // ─── Notify each affected student ───
    try {
      const { get } = require('../config/database');
      const studentIds = [...new Set(marks.map((m) => m.student_id))];
      for (const sid of studentIds) {
        const st = await get(`SELECT user_id FROM students WHERE id = ?`, [sid]);
        if (st?.user_id) {
          realtime.emitToUser(st.user_id, 'exam:marks-posted', {
            exam_id,
            exam_name: exam.exam_name,
            at: new Date().toISOString(),
          });
        }
      }
    } catch {}

    logger.audit(`Marks saved: exam ${exam_id}, ${marks.length} entries by ${req.user.name}`);
    return apiResponse(res, 200, true, `${marks.length} mark(s) saved`);
  } catch (e) { next(e); }
};

const deleteMark = async (req, res, next) => {
  try {
    await ExamModel.removeMark(Number(req.params.markId));
    return apiResponse(res, 200, true, 'Mark deleted');
  } catch (e) { next(e); }
};

const getStudentMarks = async (req, res, next) => {
  try {
    const rows = await ExamModel.marksForStudent(Number(req.params.studentId));
    return apiResponse(res, 200, true, 'Student marks', rows);
  } catch (e) { next(e); }
};

module.exports = {
  listTypes, createType,
  listExams, getExam, createExam, updateExam, deleteExam,
  saveMarks, deleteMark, getStudentMarks,
};
