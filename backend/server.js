require('dotenv').config();

// Validar variables de entorno antes de iniciar el servidor
const { validateEnv } = require('./config/env');
const env = validateEnv();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/database');

const roomRoutes = require('./routes/roomRoutes');
const playerRoutes = require('./routes/playerRoutes');
const gameRoutes = require('./routes/gameRoutes');
const spotifyRoutes = require('./routes/spotifyRoutes');
const deezerRoutes = require('./routes/deezerRoutes');
const authRoutes = require('./routes/authRoutes');
const recordingsRoutes = require('./routes/recordings');
const adminRoutes = require('./routes/adminRoutes');
const socketHandlers = require('./socket/socketHandlers');
const { socketAuthMiddleware } = require('./middleware/socketAuthMiddleware');
const logger = require('./config/logger');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const roomCleanupService = require('./services/roomCleanup');
const { recoverPersistedRooms } = require('./socket/handlers/gameHandlers');
const { resolveNetworkPolicy, createCorsOptions } = require('./config/networkPolicy');
const { createSocketEventRateLimiter } = require('./middleware/socketRateLimiter');

const app = express();
const server = http.createServer(app);

const networkPolicy = resolveNetworkPolicy(env);
const corsOptions = createCorsOptions(networkPolicy);
app.set('trust proxy', networkPolicy.trustProxyHops);

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

connectDB().then(() => recoverPersistedRooms(io));

// Iniciar servicio de limpieza de salas inactivas
roomCleanupService.start();

// Security headers con Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.deezer.com"],
      frameSrc: ["'self'", "https://www.youtube.com"],
      mediaSrc: ["'self'", "https:"]
    }
  },
  crossOriginEmbedderPolicy: false, // Necesario para cargar recursos externos como YouTube
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors(corsOptions));
// Keep JSON/form payloads bounded; multipart recording uploads are limited by multer.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use('/uploads', express.static('uploads'));

// Request logging middleware
app.use(requestLogger);

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/deezer', deezerRoutes);
app.use('/api/recordings', recordingsRoutes);
app.use('/api/admin/rooms/:code', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling middlewares (deben ir al final, después de todas las rutas)
app.use(notFoundHandler);
app.use(errorHandler);

io.on('connection', (socket) => {
  socket.use(createSocketEventRateLimiter());
  logger.logSocketEvent(socket.id, 'connected', {
    isGuest: socket.isGuest,
    userId: socket.user?.userId
  });
  socketHandlers(io, socket);

  socket.on('disconnect', () => {
    logger.logSocketEvent(socket.id, 'disconnected');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`
🎄 =============================================== 🎅
   BINGO NAVIDEÑO - Backend running on port ${PORT}
   Environment: ${process.env.NODE_ENV || 'development'}
🎄 =============================================== 🎅
  `);
});

module.exports = { app, server, io };
