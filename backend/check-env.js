require('dotenv').config();

const required = ['JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);

if (missing.length) {
  console.error('✗ Missing env vars:', missing.join(', '));
  process.exit(1);
}
console.log('✓ Env OK');
