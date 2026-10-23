const ClassModel = require('../models/classModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── List classes ───
const listClasses = async (_req, res, next) => {
  try {
    const rows = await ClassModel.listClasses();
    return apiResponse(res, 200, true, 'Classes', rows);
  } catch (e) { next(e); }
};

// ─── Get one class (with sections) ───
const getClass = async (req, res, next) => {
  try {
    const id = Number(req.params.classId);
    const cls = await ClassModel.findClass(id);
    if (!cls) return apiResponse(res, 404, false, 'Class not found');

    const sections = await ClassModel.listSections(id);
    return apiResponse(res, 200, true, 'Class', { ...cls, sections });
  } catch (e) { next(e); }
};

// ─── Create class ───
const createClass = async (req, res, next) => {
  try {
    const { class_name, class_code = null, sections = null } = req.body;
    if (!class_name || !class_name.trim())
      return apiResponse(res, 400, false, 'class_name required');

    const { lastID } = await ClassModel.createClass({
      class_name: class_name.trim(), class_code: class_code || null,
    });

    // Optional: bulk-create sections on class creation
    let created_sections = [];
    if (Array.isArray(sections) && sections.length) {
      created_sections = await ClassModel.bulkCreateSections(lastID, sections);
    }

    logger.audit(`Class created: ${class_name} (id=${lastID})`);
    return apiResponse(res, 201, true, 'Class created', {
      id: lastID, sections: created_sections,
    });
  } catch (e) { next(e); }
};

// ─── Update class ───
const updateClass = async (req, res, next) => {
  try {
    const id = Number(req.params.classId);
    const existing = await ClassModel.findClass(id);
    if (!existing) return apiResponse(res, 404, false, 'Class not found');

    const class_name = (req.body.class_name ?? existing.class_name).trim();
    const class_code = req.body.class_code ?? existing.class_code;

    await ClassModel.updateClass(id, { class_name, class_code });
    logger.audit(`Class updated: id=${id}`);
    return apiResponse(res, 200, true, 'Class updated');
  } catch (e) { next(e); }
};

// ─── Delete class (blocks if sections exist) ───
const deleteClass = async (req, res, next) => {
  try {
    const id = Number(req.params.classId);
    const cls = await ClassModel.findClass(id);
    if (!cls) return apiResponse(res, 404, false, 'Class not found');

    const hasSections = await ClassModel.classHasSections(id);
    if (hasSections)
      return apiResponse(res, 409, false,
        'This class has sections. Delete its sections first or use ?cascade=true');

    if (req.query.cascade === 'true') {
      const sections = await ClassModel.listSections(id);
      for (const s of sections) {
        const hasStudents = await ClassModel.sectionHasStudents(s.id);
        if (hasStudents)
          return apiResponse(res, 409, false,
            `Section ${s.section_name} still has students`);
        await ClassModel.removeSection(s.id);
      }
    }

    await ClassModel.removeClass(id);
    logger.audit(`Class deleted: ${cls.class_name} (id=${id})`);
    return apiResponse(res, 200, true, 'Class deleted');
  } catch (e) { next(e); }
};

// ─── List sections of a class ───
const listSections = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    const cls = await ClassModel.findClass(classId);
    if (!cls) return apiResponse(res, 404, false, 'Class not found');
    return apiResponse(res, 200, true, 'Sections', await ClassModel.listSections(classId));
  } catch (e) { next(e); }
};

// ─── Create section ───
const createSection = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    const cls = await ClassModel.findClass(classId);
    if (!cls) return apiResponse(res, 404, false, 'Class not found');

    const { section_name, room_number = null } = req.body;
    if (!section_name || !section_name.trim())
      return apiResponse(res, 400, false, 'section_name required');

    const normalized = section_name.trim().toUpperCase();
    const taken = await ClassModel.sectionNameTaken(classId, normalized);
    if (taken)
      return apiResponse(res, 409, false, `Section ${normalized} already exists`);

    const { lastID } = await ClassModel.createSection({
      class_id: classId,
      section_name: normalized,
      room_number: room_number || null,
    });

    logger.audit(`Section ${normalized} created in class id=${classId}`);
    return apiResponse(res, 201, true, 'Section created', {
      id: lastID, section_name: normalized, room_number,
    });
  } catch (e) { next(e); }
};

