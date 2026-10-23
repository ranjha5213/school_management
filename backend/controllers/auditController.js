const AuditModel = require('../models/auditModel');
const { apiResponse } = require('../utils/helpers');

const listLogs = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 200;
    return apiResponse(res, 200, true, 'Audit logs', await AuditModel.list(limit));
  } catch (e) { next(e); }
};

module.exports = { listLogs };
