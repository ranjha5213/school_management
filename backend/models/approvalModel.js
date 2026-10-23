const { run, get, all } = require('../config/database');

const ApprovalModel = {
  create: ({ resource_type, action, resource_id = null, payload = null, requested_by }) =>
    run(
      `INSERT INTO approvals
         (resource_type, action, resource_id, payload, status, requested_by)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [resource_type, action, resource_id, payload ? JSON.stringify(payload) : null, requested_by]
    ),

  findById: (id) =>
    get(
      `SELECT a.*,
              u.name AS requested_by_name,
              r.name AS reviewed_by_name
         FROM approvals a
         LEFT JOIN users u ON a.requested_by = u.id
         LEFT JOIN users r ON a.reviewed_by = r.id
        WHERE a.id = ?`,
      [id]
    ),

  list: ({ resource_type, status, requested_by } = {}) => {
    let sql = `
      SELECT a.*,
             u.name AS requested_by_name,
             r.name AS reviewed_by_name
        FROM approvals a
        LEFT JOIN users u ON a.requested_by = u.id
        LEFT JOIN users r ON a.reviewed_by = r.id
       WHERE 1=1
    `;
    const params = [];
    if (resource_type) { sql += ' AND a.resource_type = ?'; params.push(resource_type); }
    if (status)        { sql += ' AND a.status = ?';        params.push(status); }
    if (requested_by)  { sql += ' AND a.requested_by = ?';  params.push(requested_by); }
    sql += ' ORDER BY a.requested_at DESC LIMIT 200';
    return all(sql, params);
  },

  pendingCount: (resource_type) =>
    get(
      `SELECT COUNT(*) AS c FROM approvals WHERE status = 'pending'
         AND (? IS NULL OR resource_type = ?)`,
      [resource_type || null, resource_type || null]
    ),

  markApproved: (id, by_user_id, note = null) =>
    run(
      `UPDATE approvals
          SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
              review_note = ?
        WHERE id = ? AND status = 'pending'`,
      [by_user_id, note, id]
    ),

  markRejected: (id, by_user_id, note = null) =>
    run(
      `UPDATE approvals
          SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
              review_note = ?
        WHERE id = ? AND status = 'pending'`,
      [by_user_id, note, id]
    ),
};

module.exports = ApprovalModel;