// ─── Bulk create sections (A, B, C ...) ───
const bulkCreateSections = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    const cls = await ClassModel.findClass(classId);
    if (!cls) return apiResponse(res, 404, false, 'Class not found');

    const { sections } = req.body;
    if (!Array.isArray(sections) || !sections.length)
      return apiResponse(res, 400, false, 'sections[] required');

    const created = await ClassModel.bulkCreateSections(classId, sections);
    logger.audit(`Bulk created ${created.length} section(s) in class id=${classId}`);
    return apiResponse(res, 201, true, `${created.length} section(s) created`, created);
  } catch (e) { next(e); }
};

// ─── Update section ───
const updateSection = async (req, res, next) => {
  try {
    const id = Number(req.params.sectionId);
    const sec = await ClassModel.findSection(id);
    if (!sec) return apiResponse(res, 404, false, 'Section not found');

    const next_name = (req.body.section_name ?? sec.section_name).trim().toUpperCase();
    const room_number = req.body.room_number ?? sec.room_number;

    if (next_name !== sec.section_name) {
      const taken = await ClassModel.sectionNameTaken(sec.class_id, next_name, id);
      if (taken) return apiResponse(res, 409, false, `Section ${next_name} already exists`);
    }

    await ClassModel.updateSection(id, { section_name: next_name, room_number });
    logger.audit(`Section updated: id=${id}`);
    return apiResponse(res, 200, true, 'Section updated');
  } catch (e) { next(e); }
};

// ─── Delete section ───
const deleteSection = async (req, res, next) => {
  try {
    const id = Number(req.params.sectionId);
    const sec = await ClassModel.findSection(id);
    if (!sec) return apiResponse(res, 404, false, 'Section not found');

    const hasStudents = await ClassModel.sectionHasStudents(id);
    if (hasStudents && req.query.force !== 'true')
      return apiResponse(res, 409, false,
        'Section has students. Reassign them first, or pass ?force=true to orphan them.');

    await ClassModel.removeSection(id);
    logger.audit(`Section deleted: ${sec.section_name} (id=${id})`);
    return apiResponse(res, 200, true, 'Section deleted');
  } catch (e) { next(e); }
};

// ─── Students in section ───
const listStudentsInSection = async (req, res, next) => {
  try {
    const rows = await ClassModel.studentsInSection(Number(req.params.sectionId));
    return apiResponse(res, 200, true, 'Students', rows);
  } catch (e) { next(e); }
};


// ─── Add student directly into a section ───
const addStudentToSection = async (req, res, next) => {
  try {
    const sectionId = Number(req.params.sectionId);
    const sec = await ClassModel.findSection(sectionId);
    if (!sec) return apiResponse(res, 404, false, 'Section not found');

    const {
      name, email, password,
      roll_number, gender, dob,
      guardian_name, guardian_phone,
      admission_number: customAdm,
    } = req.body;

    if (!name || !name.trim())
      return apiResponse(res, 400, false, 'Student name required');
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return apiResponse(res, 400, false, 'Valid email required');

    const UserModel = require('../models/userModel');
    const StudentModel = require('../models/studentModel');
    const { hash } = require('../utils/password');

    if (await UserModel.findByEmail(email))
      return apiResponse(res, 409, false, 'Email already registered');

    const password_hash = await hash(password || 'changeme123');
    const { lastID: user_id } = await UserModel.create({
      name: name.trim(),
      email: email.trim(),
      password_hash,
      role: 'student',
      status: 'active',   // admin-added students skip OTP + approval
    });

    const admission_number = customAdm && customAdm.trim()
      ? customAdm.trim()
      : `ADM${String(user_id).padStart(5, '0')}`;

    const { lastID: student_id } = await StudentModel.create({
      user_id,
      admission_number,
      section_id: sectionId,
      roll_number: roll_number || null,
      gender: gender || null,
      dob: dob || null,
      guardian_name: guardian_name || null,
      guardian_phone: guardian_phone || null,
    });

    logger.audit(`Student added: ${name} (${admission_number}) → section ${sec.section_name}`);

    return apiResponse(res, 201, true, 'Student added', {
      id: student_id,
      user_id,
      admission_number,
      name: name.trim(),
    });
  } catch (e) { next(e); }
};

module.exports = {
  listClasses, getClass, createClass, updateClass, deleteClass,
  listSections, createSection, bulkCreateSections, updateSection, deleteSection,
  listStudentsInSection,
  addStudentToSection,
};
