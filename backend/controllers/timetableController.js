// controllers/timetableController.js
const TimetableModel = require('../models/timetableModel');
const ClassModel     = require('../models/classModel');
const SubjectModel   = require('../models/subjectModel');
const ApprovalModel  = require('../models/approvalModel');
const { apiResponse } = require('../utils/helpers');
const logger          = require('../utils/logger');
const { DAYS_OF_WEEK } = require('../config/constants');
const StudentModel    = require('../models/studentModel');

// ─── Constants ───
const DAYS = DAYS_OF_WEEK; // ['Monday','Tuesday',…]
const NO_PERIODS_MSG = 'You have not entered periods yet.';
const TIME_24H_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const TIME_12H_REGEX = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i;

// ─── Helpers ───
const isTime = (s) => {
  const str = String(s || '').trim();
  return TIME_24H_REGEX.test(str) || TIME_12H_REGEX.test(str);
};

const normalizeTime = (s) => {
  const str = String(s || '').trim();

  const match12 = str.toUpperCase().match(TIME_12H_REGEX);
  if (match12) {
    let h = Number(match12[1]);
    const m = match12[2];
    const meridian = match12[3];
    if (meridian === 'AM' && h === 12) h = 0;
    if (meridian === 'PM' && h !== 12) h += 12;
    return `${String(h).padStart(2, '0')}:${m}:00`;
  }

  const match24 = str.match(TIME_24H_REGEX);
  if (match24) {
    const h = String(Number(match24[1])).padStart(2, '0');
    const m = match24[2];
    const sec = match24[3] || '00';
    return `${h}:${m}:${sec}`;
  }

  return null;
};

const DAY_ALIASES = {
  mon: 'Monday',        tue: 'Tuesday',  wed: 'Wednesday',
  thu: 'Thursday',      fri: 'Friday',   sat: 'Saturday',  sun: 'Sunday',
  monday: 'Monday',     tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday',   saturday: 'Saturday', sunday: 'Sunday',
};

const normalizeDay = (d) => {
  if (d == null) return d;
  const key = String(d).trim().toLowerCase();
  return DAY_ALIASES[key] || d;
};

// ─── Validation helper (exposed for approval re-checks) ───
const _validateTimetableChange = async ({
  section_id, subject_id, teacher_id = null,
  day_of_week, start_time, end_time, except_id = null,
}) => {
  if (!section_id || Number.isNaN(Number(section_id)))
    return { ok: false, msg: 'section_id is required and must be a valid number' };
  if (!subject_id || Number.isNaN(Number(subject_id)))
    return { ok: false, msg: 'subject_id is required and must be a valid number' };

  const day = normalizeDay(day_of_week);
  if (!day || !DAYS.includes(day))
    return { ok: false, msg: `day_of_week is required and must be one of ${DAYS.join(', ')}` };

  if (!start_time || String(start_time).trim() === '' || !isTime(start_time))
    return { ok: false, msg: 'start_time is required and must be a valid 12-hour (08:00 AM) or 24-hour (08:00) time' };

  if (!end_time || String(end_time).trim() === '' || !isTime(end_time))
    return { ok: false, msg: 'end_time is required and must be a valid 12-hour (08:35 AM) or 24-hour (08:35) time' };

  const start = normalizeTime(start_time);
  const end   = normalizeTime(end_time);
  if (!start || !end)
    return { ok: false, msg: 'start_time and end_time could not be normalized' };
  if (start >= end)
    return { ok: false, msg: `end_time (${end_time}) must be later than start_time (${start_time})` };

  const sec = await ClassModel.findSection(Number(section_id));
  if (!sec) return { ok: false, msg: `Section with id ${section_id} not found` };

  const subject = await SubjectModel.findById(Number(subject_id));
  if (!subject) return { ok: false, msg: `Subject with id ${subject_id} not found` };
  if (subject.class_id && subject.class_id !== sec.class_id) {
    return {
      ok: false,
      msg: `Subject "${subject.subject_name}" belongs to a different class`,
    };
  }

  const secConflict = await TimetableModel.sectionConflict({
    section_id: Number(section_id), day_of_week: day,
    start_time: start, end_time: end, except_id,
  });
  if (secConflict)
    return {
      ok: false,
      msg: `Section already has ${secConflict.start_time} to ${secConflict.end_time} on ${day}`,
    };

  if (teacher_id) {
    const tConflict = await TimetableModel.teacherConflict({
      teacher_id: Number(teacher_id), day_of_week: day,
      start_time: start, end_time: end, except_id,
    });
    if (tConflict)
      return {
        ok: false,
        msg: `Teacher is busy on ${day} ${tConflict.start_time} to ${tConflict.end_time}`,
      };
  }

  return {
    ok: true,
    normalized: {
      section_id: Number(section_id),
      subject_id: Number(subject_id),
      teacher_id: teacher_id ? Number(teacher_id) : null,
      day_of_week: day,
      start_time: start,
      end_time: end,
    },
  };
};

