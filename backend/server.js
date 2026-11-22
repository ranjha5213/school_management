require('dotenv').config();
const express = require('express');
const http = require('http');
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

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

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

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/static', express.static(path.join(__dirname, 'public')));

// Health check & API Routes (no-cache applied to /api)
app.get('/health', (_req, res) => res.json({ ok: true, env: NODE_ENV, ts: Date.now() }));
app.use('/api', noCacheMiddleware, routes);

// Serve built frontend in production (must come BEFORE notFound)
if (NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../frontend/dist');
  app.use(express.static(distPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/static')) {
      return next();
    }
    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 404 & Error Handlers
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);

// Initialize Socket.io (pass corsConfig if your socket.init accepts options)
socket.init(server, corsConfig);

server.listen(PORT, HOST, () => {
  logger.info(`Server listening on http://${HOST}:${PORT} [${NODE_ENV}]`);

  try {
    startMcqScheduler();
    logger.info('MCQ Scheduler started successfully');
  } catch (e) {
    logger.error('Scheduler init failed:', e);
  }
});

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

module.exports = { app, server };

