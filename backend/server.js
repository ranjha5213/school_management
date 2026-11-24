require('dotenv').config();
const express = require('express');
const http = require('http');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const logger = require('./utils/logger');
const socket = require('./realtime/socket');
const { startMcqScheduler } = require('./realtime/mcqScheduler');
const { close: closeDb } = require('./config/database');
const { runMigrations, resolveDbPath, resolveBackupDir } = require('./migrate');

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT) || 5000;
// Default to 127.0.0.1 when HOST is unset to avoid Windows Firewall prompts in Electron;
// override via HOST=0.0.0.0 in .env when LAN access is desired.
const HOST = process.env.HOST || '127.0.0.1';

const DB_PATH = resolveDbPath(process.env.DB_PATH);
const BACKUP_DIR = resolveBackupDir(process.env.BACKUP_DIR);
const UPLOADS_DIR = path.resolve(
  process.env.UPLOADS_DIR ||
    (process.env.SCHOOL_DATA_DIR
      ? path.join(process.env.SCHOOL_DATA_DIR, 'uploads')
      : path.join(__dirname, 'uploads'))
);
const FRONTEND_DIST_DIR = path.resolve(
  process.env.FRONTEND_DIST_DIR || path.resolve(__dirname, '../frontend/dist')
);

// Normalize resolved paths for downstream routes, upload handlers, and schedulers
process.env.DB_PATH = DB_PATH;
process.env.BACKUP_DIR = BACKUP_DIR;
process.env.UPLOADS_DIR = UPLOADS_DIR;
process.env.FRONTEND_DIST_DIR = FRONTEND_DIST_DIR;

fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'mcq'), { recursive: true });

// Disable ETag so Express does not return 304 Not Modified responses
app.set('etag', false);

/**
 * Parse CORS_ORIGIN into something the `cors` middleware accepts.
 *   CORS_ORIGIN=*                              -> allow any (no credentials)
 *   CORS_ORIGIN=http://a:5173,http://b:5173    -> allow-list (credentials ok)
 */
const buildCorsConfig = () => {
  const raw = (process.env.CORS_ORIGIN || '*').trim();

  if (raw === '*') {
    return { origin: '*', credentials: false };
  }

  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return { origin: origins, credentials: true };
};

const noCacheMiddleware = (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
};

const corsConfig = buildCorsConfig();

// Security & Middleware
app.use(
  helmet({
    // Allows /uploads and /static assets to load when frontend is on a separate LAN port/origin
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors(corsConfig));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (m) => logger.access(m.trim()) } }));

// Static files (writable UPLOADS_DIR + app static assets)
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/static', express.static(path.join(__dirname, 'public')));

// Health checks (supports both /health and /api/health readiness probes)
const healthHandler = (_req, res) =>
  res.json({
    ok: true,
    env: NODE_ENV,
    dbPath: DB_PATH,
    backupDir: BACKUP_DIR,
    ts: Date.now(),
  });
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api', noCacheMiddleware, routes);

// Serve built frontend in production or when FRONTEND_DIST_DIR exists (e.g., Electron)
const indexHtmlPath = path.join(FRONTEND_DIST_DIR, 'index.html');
if (NODE_ENV === 'production' || fs.existsSync(indexHtmlPath)) {
  if (fs.existsSync(FRONTEND_DIST_DIR)) {
    app.use(express.static(FRONTEND_DIST_DIR));
  }

  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/static') ||
      req.path.startsWith('/socket.io')
    ) {
      return next();
    }
    if (fs.existsSync(indexHtmlPath)) {
      return res.sendFile(indexHtmlPath);
    }
    return next();
  });
}

// 404 & Error Handlers
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);

// Initialize Socket.io (pass corsConfig if your socket.init accepts options)
socket.init(server, corsConfig);

// Graceful Shutdown Handling
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}. Closing server gracefully...`);

  const forceTimer = setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      await closeDb();
      logger.info('SQLite database connection closed.');
      clearTimeout(forceTimer);
      process.exit(0);
    } catch (err) {
      logger.error('Error closing database connection:', err);
      clearTimeout(forceTimer);
      process.exit(1);
    }
  });

  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function startServer() {
  try {
    runMigrations({
      dbPath: DB_PATH,
      backupDir: BACKUP_DIR,
      noBackup: process.env.SKIP_STARTUP_BACKUP === '1',
    });
  } catch (err) {
    logger.error('Startup migration failed:', err);
    throw err;
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => {
      server.removeListener('error', reject);
      logger.info(`Server listening on http://${HOST}:${PORT} [${NODE_ENV}]`);
      logger.info(`SQLite DB: ${DB_PATH}`);
      logger.info(`Backups Dir: ${BACKUP_DIR}`);
      logger.info(`Uploads Dir: ${UPLOADS_DIR}`);
      logger.info(`Frontend Dir: ${FRONTEND_DIST_DIR}`);

      try {
        startMcqScheduler();
        logger.info('MCQ Scheduler started successfully');
      } catch (e) {
        logger.error('Scheduler init failed:', e);
      }

      resolve();
    });
  });

  return server;
}

if (require.main === module) {
  startServer().catch(() => {
    process.exit(1);
  });
}

module.exports = { app, server, startServer };