// ─── List ───
const listTimetable = async (req, res, next) => {
  try {
    const filters = {
      section_id: req.query.section_id ? Number(req.query.section_id) : undefined,
      teacher_id: req.query.teacher_id ? Number(req.query.teacher_id) : undefined,
      class_id:   req.query.class_id   ? Number(req.query.class_id)   : undefined,
      day:        req.query.day ? normalizeDay(req.query.day) : undefined,
    };
    const rows = await TimetableModel.list(filters);
    const msg = rows.length ? 'Timetable' : NO_PERIODS_MSG;
    return apiResponse(res, 200, true, msg, rows);
  } catch (e) { next(e); }
};

// ─── Weekly grid ───
const weeklyGrid = async (req, res, next) => {
  try {
    const section_id = Number(req.params.sectionId);
    if (!section_id) return apiResponse(res, 400, false, 'sectionId is required');
    const rows = await TimetableModel.weeklyForSection(section_id);
    const msg = rows.length ? 'Weekly grid' : NO_PERIODS_MSG;
    return apiResponse(res, 200, true, msg, rows);
  } catch (e) { next(e); }
};

// ─── Get one ───
const getSlot = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return apiResponse(res, 400, false, 'Valid slot id is required');
    const slot = await TimetableModel.findById(id);
    if (!slot) return apiResponse(res, 404, false, 'Slot not found');
    return apiResponse(res, 200, true, 'Slot', slot);
  } catch (e) { next(e); }
};

// ─── Create ───
const createSlot = async (req, res, next) => {
  try {
    const v = await _validateTimetableChange(req.body);
    if (!v.ok) return apiResponse(res, 400, false, v.msg);

    const payload = v.normalized;

    if (req.user && req.user.role !== 'admin') {
      const { lastID } = await ApprovalModel.create({
        resource_type: 'timetable', action: 'create',
        payload, requested_by: req.user.id,
      });
      logger.audit(`Timetable CREATE submitted for approval (id=${lastID}) by ${req.user.name}`);
      return apiResponse(res, 202, true, 'Submitted for admin approval', { approval_id: lastID });
    }

    const { lastID } = await TimetableModel.create(payload);
    logger.audit(`Timetable slot created: ${payload.day_of_week} ${payload.start_time}-${payload.end_time} (id=${lastID})`);
    return apiResponse(res, 201, true, 'Slot created', { id: lastID });
  } catch (e) { next(e); }
};

// ─── Update ───
const updateSlot = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return apiResponse(res, 400, false, 'Valid slot id is required');
    const existing = await TimetableModel.findById(id);
    if (!existing) return apiResponse(res, 404, false, 'Slot not found');

    const proposed = {
      section_id:  req.body.section_id  !== undefined ? req.body.section_id  : existing.section_id,
      subject_id:  req.body.subject_id  !== undefined ? req.body.subject_id  : existing.subject_id,
      teacher_id:  req.body.teacher_id  !== undefined ? req.body.teacher_id  : existing.teacher_id,
      day_of_week: req.body.day_of_week !== undefined ? req.body.day_of_week : existing.day_of_week,
      start_time:  req.body.start_time  !== undefined ? req.body.start_time  : existing.start_time,
      end_time:    req.body.end_time    !== undefined ? req.body.end_time    : existing.end_time,
    };

    const v = await _validateTimetableChange({ ...proposed, except_id: id });
    if (!v.ok) return apiResponse(res, 400, false, v.msg);

    const next_vals = v.normalized;

    if (req.user && req.user.role !== 'admin') {
      const { lastID } = await ApprovalModel.create({
        resource_type: 'timetable', action: 'update', resource_id: id,
        payload: next_vals, requested_by: req.user.id,
      });
      logger.audit(`Timetable UPDATE submitted for approval (id=${lastID}) by ${req.user.name}`);
      return apiResponse(res, 202, true, 'Submitted for admin approval', { approval_id: lastID });
    }

    await TimetableModel.update(id, next_vals);
    logger.audit(`Timetable slot updated: id=${id}`);
    return apiResponse(res, 200, true, 'Slot updated');
  } catch (e) { next(e); }
};

// ─── Delete (original, with admin-approval workflow) ───
const deleteSlot = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return apiResponse(res, 400, false, 'Valid slot id is required');
    const slot = await TimetableModel.findById(id);
    if (!slot) return apiResponse(res, 404, false, 'Slot not found');

    if (req.user && req.user.role !== 'admin') {
      const { lastID } = await ApprovalModel.create({
        resource_type: 'timetable', action: 'delete', resource_id: id,
        payload: { id }, requested_by: req.user.id,
      });
      logger.audit(`Timetable DELETE submitted for approval (id=${lastID}) by ${req.user.name}`);
      return apiResponse(res, 202, true, 'Submitted for admin approval', { approval_id: lastID });
    }

    await TimetableModel.remove(id);
    logger.audit(`Timetable slot deleted: id=${id}`);
    return apiResponse(res, 200, true, 'Slot deleted');
  } catch (e) { next(e); }
};

