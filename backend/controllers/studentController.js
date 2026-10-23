const UserModel = require('../models/userModel');
const StudentModel = require('../models/studentModel');
const StudentDetailModel = require('../models/studentDetailModel');
const AttendanceModel = require('../models/attendanceModel');
const { hash } = require('../utils/password');
const { apiResponse } = require('../utils/helpers');

const listStudents = async (req, res, next) => {
  try {
    const rows = await StudentModel.list({
      section_id: req.query.section_id,
      class_id: req.query.class_id,
    });
    return apiResponse(res, 200, true, 'Students', rows);
  } catch (e) { next(e); }
};

const createStudent = async (req, res, next) => {
  try {
    const { name, email, password, section_id, roll_number, gender, dob,
            guardian_name, guardian_phone } = req.body;
    if (await UserModel.findByEmail(email))
      return apiResponse(res, 409, false, 'Email already in use');

    const password_hash = await hash(password || 'changeme123');
    const { lastID: user_id } = await UserModel.create({ name, email, password_hash, role: 'student' });
    const admission_number = req.body.admission_number || `ADM${String(user_id).padStart(5, '0')}`;

    const { lastID: student_id } = await StudentModel.create({
      user_id, admission_number, section_id, roll_number, gender, dob,
      guardian_name, guardian_phone,
    });

    return apiResponse(res, 201, true, 'Student created', { id: student_id, admission_number });
  } catch (e) { next(e); }
};

const getStudentOverview = async (req, res, next) => {
  try {
    const id = Number(req.params.studentId);
    const [profile, attendanceSummary, fees, homework, exams] = await Promise.all([
      StudentDetailModel.profile(id),
      AttendanceModel.summary(id),
      StudentDetailModel.fees(id),
      StudentDetailModel.homework(id),
      StudentDetailModel.exams(id),
    ]);
    if (!profile) return apiResponse(res, 404, false, 'Student not found');
    return apiResponse(res, 200, true, 'Student overview', {
      profile, attendanceSummary, fees, homework, exams,
    });
  } catch (e) { next(e); }
};

const getStudentAttendance = async (req, res, next) => {
  try {
    const rows = await AttendanceModel.findByStudent(Number(req.params.studentId), req.query);
    return apiResponse(res, 200, true, 'Attendance history', rows);
  } catch (e) { next(e); }
};

const updateStudent = async (req, res, next) => {
  try {
    await StudentModel.update(Number(req.params.studentId), req.body);
    return apiResponse(res, 200, true, 'Student updated');
  } catch (e) { next(e); }
};

const deleteStudent = async (req, res, next) => {
  try {
    await StudentModel.remove(Number(req.params.studentId));
    return apiResponse(res, 200, true, 'Student deleted');
  } catch (e) { next(e); }
};

module.exports = {
  listStudents, createStudent, getStudentOverview, getStudentAttendance,
  updateStudent, deleteStudent,
};
