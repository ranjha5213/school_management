const fs = require('fs');
const path = require('path');
const UserModel = require('../models/userModel');
const { apiResponse } = require('../utils/helpers');
const { AVATARS_DIR } = require('../middleware/upload');
const logger = require('../utils/logger');

// POST /api/users/avatar
const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) return apiResponse(res, 400, false, 'No file uploaded');

    const user = await UserModel.findById(req.user.id);
    if (!user) return apiResponse(res, 404, false, 'User not found');

    const url = `/uploads/avatars/${req.file.filename}`;

    // delete previous avatar if it was stored on disk and belongs to this user
    if (user.avatar_url && user.avatar_url.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(AVATARS_DIR, path.basename(user.avatar_url));
      try { fs.unlinkSync(oldPath); } catch {}
    }

    await UserModel.update(user.id, { avatar_url: url });
    logger.audit(`Avatar uploaded for ${user.email}`);

    return apiResponse(res, 200, true, 'Avatar updated', { avatar_url: url });
  } catch (e) { next(e); }
};

// DELETE /api/users/avatar
const removeAvatar = async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) return apiResponse(res, 404, false, 'User not found');

    if (user.avatar_url && user.avatar_url.startsWith('/uploads/avatars/')) {
      const p = path.join(AVATARS_DIR, path.basename(user.avatar_url));
      try { fs.unlinkSync(p); } catch {}
    }

    await UserModel.update(user.id, { avatar_url: null });
    return apiResponse(res, 200, true, 'Avatar removed');
  } catch (e) { next(e); }
};

module.exports = { uploadAvatar, removeAvatar };
