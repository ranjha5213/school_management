const { run, get, all } = require('../config/database');

const PasswordResetModel = {
  create: ({ email, otp_hash, expires_at, purpose = 'password_reset' }) =>
    run(
      `INSERT INTO password_resets (email, otp_hash, expires_at, purpose)
       VALUES (?, ?, ?, ?)`,
      [email, otp_hash, expires_at, purpose]
    ),

  findLatestActive: (email, purpose = 'password_reset') =>
    get(
      `SELECT * FROM password_resets
       WHERE email = ? AND purpose = ? AND used = 0 AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`,
      [email, purpose]
    ),

  findByResetToken: (token) =>
    get(
      `SELECT * FROM password_resets
       WHERE reset_token = ? AND used = 0 AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`,
      [token]
    ),

  incrementAttempts: (id) =>
    run(`UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?`, [id]),

  setResetToken: (id, token) =>
    run(`UPDATE password_resets SET reset_token = ? WHERE id = ?`, [token, id]),

  markUsed: (id) =>
    run(`UPDATE password_resets SET used = 1 WHERE id = ?`, [id]),

  // Clear old unused OTPs for the same email + purpose (fresh start)
  clearExisting: (email, purpose) =>
    run(
      `UPDATE password_resets SET used = 1
       WHERE email = ? AND purpose = ? AND used = 0`,
      [email, purpose]
    ),

  cleanup: () =>
    run(`DELETE FROM password_resets WHERE expires_at < datetime('now', '-1 day')`),
};

module.exports = PasswordResetModel;
