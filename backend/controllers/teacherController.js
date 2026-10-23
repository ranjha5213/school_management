const UserModel = require('../models/userModel');
const TeacherModel = require('../models/teacherModel');
const TeacherDetailModel = require('../models/teacherDetailModel');
const { hash } = require('../utils/password');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── List ───
const listTeachers = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    let rows = await TeacherModel.list();

    if (q) {
      rows = rows.filter((r) =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.employee_code || '').toLowerCase().includes(q)
      );
    }
    return apiResponse(res, 200, true, 'Teachers', rows);
  } catch (e) { next(e); }
};

// ─── Get one ───
const getTeacher = async (req, res, next) => {
  try {
    const id = Number(req.params.teacherId);
    const t = await TeacherModel.findById(id);
    if (!t) return apiResponse(res, 404, false, 'Teacher not found');
    return apiResponse(res, 200, true, 'Teacher', t);
  } catch (e) { next(e); }
};

// ─── Create ───
const createTeacher = async (req, res, next) => {
  try {
    const {
      name, email, password,
      employee_code, department_id, qualification, join_date, salary,
      phone,
    } = req.body;

    if (!name || !name.trim())
      return apiResponse(res, 400, false, 'Name required');
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return apiResponse(res, 400, false, 'Valid email required');

    if (await UserModel.findByEmail(email))
      return apiResponse(res, 409, false, 'Email already registered');

    const password_hash = await hash(password || 'changeme123');

    const { lastID: user_id } = await UserModel.create({
      name: name.trim(),
      email: email.trim(),
      password_hash,
      role: 'teacher',
      phone: phone || null,
      status: 'active',   // admin-added teachers are active immediately
    });

    const code = employee_code && employee_code.trim()
      ? employee_code.trim().toUpperCase()
      : `EMP${String(user_id).padStart(5, '0')}`;

    if (await TeacherModel.employeeCodeTaken(code)) {
      await UserModel.update(user_id, {});
      // rollback user if code collides
      // (no direct delete in UserModel; leave created user but report error)
      return apiResponse(res, 409, false, `Employee code ${code} already in use`);
    }

    const { lastID: teacher_id } = await TeacherModel.create({
      user_id,
      employee_code: code,
      department_id: department_id || null,
      qualification: qualification || null,
      join_date: join_date || null,
      salary: salary || null,
    });

    logger.audit(`Teacher created: ${name} (${code})`);

    return apiResponse(res, 201, true, 'Teacher created', {
      id: teacher_id,
      user_id,
      employee_code: code,
      name: name.trim(),
    });
  } catch (e) { next(e); }
};

// ─── Update ───
const updateTeacher = async (req, res, next) => {
  try {
    const id = Number(req.params.teacherId);
    const t = await TeacherModel.findById(id);
    if (!t) return apiResponse(res, 404, false, 'Teacher not found');

    const {
      name, email, phone,
      employee_code, department_id, qualification, join_date, salary,
    } = req.body;

    // Check employee_code uniqueness
    if (employee_code && employee_code.trim().toUpperCase() !== t.employee_code) {
      const code = employee_code.trim().toUpperCase();
      const taken = await TeacherModel.employeeCodeTaken(code, id);
      if (taken) return apiResponse(res, 409, false, `Employee code ${code} already in use`);
    }

    // Check email uniqueness
    if (email && email.trim() !== t.email) {
      const existing = await UserModel.findByEmail(email.trim());
      if (existing && existing.id !== t.user_id)
        return apiResponse(res, 409, false, 'Email already in use');
    }

    // Patch teacher table
    const teacher_patch = {};
    if (employee_code) teacher_patch.employee_code = employee_code.trim().toUpperCase();
    if (department_id !== undefined) teacher_patch.department_id = department_id || null;
    if (qualification !== undefined) teacher_patch.qualification = qualification || null;
    if (join_date !== undefined) teacher_patch.join_date = join_date || null;
    if (salary !== undefined) teacher_patch.salary = salary || null;

    if (Object.keys(teacher_patch).length) {
      await TeacherModel.update(id, teacher_patch);
    }

    // Patch user table
    const user_patch = {};
    if (name) user_patch.name = name.trim();
    if (email) user_patch.email = email.trim();
    if (phone !== undefined) user_patch.phone = phone || null;

    if (Object.keys(user_patch).length) {
      await UserModel.update(t.user_id, user_patch);
    }

    logger.audit(`Teacher updated: id=${id}`);
    return apiResponse(res, 200, true, 'Teacher updated');
  } catch (e) { next(e); }
};

// ─── Delete ───
const deleteTeacher = async (req, res, next) => {
  try {
    const id = Number(req.params.teacherId);
    const t = await TeacherModel.findById(id);
    if (!t) return apiResponse(res, 404, false, 'Teacher not found');

    // block if assigned to a timetable
    const sections = await TeacherModel.sections(id);
    if (sections.length && req.query.force !== 'true')
      return apiResponse(res, 409, false,
        `Teacher is assigned to ${sections.length} section(s). Pass ?force=true to remove anyway.`);

    await TeacherModel.remove(id);
    // Soft-disable the user instead of deleting (keeps audit trail)
    await UserModel.setStatus(t.user_id, 'rejected');

    logger.audit(`Teacher deleted: ${t.name} (id=${id})`);
    return apiResponse(res, 200, true, 'Teacher deleted');
  } catch (e) { next(e); }
};

// ─── Overview (existing behaviour, richer) ───
const getTeacherOverview = async (req, res, next) => {
  try {
    const id = Number(req.params.teacherId);
    const [profile, sections, timetable, homework, attendanceMarked] = await Promise.all([
      TeacherDetailModel.profile(id),
      TeacherDetailModel.sections(id),
      TeacherDetailModel.timetable(id),
      TeacherDetailModel.homeworkPosted(id),
      TeacherDetailModel.attendanceMarked(id),
    ]);
    if (!profile) return apiResponse(res, 404, false, 'Teacher not found');
    return apiResponse(res, 200, true, 'Teacher overview', {
      profile, sections, timetable, homework, attendanceMarked,
    });
  } catch (e) { next(e); }
};

// ─── Departments list ───
const listDepartments = async (_req, res, next) => {
  try {
    return apiResponse(res, 200, true, 'Departments', await TeacherModel.listDepartments());
  } catch (e) { next(e); }
};

module.exports = {
  listTeachers, getTeacher, createTeacher, updateTeacher, deleteTeacher,
  getTeacherOverview, listDepartments,
};
