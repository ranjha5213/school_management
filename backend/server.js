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

// Security & Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (m) => logger.access(m.trim()) } }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check & API Routes
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api', routes);

// 404 & Error Handlers
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);

// Initialize Socket.io
socket.init(server);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  logger.info(`Server on :${PORT}`);

  // Start background schedulers safely after server starts
  try { 
    startMcqScheduler(); 
    logger.info('MCQ Scheduler started successfully');
  } catch (e) { 
    logger.error('Scheduler init failed:', e); 
  }
});

// Graceful Shutdown Handling
const shutdown = async () => {
  logger.info('Received shutdown signal. Closing server gracefully...');

  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      await closeDb();
      logger.info('SQLite database connection closed.');
      process.exit(0);
    } catch (err) {
      logger.error('Error closing database connection:', err);
      process.exit(1);
    }
  });

  // Force close if graceful shutdown takes too long (10 seconds)
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server };

