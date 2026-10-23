const HomeworkModel = require('../models/homeworkModel');
const TeacherModel = require('../models/teacherModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const realtime = require('../realtime/socket');
const { all } = require('../config/database');

// ─── List ───
const listHomework = async (req, res, next) => {
  try {
    const rows = await HomeworkModel.list({
      class_id:   req.query.class_id   ? Number(req.query.class_id)   : undefined,
      teacher_id: req.query.teacher_id ? Number(req.query.teacher_id) : undefined,
      subject_id: req.query.subject_id ? Number(req.query.subject_id) : undefined,
      q:          req.query.q || undefined,
    });
    return apiResponse(res, 200, true, 'Homework', rows);
  } catch (e) { next(e); }
};

// ─── Get one ───
const getHomework = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const hw = await HomeworkModel.findById(id);
    if (!hw) return apiResponse(res, 404, false, 'Homework not found');

    const [submissions, students] = await Promise.all([
      HomeworkModel.submissionsFor(id),
      hw.class_id ? HomeworkModel.studentsInClass(hw.class_id) : [],
    ]);

    // Attach submission state to each student
    const submittedBy = new Map(submissions.map((s) => [s.student_id, s]));
    const roster = students.map((st) => ({
      ...st,
      submitted: submittedBy.has(st.id),
      submission: submittedBy.get(st.id) || null,
    }));

    return apiResponse(res, 200, true, 'Homework', { homework: hw, submissions, roster });
  } catch (e) { next(e); }
};

// ─── Create ───
const createHomework = async (req, res, next) => {
  try {
    const { title, class_id, subject_id, due_date } = req.body;

    if (!title || !title.trim())
      return apiResponse(res, 400, false, 'title required');
    if (!class_id)
      return apiResponse(res, 400, false, 'class_id required');
    if (!subject_id)
      return apiResponse(res, 400, false, 'subject_id required');
    if (!due_date)
      return apiResponse(res, 400, false, 'due_date required');

    // Derive teacher_id from logged-in user
    let teacher_id = null;
    if (req.user.role === 'teacher') {
      const t = await TeacherModel.findByUserId(req.user.id);
      teacher_id = t?.id || null;
    } else if (req.user.role === 'admin' && req.body.teacher_id) {
      teacher_id = Number(req.body.teacher_id);
    }

    const { lastID } = await HomeworkModel.create({
      class_id: Number(class_id),
      subject_id: Number(subject_id),
      teacher_id,
      title: title.trim(),
      description: req.body.description || null,
      due_date,
      attachment_url: req.body.attachment_url || null,
    });

    // ─── Notify all students in the class ───
    try {
      const students = await all(
        `SELECT u.id AS user_id
         FROM students s
         JOIN users u ON s.user_id = u.id
         JOIN sections sec ON s.section_id = sec.id
         WHERE sec.class_id = ? AND u.status = 'active'`,
        [Number(class_id)]
      );
      const payload = {
        id: lastID,
        title: title.trim(),
        due_date,
        class_id: Number(class_id),
        teacher_name: req.user.name,
        at: new Date().toISOString(),
      };
      students.forEach((st) => realtime.emitToUser(st.user_id, 'homework:new', payload));
    } catch {}

    logger.audit(`Homework created: "${title}" (id=${lastID}) by ${req.user.name}`);
    return apiResponse(res, 201, true, 'Homework created', { id: lastID });
  } catch (e) { next(e); }
};

// ─── Update ───
const updateHomework = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const hw = await HomeworkModel.findById(id);
    if (!hw) return apiResponse(res, 404, false, 'Homework not found');

    // Teachers can only edit their own homework
    if (req.user.role === 'teacher') {
      const t = await TeacherModel.findByUserId(req.user.id);
      if (!t || t.id !== hw.teacher_id)
        return apiResponse(res, 403, false, 'You can only edit homework you posted');
    }

    const patch = {};
    for (const k of ['title', 'description', 'due_date', 'attachment_url',
                     'class_id', 'subject_id']) {
      if (k in req.body) patch[k] = req.body[k];
    }

    await HomeworkModel.update(id, patch, req.user.id);
    logger.audit(`Homework updated: id=${id} by ${req.user.name}`);
    return apiResponse(res, 200, true, 'Homework updated');
  } catch (e) { next(e); }
};

