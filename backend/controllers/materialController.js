const path = require('path');
const fs = require('fs');
const MaterialModel = require('../models/materialModel');
const ApprovalModel = require('../models/approvalModel');
const StudentModel = require('../models/studentModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const realtime = require('../realtime/socket');

const KINDS = ['lecture', 'notice', 'assignment', 'other'];

// ─── List (role-aware) ───
const listMaterials = async (req, res, next) => {
  try {
    const filters = {
      kind:        req.query.kind || undefined,
      class_id:    req.query.class_id ? Number(req.query.class_id) : undefined,
      section_id:  req.query.section_id ? Number(req.query.section_id) : undefined,
      subject_id:  req.query.subject_id ? Number(req.query.subject_id) : undefined,
      q:           req.query.q || undefined,
    };

    // Students see only their own scope
    if (req.user.role === 'student') {
      if (!req.studentSectionId && !req.studentClassId)
        return apiResponse(res, 403, false, 'Not linked to a class/section');
      // Prefer section match; fall back to class
      delete filters.section_id;
      delete filters.class_id;
    }

    let rows = await MaterialModel.list(filters);

    if (req.user.role === 'student') {
      rows = rows.filter((m) => MaterialModel.canView(m, req.user));
    }

    return apiResponse(res, 200, true, 'Materials', rows);
  } catch (e) { next(e); }
};

// ─── Get one ───
const getMaterial = async (req, res, next) => {
  try {
    const m = await MaterialModel.findById(Number(req.params.id));
    if (!m) return apiResponse(res, 404, false, 'Material not found');
    if (!MaterialModel.canView(m, req.user))
      return apiResponse(res, 403, false, 'Forbidden');
    return apiResponse(res, 200, true, 'Material', m);
  } catch (e) { next(e); }
};

// ─── Upload ───
const uploadMaterial = async (req, res, next) => {
  try {
    if (!req.file) return apiResponse(res, 400, false, 'file required');

    const { title, description = null, kind = 'other',
            class_id = null, section_id = null, subject_id = null } = req.body;

    if (!title || !title.trim()) {
      // Delete the orphaned file we just wrote
      try { fs.unlinkSync(req.file.path); } catch {}
      return apiResponse(res, 400, false, 'title required');
    }
    if (!KINDS.includes(kind)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return apiResponse(res, 400, false, `kind must be one of ${KINDS.join(', ')}`);
    }

    const file_url = `/uploads/materials/${req.file.filename}`;
    const payload = {
      title: title.trim(),
      description: description ? String(description).trim() : null,
      kind,
      class_id: class_id ? Number(class_id) : null,
      section_id: section_id ? Number(section_id) : null,
      subject_id: subject_id ? Number(subject_id) : null,
      file_url,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      uploaded_by: req.user.id,
    };

    // Teachers posting a 'notice' kind go through approval. Everything else is live.
    if (kind === 'notice' && req.user.role !== 'admin') {
      const { lastID } = await ApprovalModel.create({
        resource_type: 'material_notice',
        action: 'create',
        payload,
        requested_by: req.user.id,
      });
      logger.audit(`Material notice submitted for approval (id=${lastID}) by ${req.user.name}`);
      return apiResponse(res, 202, true, 'Submitted for admin approval', { approval_id: lastID });
    }

    const { lastID } = await MaterialModel.create(payload);
    logger.audit(`Material uploaded: "${payload.title}" (id=${lastID}) by ${req.user.name}`);
    return apiResponse(res, 201, true, 'Material uploaded', { id: lastID, file_url });
  } catch (e) { next(e); }
};

// ─── Delete ───
const deleteMaterial = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const m = await MaterialModel.findById(id);
    if (!m) return apiResponse(res, 404, false, 'Material not found');

    if (req.user.role !== 'admin' && m.uploaded_by !== req.user.id)
      return apiResponse(res, 403, false, 'Only the uploader or admin can delete');

    // Best-effort file removal
    try {
      const fp = path.join(__dirname, '..', m.file_url.replace(/^\/uploads\//, 'uploads/'));
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {}

    await MaterialModel.remove(id);
    logger.audit(`Material deleted: id=${id} by ${req.user.name}`);
    return apiResponse(res, 200, true, 'Material deleted');
  } catch (e) { next(e); }
};

// ─── My uploads (for teacher dashboard) ───
const myMaterials = async (req, res, next) => {
  try {
    const rows = await MaterialModel.list({ uploaded_by: req.user.id });
    return apiResponse(res, 200, true, 'My materials', rows);
  } catch (e) { next(e); }
};

module.exports = { listMaterials, getMaterial, uploadMaterial, deleteMaterial, myMaterials };
