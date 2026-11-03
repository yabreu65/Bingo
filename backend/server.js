require('dotenv').config();

// Validar variables de entorno antes de iniciar el servidor
const { validateEnv } = require('./config/env');
const env = validateEnv();

const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/database');
const { createApp } = require('./app');
const socketHandlers = require('./socket/socketHandlers');
const { attachSocketDisconnectDiagnostics } = require('./socket/disconnectDiagnostics');
const { socketAuthMiddleware } = require('./middleware/socketAuthMiddleware');
const logger = require('./config/logger');
const roomCleanupService = require('./services/roomCleanup');
const { recoverPersistedRooms } = require('./socket/handlers/gameHandlers');
const { resolveNetworkPolicy, createCorsOptions } = require('./config/networkPolicy');
const { createSocketEventRateLimiter } = require('./middleware/socketRateLimiter');

const networkPolicy = resolveNetworkPolicy(env);
const corsOptions = createCorsOptions(networkPolicy);
const app = createApp({ networkPolicy });
const server = http.createServer(app);

const io = socketIo(server, {
  cors: corsOptions,
  maxHttpBufferSize: 100 * 1024,
  allowRequest: (request, callback) => {
    const origin = request.headers.origin;
    callback(null, !origin || networkPolicy.allowedOrigins.includes(origin));
  }
});
app.set('io', io);

// Socket.io authentication middleware
io.use(socketAuthMiddleware);

// Recovery and cleanup are started only after database/index readiness.


io.on('connection', (socket) => {
  const connectedAtMonotonicNs = process.hrtime.bigint();
  socket.use(createSocketEventRateLimiter());
  attachSocketDisconnectDiagnostics(socket, logger, { connectedAtMonotonicNs });
  logger.logSocketEvent(socket.id, 'connected', {
    isGuest: socket.isGuest,
    userId: socket.user?.userId
  });
  socketHandlers(io, socket);
});

const PORT = process.env.PORT || 5000;
const startup = (async () => {
  await connectDB();
  const { isDatabaseReady } = require('./utils/databaseReadiness');
  if (!(await isDatabaseReady())) throw new Error('Database is not ready for admission');
  await recoverPersistedRooms(io);
  roomCleanupService.start();
  server.listen(PORT, () => {
  logger.info(`
🎄 =============================================== 🎅
   BINGO NAVIDEÑO - Backend running on port ${PORT}
   Environment: ${process.env.NODE_ENV || 'development'}
🎄 =============================================== 🎅
  `);
  });
})().catch(async () => {
  logger.error('Backend startup failed: database is not ready');
  await require('mongoose').disconnect();
  io.close();
  process.exitCode = 1;
});

module.exports = { app, server, io, startup };
