const TimetableModel = require('../models/timetableModel');
const ClassModel = require('../models/classModel');
const ApprovalModel = require('../models/approvalModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const isTime = (s) => /^\d{2}:\d{2}(:\d{2})?$/.test(s);
const normalizeTime = (s) => (s.length === 5 ? `${s}:00` : s);

// ─── Validation helper (exposed for approval re-checks) ───
const _validateTimetableChange = async ({ section_id, subject_id, teacher_id = null,
                                          day_of_week, start_time, end_time,
                                          except_id = null }) => {
  if (!section_id)  return { ok: false, msg: 'section_id required' };
  if (!subject_id)  return { ok: false, msg: 'subject_id required' };
  if (!day_of_week || !DAYS.includes(day_of_week))
    return { ok: false, msg: `day_of_week must be one of ${DAYS.join(', ')}` };
  if (!start_time || !end_time || !isTime(start_time) || !isTime(end_time))
    return { ok: false, msg: 'start_time and end_time must be HH:MM' };

  const start = normalizeTime(start_time);
  const end   = normalizeTime(end_time);
  if (start >= end) return { ok: false, msg: 'start_time must be before end_time' };

  const sec = await ClassModel.findSection(Number(section_id));
  if (!sec) return { ok: false, msg: 'Section not found' };

  const secConflict = await TimetableModel.sectionConflict({
    section_id: Number(section_id), day_of_week, start_time: start, end_time: end,
    except_id,
  });
  if (secConflict)
    return { ok: false, msg: `Section already has ${secConflict.start_time} to ${secConflict.end_time} on ${day_of_week}` };

  if (teacher_id) {
    const tConflict = await TimetableModel.teacherConflict({
      teacher_id: Number(teacher_id), day_of_week,
      start_time: start, end_time: end, except_id,
    });
    if (tConflict)
      return { ok: false, msg: `Teacher is busy on ${day_of_week} ${tConflict.start_time} to ${tConflict.end_time}` };
  }

  return { ok: true, normalized: {
    section_id: Number(section_id), subject_id: Number(subject_id),
    teacher_id: teacher_id ? Number(teacher_id) : null,
    day_of_week, start_time: start, end_time: end,
  }};
};

// ─── List ───
const listTimetable = async (req, res, next) => {
  try {
    let section_id = req.query.section_id ? Number(req.query.section_id) : undefined;
    if (req.user.role === 'student') {
      if (!req.studentSectionId)
        return apiResponse(res, 403, false, 'Not linked to a section');
      section_id = req.studentSectionId;
    }

    const rows = await TimetableModel.list({
      section_id,
      teacher_id: req.query.teacher_id ? Number(req.query.teacher_id) : undefined,
      class_id:   req.query.class_id   ? Number(req.query.class_id)   : undefined,
      day:        req.query.day || undefined,
    });
    return apiResponse(res, 200, true, 'Timetable', rows);
  } catch (e) { next(e); }
};

// ─── Weekly grid for one section ───
const weeklyGrid = async (req, res, next) => {
  try {
    const section_id = Number(req.params.sectionId);

    if (req.user.role === 'student') {
      if (!req.studentSectionId)
        return apiResponse(res, 403, false, 'Not linked to a section');
      if (section_id !== req.studentSectionId)
        return apiResponse(res, 403, false, 'Forbidden - not your section');
    }

    const sec = await ClassModel.findSection(section_id);
    if (!sec) return apiResponse(res, 404, false, 'Section not found');

    const [slots, subjects, teachers] = await Promise.all([
      TimetableModel.weeklyForSection(section_id),
      TimetableModel.subjectsForSection(section_id),
      TimetableModel.teachersList(),
    ]);

    return apiResponse(res, 200, true, 'Weekly grid', {
      section: sec, slots, subjects, teachers, days: DAYS,
    });
  } catch (e) { next(e); }
};

// ─── Get one ───
const getSlot = async (req, res, next) => {
  try {
    const slot = await TimetableModel.findById(Number(req.params.id));
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

    if (req.user.role !== 'admin') {
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
    const existing = await TimetableModel.findById(id);
    if (!existing) return apiResponse(res, 404, false, 'Slot not found');

    const proposed = {
      section_id: req.body.section_id ?? existing.section_id,
      subject_id: req.body.subject_id ?? existing.subject_id,
      teacher_id: req.body.teacher_id ?? existing.teacher_id,
      day_of_week: req.body.day_of_week ?? existing.day_of_week,
      start_time: req.body.start_time ?? existing.start_time,
      end_time: req.body.end_time ?? existing.end_time,
    };

    const v = await _validateTimetableChange({ ...proposed, except_id: id });
    if (!v.ok) return apiResponse(res, 400, false, v.msg);

    const next_vals = v.normalized;

    if (req.user.role !== 'admin') {
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

// ─── Delete ───
const deleteSlot = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const slot = await TimetableModel.findById(id);
    if (!slot) return apiResponse(res, 404, false, 'Slot not found');

    if (req.user.role !== 'admin') {
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

module.exports = {
  listTimetable, weeklyGrid, getSlot,
  createSlot, updateSlot, deleteSlot,
  _validateTimetableChange,
};
