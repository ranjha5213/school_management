const { run, get, all } = require('../config/database');

const RefreshTokenModel = {
  create: (user_id, token, expires_at) =>
    run(`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`, [user_id, token, expires_at]),
  findValid: (token) => get(`SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > datetime('now')`, [token]),
  revoke: (token) => run(`DELETE FROM refresh_tokens WHERE token = ?`, [token]),
  revokeAllForUser: (user_id) => run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [user_id]),
  all: () => all(`SELECT * FROM refresh_tokens`),
};

module.exports = RefreshTokenModel;
