// controllers/studentController.js
const UserModel = require('../models/userModel');
const StudentModel = require('../models/studentModel');
const StudentDetailModel = require('../models/studentDetailModel');
const AttendanceModel = require('../models/attendanceModel');
const { get } = require('../config/database');
const { hash } = require('../utils/password');
const { apiResponse } = require('../utils/helpers');

/** Convert raw errors into friendly { status, message } */
function toFriendlyError(err, fallback = 'Something went wrong') {
  const msg = String(err && err.message ? err.message : '');
  const status = err.status || 500;

  if (status === 409 || err.code === 'EMAIL_IN_USE' || /email.*(unique|in use)/i.test(msg))
    return { status: 409, message: 'That email address is already registered. Please use a different one.' };
  if (/FOREIGN KEY/i.test(msg))
    return { status: 400, message: 'One of the referenced records (like section or class) does not exist.' };
  if (/UNIQUE constraint failed: students.admission_number/i.test(msg))
    return { status: 409, message: 'That admission number is already taken.' };
  if (/UNIQUE constraint/i.test(msg))
    return { status: 409, message: 'A record with those details already exists.' };
  if (/no such table/i.test(msg))
    return { status: 500, message: 'A required data table is missing. Please contact support.' };
  if (/NOT NULL constraint/i.test(msg))
    return { status: 400, message: 'Some required fields are missing. Please check the form and try again.' };
  if (/invalid|not found|not exist/i.test(msg))
    return { status: 400, message: msg };

  return { status, message: status >= 500 ? fallback : msg || fallback };
}

/** Validate a numeric id from params */
function parseId(raw, label = 'ID') {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`Invalid ${label} provided`);
    err.status = 400;
    throw err;
  }
  return n;
}

const listStudents = async (req, res, next) => {
  try {
    const rows = await StudentModel.list({
      section_id: req.query.section_id,
      class_id: req.query.class_id,
      sort: req.query.sort,
    });
    return apiResponse(res, 200, true, 'Students fetched successfully', rows);
  } catch (e) {
    const { status, message } = toFriendlyError(e, 'Could not load students. Please try again.');
    return apiResponse(res, status, false, message);
  }
};

const createStudent = async (req, res, next) => {
  try {
    const { name, email, password, section_id, roll_number, gender, dob,
            guardian_name, guardian_phone } = req.body;

    if (!name || !email) {
      return apiResponse(res, 400, false, 'Name and email are required to create a student.');
    }

    if (await UserModel.findByEmail(email)) {
      return apiResponse(res, 409, false,
        'That email address is already registered. Please use a different one.');
    }

    if (section_id) {
      const sec = await get(`SELECT id FROM sections WHERE id = ?`, [section_id]);
      if (!sec) {
        return apiResponse(res, 400, false,
          'The selected section could not be found. Please choose a valid section.');
      }
    }

    const password_hash = await hash(password || 'changeme123');
    const { lastID: user_id } = await UserModel.create({
      name, email, password_hash, role: 'student',
    });

    const admission_number =
      req.body.admission_number || `ADM${String(user_id).padStart(5, '0')}`;

    const { lastID: student_id } = await StudentModel.create({
      user_id, admission_number, section_id, roll_number, gender, dob,
      guardian_name, guardian_phone,
    });

    return apiResponse(res, 201, true, 'Student created successfully', {
      id: student_id, admission_number,
    });
  } catch (e) {
    const { status, message } = toFriendlyError(e, 'Could not create student. Please try again.');
    return apiResponse(res, status, false, message);
  }
};

