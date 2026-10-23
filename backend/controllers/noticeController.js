const NoticeModel = require('../models/noticeModel');
const ApprovalModel = require('../models/approvalModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const realtime = require('../realtime/socket');

const ROLES = ['all', 'admin', 'teacher', 'student', 'parent', 'accountant'];

// ─── List ───
const listNotices = async (req, res, next) => {
  try {
    const rows = await NoticeModel.list({
      active_only: req.query.active_only === 'true',
      role: req.user.role,
      q: req.query.q || undefined,
    });
    return apiResponse(res, 200, true, 'Notices', rows);
  } catch (e) { next(e); }
};

// ─── Get one ───
const getNotice = async (req, res, next) => {
  try {
    const notice = await NoticeModel.findById(Number(req.params.id));
    if (!notice) return apiResponse(res, 404, false, 'Notice not found');

    // Mark as read for this user
    if (req.user?.id) {
      await NoticeModel.markRead({ user_id: req.user.id, notice_id: notice.id });
    }

    return apiResponse(res, 200, true, 'Notice', notice);
  } catch (e) { next(e); }
};

// ─── Create ───
const createNotice = async (req, res, next) => {
  try {
    const { title, content, target_role = 'all',
            target_class_id = null, target_section_id = null,
            expires_at = null } = req.body;

    if (!title || !title.trim())
      return apiResponse(res, 400, false, 'title required');
    if (!content || !content.trim())
      return apiResponse(res, 400, false, 'content required');
    if (!ROLES.includes(target_role))
      return apiResponse(res, 400, false, `target_role must be one of ${ROLES.join(', ')}`);

    // Teachers go through approval; admins create directly
    if (req.user.role !== 'admin') {
      const { lastID } = await ApprovalModel.create({
        resource_type: 'notice',
        action: 'create',
        payload: {
          title: title.trim(),
          content: content.trim(),
          target_role,
          target_class_id: target_class_id ? Number(target_class_id) : null,
          target_section_id: target_section_id ? Number(target_section_id) : null,
          posted_by: req.user.id,
          expires_at: expires_at || null,
        },
        requested_by: req.user.id,
      });
      logger.audit(`Notice submitted for approval (id=${lastID}) by ${req.user.name}`);
      return apiResponse(res, 202, true, 'Submitted for admin approval', { approval_id: lastID });
    }

    const { lastID } = await NoticeModel.create({
      title: title.trim(),
      content: content.trim(),
      target_role,
      target_class_id: target_class_id ? Number(target_class_id) : null,
      target_section_id: target_section_id ? Number(target_section_id) : null,
      posted_by: req.user.id,
      expires_at: expires_at || null,
    });

    // Fan out to matching users
    const recipients = await NoticeModel.resolveRecipients({
      target_role,
      target_class_id: target_class_id ? Number(target_class_id) : null,
      target_section_id: target_section_id ? Number(target_section_id) : null,
    });

    for (const r of recipients) {
      await NoticeModel.createNotification({ user_id: r.user_id, notice_id: lastID });
    }

    // ─── Real-time push ───
    const payload = {
      id: lastID,
      title: title.trim(),
      content: content.trim(),
      target_role,
      posted_at: new Date().toISOString(),
    };
    recipients.forEach((r) => realtime.emitToUser(r.user_id, 'notice:new', payload));

    logger.audit(`Notice created: "${title}" (id=${lastID}) → ${recipients.length} recipient(s)`);
    return apiResponse(res, 201, true, 'Notice created', {
      id: lastID,
      recipients: recipients.length,
    });
  } catch (e) { next(e); }
};

// ─── Update ───
const updateNotice = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await NoticeModel.findById(id);
    if (!existing) return apiResponse(res, 404, false, 'Notice not found');

    const patch = {};
    for (const k of ['title', 'content', 'target_role',
                     'target_class_id', 'target_section_id',
                     'expires_at', 'is_active']) {
      if (k in req.body) patch[k] = req.body[k];
    }
    if (patch.target_role && !ROLES.includes(patch.target_role))
      return apiResponse(res, 400, false, `target_role must be one of ${ROLES.join(', ')}`);

    await NoticeModel.update(id, patch);
    logger.audit(`Notice updated: id=${id}`);
    return apiResponse(res, 200, true, 'Notice updated');
  } catch (e) { next(e); }
};

// ─── Delete ───
const deleteNotice = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const n = await NoticeModel.findById(id);
    if (!n) return apiResponse(res, 404, false, 'Notice not found');

    await NoticeModel.remove(id);
    logger.audit(`Notice deleted: "${n.title}" (id=${id})`);
    return apiResponse(res, 200, true, 'Notice deleted');
  } catch (e) { next(e); }
};

// ─── Inbox (my notifications) ───
const myInbox = async (req, res, next) => {
  try {
    const rows = await NoticeModel.inboxForUser(req.user.id, {
      unread_only: req.query.unread === 'true',
    });
    const count = await NoticeModel.unreadCount(req.user.id);
    return apiResponse(res, 200, true, 'Inbox', {
      notices: rows,
      unread_count: count?.c || 0,
    });
  } catch (e) { next(e); }
};

const markNoticeRead = async (req, res, next) => {
  try {
    await NoticeModel.markRead({
      user_id: req.user.id,
      notice_id: Number(req.params.id),
    });
    return apiResponse(res, 200, true, 'Marked read');
  } catch (e) { next(e); }
};

module.exports = {
  listNotices, getNotice, createNotice, updateNotice, deleteNotice,
  myInbox, markNoticeRead,
};
