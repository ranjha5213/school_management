const { Server } = require('socket.io');
const { verify } = require('../utils/jwt');
const logger = require('../utils/logger');

let io = null;

// Connected sockets indexed by user id → Set of socket ids
const userSockets = new Map();

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    },
    path: '/socket.io',
    pingTimeout: 60000,   // Wait 60s for a pong before timing out (prevents mobile disconnects)
    pingInterval: 25000,  // Send a ping every 25s
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      // allow anonymous — they just won't join any personal room
      socket.user = { id: 0, role: 'anon' };
      return next();
    }
    try {
      socket.user = verify(token);
      next();
    } catch (e) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.user?.id;
    logger.info(`[socket] connected user=${uid} sid=${socket.id}`);

    // Personal room
    if (uid) {
      socket.join(`user:${uid}`);
      if (!userSockets.has(uid)) userSockets.set(uid, new Set());
      userSockets.get(uid).add(socket.id);
    }

    // Role room
    if (socket.user?.role) socket.join(`role:${socket.user.role}`);

    // Client can subscribe to a section for live attendance
    socket.on('subscribe:section', (section_id) => {
      if (!section_id) return;
      socket.join(`section:${section_id}`);
      logger.info(`[socket] user=${uid} joined section:${section_id}`);
    });

    socket.on('unsubscribe:section', (section_id) => {
      if (!section_id) return;
      socket.leave(`section:${section_id}`);
    });

    socket.on('disconnect', () => {
      logger.info(`[socket] disconnected user=${uid} sid=${socket.id}`);
      if (uid && userSockets.has(uid)) {
        const set = userSockets.get(uid);
        set.delete(socket.id);
        if (set.size === 0) userSockets.delete(uid);
      }
    });
  });

  return io;
};

// ─── Emit helpers ───

const emitToUser = (user_id, event, payload) => {
  if (!io || !user_id) return;
  io.to(`user:${user_id}`).emit(event, payload);
};

const emitToUsers = (user_ids, event, payload) => {
  if (!io) return;
  (user_ids || []).forEach((uid) => io.to(`user:${uid}`).emit(event, payload));
};

const emitToRole = (role, event, payload) => {
  if (!io) return;
  io.to(`role:${role}`).emit(event, payload);
};

const emitToSection = (section_id, event, payload) => {
  if (!io) return;
  io.to(`section:${section_id}`).emit(event, payload);
};

const emitToAll = (event, payload) => {
  if (!io) return;
  io.emit(event, payload);
};

const getIo = () => io;

module.exports = {
  init,
  emitToUser,
  emitToUsers,
  emitToRole,
  emitToSection,
  emitToAll,
  getIo,
};