// ─── Delete ───
const deleteHomework = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const hw = await HomeworkModel.findById(id);
    if (!hw) return apiResponse(res, 404, false, 'Homework not found');

    // Teachers can only delete their own
    if (req.user.role === 'teacher') {
      const t = await TeacherModel.findByUserId(req.user.id);
      if (!t || t.id !== hw.teacher_id)
        return apiResponse(res, 403, false, 'You can only delete homework you posted');
    }

    await HomeworkModel.remove(id);
    logger.audit(`Homework deleted: "${hw.title}" (id=${id}) by ${req.user.name}`);
    return apiResponse(res, 200, true, 'Homework deleted');
  } catch (e) { next(e); }
};

// ─── Submit (student) ───
const submitHomework = async (req, res, next) => {
  try {
    const homeworkId = Number(req.params.id);
    const hw = await HomeworkModel.findById(homeworkId);
    if (!hw) return apiResponse(res, 404, false, 'Homework not found');

    // Student can only submit for themselves; admin/teacher can submit on behalf
    let student_id = req.body.student_id;
    if (req.user.role === 'student') {
      const { get } = require('../config/database');
      const s = await get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
      if (!s) return apiResponse(res, 403, false, 'Not a student');
      student_id = s.id;
    }
    if (!student_id) return apiResponse(res, 400, false, 'student_id required');

    await HomeworkModel.submit({
      homework_id: homeworkId,
      student_id: Number(student_id),
      attachment_url: req.body.attachment_url || null,
      remarks: req.body.remarks || null,
    });

    // ─── Notify the teacher who posted it ───
    if (hw.teacher_id) {
      try {
        const { get } = require('../config/database');
        const t = await get(`SELECT user_id FROM teachers WHERE id = ?`, [hw.teacher_id]);
        if (t?.user_id) {
          realtime.emitToUser(t.user_id, 'homework:submission', {
            homework_id: homeworkId,
            homework_title: hw.title,
            student_id: Number(student_id),
            at: new Date().toISOString(),
          });
        }
      } catch {}
    }

    logger.audit(`Homework submitted: hw=${homeworkId} student=${student_id}`);
    return apiResponse(res, 200, true, 'Homework submitted');
  } catch (e) { next(e); }
};

// ─── Grade (teacher/admin) ───
const gradeSubmission = async (req, res, next) => {
  try {
    const homeworkId = Number(req.params.id);
    const { student_id, grade, remarks } = req.body;
    if (!student_id) return apiResponse(res, 400, false, 'student_id required');
    if (!grade || !grade.trim()) return apiResponse(res, 400, false, 'grade required');

    const result = await HomeworkModel.gradeSubmission({
      homework_id: homeworkId,
      student_id: Number(student_id),
      grade: grade.trim(),
      remarks: remarks || null,
      graded_by: req.user.id,
    });

    if (!result || result.changes === 0)
      return apiResponse(res, 404, false,
        'No submission found — this student has not submitted yet.');

    // ─── Notify the student ───
    try {
      const { get } = require('../config/database');
      const st = await get(`SELECT user_id FROM students WHERE id = ?`, [Number(student_id)]);
      if (st?.user_id) {
        realtime.emitToUser(st.user_id, 'homework:graded', {
          homework_id: homeworkId,
          grade: grade.trim(),
          remarks: remarks || null,
          at: new Date().toISOString(),
        });
      }
    } catch {}

    logger.audit(`Submission graded: hw=${homeworkId} student=${student_id} grade=${grade}`);
    return apiResponse(res, 200, true, 'Submission graded');
  } catch (e) { next(e); }
};

module.exports = {
  listHomework, getHomework, createHomework, updateHomework, deleteHomework,
  submitHomework, gradeSubmission,
};