// ─── Student self-service: my timetable ───
const myTimetable = async (req, res, next) => {
  try {
    const student = await StudentModel.findByUserId(req.user.id);
    if (!student || !student.section_id) {
      return apiResponse(res, 403, false, 'No section assigned to your account');
    }
    const rows = await TimetableModel.weeklyForSection(student.section_id);
    const msg = rows.length ? 'My timetable' : NO_PERIODS_MSG;
    return apiResponse(res, 200, true, msg, rows);
  } catch (e) { next(e); }
};

// ─── Section-scoped lookups for the Add Slot form ───
const teachersForSection = async (req, res, next) => {
  try {
    const section_id = Number(req.params.sectionId);
    if (!section_id) return apiResponse(res, 400, false, 'sectionId required');
    const rows = await TimetableModel.teachersForSection(section_id);
    return apiResponse(res, 200, true, 'Teachers for section', rows);
  } catch (e) { next(e); }
};

const subjectsForSection = async (req, res, next) => {
  try {
    const section_id = Number(req.params.sectionId);
    if (!section_id) return apiResponse(res, 400, false, 'sectionId required');
    const rows = await TimetableModel.subjectsForSection(section_id);
    return apiResponse(res, 200, true, 'Subjects for section', rows);
  } catch (e) { next(e); }
};

const myTeachingSchedule = async (req, res, next) => {
  try {
    const TeacherModel = require('../models/teacherModel');
    const teacher = await TeacherModel.findByUserId(req.user.id);
    if (!teacher) return apiResponse(res, 403, false, 'Not a teacher');
    const rows = await TimetableModel.byTeacher(teacher.id);
    const msg = rows.length ? 'My teaching schedule' : NO_PERIODS_MSG;
    return apiResponse(res, 200, true, msg, rows);
  } catch (e) { next(e); }
};

const schoolTimetable = async (req, res, next) => {
  try {
    const rows = await TimetableModel.schoolGrid();
    const msg = rows.length ? 'School timetable' : NO_PERIODS_MSG;
    return apiResponse(res, 200, true, msg, rows);
  } catch (e) { next(e); }
};

const searchTimetable = async (req, res, next) => {
  try {
    const filters = {
      class_id:   req.query.class_id   ? Number(req.query.class_id)   : undefined,
      section_id: req.query.section_id ? Number(req.query.section_id) : undefined,
      teacher_id: req.query.teacher_id ? Number(req.query.teacher_id) : undefined,
      subject_id: req.query.subject_id ? Number(req.query.subject_id) : undefined,
      day:        req.query.day ? normalizeDay(req.query.day) : undefined,
      period:     req.query.period,
      q:          req.query.q,
    };
    const rows = await TimetableModel.searchSlots(filters);
    const msg = rows.length ? 'Timetable search' : NO_PERIODS_MSG;
    return apiResponse(res, 200, true, msg, rows);
  } catch (e) { next(e); }
};

/* ════════════════════════════════════════════════════════════════
   DRILL-DOWN — grid for the View / Edit pages
   ════════════════════════════════════════════════════════════════ */

const getGrid = async (req, res, next) => {
  try {
    const day = normalizeDay(req.query.day || 'monday');
    const { periods, sections } = await TimetableModel.gridForDay(day);
    const teacherLoad = await TimetableModel.teacherLoad(day);
    const msg = Array.isArray(periods) && periods.length ? 'Timetable grid' : NO_PERIODS_MSG;
    return apiResponse(res, 200, true, msg, {
      day, periods, sections, teacherLoad,
    });
  } catch (e) { next(e); }
};

const getTeacherLoad = async (req, res, next) => {
  try {
    const day = req.query.day ? normalizeDay(req.query.day) : null;
    const load = await TimetableModel.teacherLoad(day);
    return apiResponse(res, 200, true, 'Teacher load', load);
  } catch (e) { next(e); }
};

const bulkEdit = async (req, res, next) => {
  try {
    const { day, entries } = req.body || {};
    const normalizedDay = normalizeDay(day);
    if (!normalizedDay || !DAYS.includes(normalizedDay)) {
      return apiResponse(res, 400, false, `day is required and must be one of ${DAYS.join(', ')}`);
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return apiResponse(res, 400, false, NO_PERIODS_MSG);
    }

    const normalizedEntries = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i] || {};
      const v = await _validateTimetableChange({
        ...entry,
        day_of_week: entry.day_of_week || normalizedDay,
      });
      if (!v.ok) {
        return apiResponse(res, 400, false, `Entry ${i + 1}: ${v.msg}`);
      }
      normalizedEntries.push(v.normalized);
    }

    const result = await TimetableModel.bulkUpsert(normalizedEntries);
    return apiResponse(res, 200, true, 'Bulk edit saved', result);
  } catch (e) { next(e); }
};

module.exports = {
  listTimetable,
  weeklyGrid,
  getSlot,
  createSlot,
  updateSlot,
  deleteSlot,
  subjectsForSection,
  teachersForSection,
  myTimetable,
  _validateTimetableChange,
  myTeachingSchedule,
  schoolTimetable,
  searchTimetable,
  getGrid,
  getTeacherLoad,
  bulkEdit,
};