const getStudentOverview = async (req, res, next) => {
  try {
    const id = parseId(req.params.studentId, 'student ID');

    const profile = await StudentDetailModel.profile(id);
    if (!profile) {
      return apiResponse(res, 404, false, 'Student not found.');
    }

    // Fetch each sub-resource independently; log and degrade gracefully
    const safe = async (label, fn) => {
      try { return await fn(); }
      catch (e) {
        console.error(`[overview] ${label} failed for student ${id}:`, e.message);
        return [];
      }
    };

    const [attendanceSummary, fees, homework, exams] = await Promise.all([
      safe('attendance', () => AttendanceModel.summary(id)),
      safe('fees',       () => StudentDetailModel.fees(id)),
      safe('homework',   () => StudentDetailModel.homework(id)),
      safe('exams',      () => StudentDetailModel.exams(id)),
    ]);

    return apiResponse(res, 200, true, 'Student overview loaded', {
      profile, attendanceSummary, fees, homework, exams,
    });
  } catch (e) {
    const { status, message } = toFriendlyError(e, 'Could not load student overview.');
    return apiResponse(res, status, false, message);
  }
};

const getStudentAttendance = async (req, res, next) => {
  try {
    const id = parseId(req.params.studentId, 'student ID');
    const rows = await AttendanceModel.findByStudent(id, req.query);
    return apiResponse(res, 200, true, 'Attendance history loaded', rows);
  } catch (e) {
    const { status, message } = toFriendlyError(e, 'Could not load attendance history.');
    return apiResponse(res, status, false, message);
  }
};

const updateStudent = async (req, res, next) => {
  try {
    const id = parseId(req.params.studentId, 'student ID');

    const existing = await StudentModel.findById(id);
    if (!existing) {
      return apiResponse(res, 404, false, 'Student not found.');
    }

    const result = await StudentModel.update(id, req.body);
    if (result && result.changes === 0) {
      return apiResponse(res, 200, true, 'No changes were needed.', { updated: false });
    }
    return apiResponse(res, 200, true, 'Student updated successfully');
  } catch (e) {
    const { status, message } = toFriendlyError(e, 'Could not update student. Please try again.');
    return apiResponse(res, status, false, message);
  }
};

const deleteStudent = async (req, res, next) => {
  try {
    // ✅ Reads :studentId (matches validateParamId('studentId') on the route)
    const studentId = parseId(req.params.studentId, 'student ID');
    const cascade = req.query.cascade === 'true' || req.query.cascade === true;

    const result = await StudentModel.remove(studentId, cascade);
    if (!result.found) {
      return apiResponse(res, 404, false,
        'Student not found. They may already have been deleted.');
    }

    return apiResponse(res, 200, true, 'Student deleted successfully');
  } catch (e) {
    const { status, message } = toFriendlyError(e, 'Could not delete student. Please try again.');
    return apiResponse(res, status, false, message);
  }
};

const suspendStudent = async (req, res, next) => {
  try {
    const studentId = parseId(req.params.studentId, 'student ID');

    const existing = await StudentModel.findById(studentId);
    if (!existing) {
      return apiResponse(res, 404, false, 'Student not found.');
    }
    if (existing.status === 'suspended') {
      return apiResponse(res, 200, true, 'Student is already suspended.');
    }

    await StudentModel.update(studentId, { status: 'suspended', is_active: 0 });
    return apiResponse(res, 200, true, 'Student suspended successfully');
  } catch (e) {
    const { status, message } = toFriendlyError(e, 'Could not suspend student. Please try again.');
    return apiResponse(res, status, false, message);
  }
};

const readmitStudent = async (req, res, next) => {
  try {
    const studentId = parseId(req.params.studentId, 'student ID');

    const existing = await StudentModel.findById(studentId);
    if (!existing) {
      return apiResponse(res, 404, false, 'Student not found.');
    }
    if (existing.status === 'active' && existing.is_active === 1) {
      return apiResponse(res, 200, true, 'Student is already active.');
    }

    await StudentModel.update(studentId, { status: 'active', is_active: 1 });
    return apiResponse(res, 200, true, 'Student readmitted successfully');
  } catch (e) {
    const { status, message } = toFriendlyError(e, 'Could not readmit student. Please try again.');
    return apiResponse(res, status, false, message);
  }
};

module.exports = {
  listStudents,
  createStudent,
  getStudentOverview,
  getStudentAttendance,
  updateStudent,
  deleteStudent,
  suspendStudent,
  readmitStudent,
};
