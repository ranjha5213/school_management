const { run, get, all } = require('../config/database');

const InviteModel = {
  create: ({ email, role, invited_by, token }) =>
    run(
      `INSERT INTO invites (email, role, invited_by, token) VALUES (?, ?, ?, ?)`,
      [email, role, invited_by, token]
    ),
  findByToken: (token) => get(`SELECT * FROM invites WHERE token = ?`, [token]),
  markUsed: (id) => run(`UPDATE invites SET used = 1, used_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]),
  list: () => all(`SELECT * FROM invites ORDER BY created_at DESC`),
};

module.exports = InviteModel;
