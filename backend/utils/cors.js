// utils/cors.js
const buildCorsConfig = () => {
  const raw = (process.env.CORS_ORIGIN || '*').trim();
  if (raw === '*') return { origin: '*', credentials: false };
  const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return { origin: origins, credentials: true };
};

module.exports = { buildCorsConfig };
