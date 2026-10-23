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
const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (m) => logger.access(m.trim()) } }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
socket.init(server);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => logger.info(`Server on :${PORT}`));

module.exports = { app, server };

try { startMcqScheduler(); } catch (e) { console.error('scheduler init failed', e); }
