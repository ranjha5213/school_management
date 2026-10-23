const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const generate = () => {
  // 6-digit numeric code
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, '0');
};

const hash = (code) => bcrypt.hash(code, 8);
const verify = (code, hashed) => bcrypt.compare(code, hashed);

const generateResetToken = () => crypto.randomBytes(32).toString('hex');

module.exports = { generate, hash, verify, generateResetToken };
