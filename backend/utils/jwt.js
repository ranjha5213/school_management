const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

const sign = (payload) => jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
const signRefresh = (payload) => jwt.sign(payload, SECRET, { expiresIn: REFRESH_EXPIRES_IN });
const verify = (token) => jwt.verify(token, SECRET);

module.exports = { sign, signRefresh, verify };
