const { run, get, all } = require('../config/database');

const NoticeModel = {
  // ─── List with poster name + target labels ───
  list: (filters = {}) => {
    let sql = `
      SELECT n.*,
             u.name AS posted_by_name,
             c.class_name AS target_class_name,
             sec.section_name AS target_section_name
      FROM notices n
      LEFT JOIN users u ON n.posted_by = u.id
      LEFT JOIN classes c ON n.target_class_id = c.id
      LEFT JOIN sections sec ON n.target_section_id = sec.id
    `;
    const where = [];
    const params = [];

    if (filters.active_only) {
      where.push(`(n.expires_at IS NULL OR n.expires_at >= date('now'))`);
      where.push(`n.is_active = 1`);
    }
    if (filters.role) {
      where.push(`(n.target_role = 'all' OR n.target_role = ?)`);
      params.push(filters.role);
    }
    if (filters.q) {
      where.push(`(n.title LIKE ? OR n.content LIKE ?)`);
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY n.posted_at DESC, n.id DESC LIMIT 300';
    return all(sql, params);
  },

  findById: (id) =>
    get(
      `SELECT n.*,
              u.name AS posted_by_name,
              c.class_name AS target_class_name,
              sec.section_name AS target_section_name
       FROM notices n
       LEFT JOIN users u ON n.posted_by = u.id
       LEFT JOIN classes c ON n.target_class_id = c.id
       LEFT JOIN sections sec ON n.target_section_id = sec.id
       WHERE n.id = ?`,
      [id]
    ),

  create: ({ title, content, target_role = 'all',
             target_class_id = null, target_section_id = null,
             posted_by, expires_at = null }) =>
    run(
      `INSERT INTO notices
         (title, content, target_role, target_class_id, target_section_id,
          posted_by, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [title, content, target_role, target_class_id, target_section_id,
       posted_by, expires_at]
    ),

  update: (id, patch) => {
    const allowed = ['title', 'content', 'target_role', 'target_class_id',
                     'target_section_id', 'expires_at', 'is_active'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE notices SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  remove: (id) => run(`DELETE FROM notices WHERE id = ?`, [id]),

  // ─── Notifications (read tracking) ───
  createNotification: ({ user_id, notice_id }) =>
    run(
      `INSERT OR IGNORE INTO notifications (user_id, notice_id) VALUES (?, ?)`,
      [user_id, notice_id]
    ),

  markRead: ({ user_id, notice_id }) =>
    run(
      `UPDATE notifications
       SET is_read = 1, read_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND notice_id = ?`,
      [user_id, notice_id]
    ),

  // ─── Users who should receive a notice (target resolution) ───
  resolveRecipients: ({ target_role, target_class_id, target_section_id }) => {
    const where = ["u.status = 'active'"];
    const params = [];

    if (target_role && target_role !== 'all') {
      where.push('u.role = ?');
      params.push(target_role);
    }

    let join = '';
    if (target_section_id) {
      join = `JOIN students st ON st.user_id = u.id`;
      where.push('st.section_id = ?');
      params.push(target_section_id);
    } else if (target_class_id) {
      join = `JOIN students st ON st.user_id = u.id
              JOIN sections sc ON st.section_id = sc.id`;
      where.push('sc.class_id = ?');
      params.push(target_class_id);
    }

    return all(
      `SELECT DISTINCT u.id AS user_id
       FROM users u
       ${join}
       WHERE ${where.join(' AND ')}`,
      params
    );
  },

  // ─── Inbox for a user ───
  inboxForUser: (user_id, { unread_only = false } = {}) => {
    let sql = `
      SELECT n.*, u.name AS posted_by_name,
             c.class_name AS target_class_name,
             sec.section_name AS target_section_name,
             nf.is_read, nf.read_at
      FROM notifications nf
      JOIN notices n ON nf.notice_id = n.id
      LEFT JOIN users u ON n.posted_by = u.id
      LEFT JOIN classes c ON n.target_class_id = c.id
      LEFT JOIN sections sec ON n.target_section_id = sec.id
      WHERE nf.user_id = ?
    `;
    const params = [user_id];
    if (unread_only) sql += ' AND nf.is_read = 0';
    sql += ' ORDER BY n.posted_at DESC LIMIT 200';
    return all(sql, params);
  },

  unreadCount: (user_id) =>
    get(
      `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0`,
      [user_id]
    ),
};

module.exports = NoticeModel;
