const { run, all } = require('../config/database');

const AuditModel = {
  log: (d) =>
    run(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [d.user_id || null, d.action, d.entity || null, d.entity_id || null,
       d.details || null, d.ip || null]
    ).catch(() => ({ changes: 0 })),
  list: (limit = 200) =>
    all(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?`, [limit]).catch(() => []),
};

module.exports = AuditModel;
