const AttendanceModel = require('../models/attendanceModel');
const StudentModel = require('../models/studentModel');
const { apiResponse, todayISO } = require('../utils/helpers');
const realtime = require('../realtime/socket');

const markAttendance = async (req, res, next) => {
  try {
    const { student_id, date, status, remarks } = req.body;
    const allowed = await canMarkDate(req.user, date);
    if (!allowed.ok)
      return apiResponse(res, 400, false, allowed.msg);

    const student = await StudentModel.findById(student_id);
    if (!student) return apiResponse(res, 404, false, 'Student not found');

    const lock = await AttendanceModel.sectionDateLocked(student.section_id, date);
    if (lock)
      return apiResponse(res, 409, false,
        `Locked (marked by ${lock.marked_by_name || 'user#' + lock.marked_by} at ${lock.marked_at})`);

    await AttendanceModel.insert({ student_id, date, status, remarks, marked_by: req.user.id });
    return apiResponse(res, 201, true, 'Attendance marked');
  } catch (e) { next(e); }
};

const bulkMarkAttendance = async (req, res, next) => {
  try {
    const { records, section_id } = req.body;
    if (!Array.isArray(records) || !records.length)
      return apiResponse(res, 400, false, 'records array required');
    if (!section_id)
      return apiResponse(res, 400, false, 'section_id required');

    const date = records[0].date;
    if (!date || records.some((r) => r.date !== date))
      return apiResponse(res, 400, false, 'All records must share one date');
    const allowed = await canMarkDate(req.user, date);
    if (!allowed.ok)
      return apiResponse(res, 400, false, allowed.msg);

    const unmarked = records.filter((r) => !r.student_id || !r.status);
    if (unmarked.length)
      return apiResponse(res, 400, false, `${unmarked.length} student(s) missing status`);

    const lock = await AttendanceModel.sectionDateLocked(section_id, date);
    if (lock)
      return apiResponse(res, 409, false,
        `Already submitted by ${lock.marked_by_name || 'user#' + lock.marked_by} at ${lock.marked_at}`);

    await AttendanceModel.bulkInsert(records, req.user.id);

    // ─── Broadcast to anyone watching this section ───
    realtime.emitToSection(section_id, 'attendance:marked', {
      section_id,
      date,
      count: records.length,
      marked_by: req.user.id,
      marked_by_name: req.user.name,
      at: new Date().toISOString(),
    });

    return apiResponse(res, 201, true, `${records.length} records saved`);
  } catch (e) { next(e); }
};

// Helper: C2 backfill window
const canMarkDate = async (user, date) => {
  if (user.role === 'admin') return { ok: true };
  const today = todayISO();
  if (date === today) return { ok: true };
  if (date > today) return { ok: false, msg: 'Cannot mark future dates' };
  // teacher: within 7 days
  const diff = Math.floor((new Date(today) - new Date(date)) / 86400000);
  if (diff <= 7) return { ok: true };
  return { ok: false, msg: 'Backfill window is 7 days for teachers' };
};

// B3: teacher can correct a mark within 6h; admin anytime
const updateAttendance = async (req, res, next) => {
  try {
    const { student_id, date, status, remarks } = req.body;
    if (!student_id || !date || !status)
      return apiResponse(res, 400, false, 'student_id, date, status required');

    const row = await AttendanceModel.findByStudentAndDate(student_id, date);
    if (!row) return apiResponse(res, 404, false, 'No attendance record for that day');

    if (req.user.role !== 'admin') {
      const hrs = (Date.now() - new Date(row.marked_at + 'Z').getTime()) / 3600000;
      if (row.marked_by !== req.user.id)
        return apiResponse(res, 403, false, 'Only the original marker can edit');
      if (hrs > 6)
        return apiResponse(res, 403, false, 'Edit window (6h) has passed — ask admin to unlock');
    }

    await AttendanceModel.updateStatusRemarks(student_id, date, status, remarks || null, req.user.id);
    const logger = require('../utils/logger');
    logger.audit(`Attendance corrected: student=${student_id} date=${date} -> ${status} by ${req.user.name}`);
    return apiResponse(res, 200, true, 'Attendance updated');
  } catch (e) { next(e); }
};

