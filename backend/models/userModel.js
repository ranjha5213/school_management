const { run, get, all } = require('../config/database');

const UserModel = {
  create: ({ name, email, password_hash, role, phone = null, avatar_url = null, status = 'active' }) =>
    run(
      `INSERT INTO users (name, email, password_hash, role, phone, avatar_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, email, password_hash, role, phone, avatar_url, status]
    ),

  findByEmail: (email) => get(`SELECT * FROM users WHERE email = ?`, [email]),

  findById: (id) =>
    get(
      `SELECT id, name, email, role, phone, avatar_url, status, created_at
       FROM users WHERE id = ?`,
      [id]
    ),

  list: () => all(`SELECT id, name, email, role, status FROM users ORDER BY name`),

  listPending: () =>
    all(
      `SELECT id, name, email, role, created_at
       FROM users WHERE status = 'pending'
       ORDER BY created_at DESC`
    ),

  setStatus: (id, status, approved_by = null, reason = null) =>
    run(
      `UPDATE users
       SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, rejection_reason = ?
       WHERE id = ?`,
      [status, approved_by, reason, id]
    ),

  update: (id, patch) => {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  findByIdWithHash: (id) => get(`SELECT * FROM users WHERE id = ?`, [id]),

  setPassword: (id, password_hash) =>
    run(`UPDATE users SET password_hash = ? WHERE id = ?`, [password_hash, id]),
};

module.exports = UserModel;
