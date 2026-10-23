const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const write = (file, level, msg) => {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  fs.appendFileSync(path.join(LOG_DIR, file), line);
  if (process.env.NODE_ENV !== 'production') process.stdout.write(line);
};

module.exports = {
  info: (m) => write('combined.log', 'INFO', m),
  warn: (m) => write('combined.log', 'WARN', m),
  error: (m) => write('error.log', 'ERROR', m),
  access: (m) => write('access.log', 'ACCESS', m),
  audit: (m) => write('audit.log', 'AUDIT', m),
};
