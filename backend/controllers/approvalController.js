const ApprovalModel = require('../models/approvalModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const realtime = require('../realtime/socket');
const TimetableModel = require('../models/timetableModel');
const TimetableController = require('./timetableController');

// ─── Apply an approved change ───
async function applyApproval(approval) {
  const payload = approval.payload ? JSON.parse(approval.payload) : null;

  if (approval.resource_type === 'timetable') {
    if (approval.action === 'create') {
      const { lastID } = await TimetableModel.create(payload);
      return { id: lastID };
    }
    if (approval.action === 'update') {
      const r = await TimetableModel.update(approval.resource_id, payload);
      return { changes: r.changes };
    }
    if (approval.action === 'delete') {
      await TimetableModel.remove(approval.resource_id);
      return { deleted: approval.resource_id };
    }
  }

  if (approval.resource_type === 'notice') {
    const NoticeModel = require('../models/noticeModel');
    const realtime = require('../realtime/socket');

    const { lastID } = await NoticeModel.create({
      title: payload.title,
      content: payload.content,
      target_role: payload.target_role,
      target_class_id: payload.target_class_id || null,
      target_section_id: payload.target_section_id || null,
      posted_by: payload.posted_by,
      expires_at: payload.expires_at || null,
    });

    // Fan out recipients + realtime
    const recipients = await NoticeModel.resolveRecipients({
      target_role: payload.target_role,
      target_class_id: payload.target_class_id || null,
      target_section_id: payload.target_section_id || null,
    });
    for (const r of recipients) {
      await NoticeModel.createNotification({ user_id: r.user_id, notice_id: lastID });
    }
    const rt = {
      id: lastID, title: payload.title, content: payload.content,
      target_role: payload.target_role, posted_at: new Date().toISOString(),
    };
    recipients.forEach((r) => realtime.emitToUser(r.user_id, 'notice:new', rt));

    return { id: lastID, recipients: recipients.length };
  }

  if (approval.resource_type === 'material_notice') {
    const MaterialModel = require('../models/materialModel');
    const { lastID } = await MaterialModel.create(payload);
    return { id: lastID };
  }

  throw new Error(`Unknown resource_type: ${approval.resource_type}`);
}

// ─── List queue ───
const listQueue = async (req, res, next) => {
  try {
    const { resource_type, status = 'pending' } = req.query;
    const rows = await ApprovalModel.list({ resource_type, status });
    return apiResponse(res, 200, true, 'Approvals', rows);
  } catch (e) { next(e); }
};

// ─── Teacher's own requests ───
const myRequests = async (req, res, next) => {
  try {
    const rows = await ApprovalModel.list({ requested_by: req.user.id });
    return apiResponse(res, 200, true, 'My requests', rows);
  } catch (e) { next(e); }
};

// ─── Approve ───
const approve = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const a = await ApprovalModel.findById(id);
    if (!a) return apiResponse(res, 404, false, 'Approval not found');
    if (a.status !== 'pending')
      return apiResponse(res, 400, false, `Already ${a.status}`);

    // Re-validate at approval time — conflicts may have appeared since submission
    if (a.resource_type === 'timetable') {
      const payload = JSON.parse(a.payload);
      const v = await TimetableController._validateTimetableChange({
        ...payload,
        except_id: a.action === 'update' ? a.resource_id : null,
      });
      if (!v.ok) return apiResponse(res, 409, false, v.msg);
    }

    const applied = await applyApproval(a);

    await ApprovalModel.markApproved(id, req.user.id, req.body.note || null);
    logger.audit(`Approval ${id} APPROVED by ${req.user.name} (${a.resource_type}/${a.action})`);

    // Notify the requester
    try {
      realtime.emitToUser(a.requested_by, 'approval:approved', {
        id, resource_type: a.resource_type, action: a.action,
        reviewed_by_name: req.user.name, at: new Date().toISOString(),
      });
    } catch {}

    return apiResponse(res, 200, true, 'Approved and applied', { applied });
  } catch (e) { next(e); }
};

// ─── Reject ───
const reject = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const a = await ApprovalModel.findById(id);
    if (!a) return apiResponse(res, 404, false, 'Approval not found');
    if (a.status !== 'pending')
      return apiResponse(res, 400, false, `Already ${a.status}`);

    await ApprovalModel.markRejected(id, req.user.id, req.body.note || null);
    logger.audit(`Approval ${id} REJECTED by ${req.user.name} (${a.resource_type}/${a.action})`);

    try {
      realtime.emitToUser(a.requested_by, 'approval:rejected', {
        id, resource_type: a.resource_type, action: a.action,
        reviewed_by_name: req.user.name,
        note: req.body.note || null,
        at: new Date().toISOString(),
      });
    } catch {}

    return apiResponse(res, 200, true, 'Rejected');
  } catch (e) { next(e); }
};

// ─── Pending count (for badges) ───
const pendingCount = async (req, res, next) => {
  try {
    const { resource_type } = req.query;
    const row = await ApprovalModel.pendingCount(resource_type);
    return apiResponse(res, 200, true, 'Pending count', { count: row?.c || 0 });
  } catch (e) { next(e); }
};

module.exports = { listQueue, myRequests, approve, reject, pendingCount };