const updateRemarks = async (req, res, next) => {
  try {
    const { student_id, date, remarks } = req.body;
    if (!student_id || !date)
      return apiResponse(res, 400, false, 'student_id and date required');

    const result = await AttendanceModel.updateRemarks(student_id, date, remarks, req.user.id);
    if (!result || result.changes === 0)
      return apiResponse(res, 403, false, 'Only the marker or admin can edit remarks');

    const student = await StudentModel.findById(student_id);
    if (student?.section_id) {
      realtime.emitToSection(student.section_id, 'attendance:remarks', {
        student_id, date, remarks, at: new Date().toISOString(),
      });
    }

    return apiResponse(res, 200, true, 'Remarks updated');
  } catch (e) { next(e); }
};

const getAttendanceByDate = async (req, res, next) => {
  try {
    const { date, section_id } = req.query;
    const rows = await AttendanceModel.findByDate(date, section_id);
    let lock = null;
    if (section_id && rows.length) {
      lock = {
        marked_by: rows[0].marked_by,
        marked_by_name: rows[0].marked_by_name,
        marked_at: rows[0].marked_at,
      };
    }
    return apiResponse(res, 200, true, 'Attendance by date', { records: rows, lock });
  } catch (e) { next(e); }
};

const getStudentAttendance = async (req, res, next) => {
  try {
    const rows = await AttendanceModel.findByStudent(req.params.studentId, req.query);
    return apiResponse(res, 200, true, 'Attendance history', rows);
  } catch (e) { next(e); }
};

const getStudentSummary = async (req, res, next) => {
  try {
    const s = await AttendanceModel.summary(req.params.studentId);
    return apiResponse(res, 200, true, 'Summary', s);
  } catch (e) { next(e); }
};

const getClassSummary = async (req, res, next) => {
  try {
    const { section_id, from, to } = req.query;
    const data = await AttendanceModel.classSummary(section_id, from, to);
    return apiResponse(res, 200, true, 'Class summary', data);
  } catch (e) { next(e); }
};

// ─── Student: own attendance ───
const getMyAttendance = async (req, res, next) => {
  try {
    if (!req.studentId)
      return apiResponse(res, 403, false, 'Not linked to a student record');
    const rows = await AttendanceModel.findByStudent(req.studentId, req.query);
    return apiResponse(res, 200, true, 'My attendance', rows);
  } catch (e) { next(e); }
};

const getMySummary = async (req, res, next) => {
  try {
    if (!req.studentId)
      return apiResponse(res, 403, false, 'Not linked to a student record');
    const s = await AttendanceModel.summary(req.studentId);
    return apiResponse(res, 200, true, 'My summary', s);
  } catch (e) { next(e); }
};

// ─── Admin: unlock a section/date ───
const unlockSectionDate = async (req, res, next) => {
  try {
    const { section_id, date } = req.body;
    if (!section_id || !date)
      return apiResponse(res, 400, false, 'section_id and date required');

    const removed = await AttendanceModel.supersedeBySectionDate(section_id, date, req.user.id);
    const logger = require('../utils/logger');
    logger.audit(`Attendance UNLOCKED (superseded): section=${section_id} date=${date} rows=${removed} by ${req.user.name}`);
    return apiResponse(res, 200, true, `Unlocked — ${removed} record(s) superseded`);
  } catch (e) { next(e); }
};

module.exports = {
  markAttendance, bulkMarkAttendance, updateRemarks,
  getAttendanceByDate, getStudentAttendance, getStudentSummary, getClassSummary,
  getMyAttendance, getMySummary, unlockSectionDate,
  updateAttendance,
};
