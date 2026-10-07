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
const socketHandlers = require('./socket/socketHandlers');
const { socketAuthMiddleware } = require('./middleware/socketAuthMiddleware');
const logger = require('./config/logger');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const roomCleanupService = require('./services/roomCleanup');

const app = express();
const server = http.createServer(app);

// Configuración de CORS para permitir múltiples orígenes
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5500',
  'http://192.168.1.8:5173',
  'http://192.168.1.39:5173',
  'http://192.168.1.43:5173',
  'http://192.168.1.43:5174',
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);

    // En desarrollo, permitir cualquier localhost o IP de red local
    if (process.env.NODE_ENV !== 'production') {
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      const isLocalNetwork = origin.match(/^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d{4,5}$/);

      if (isLocalhost || isLocalNetwork) {
        return callback(null, true);
      }
    }

    // En producción o si no coincide con desarrollo, verificar whitelist
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true
};

const io = socketIo(server, {
  cors: corsOptions
});

// Socket.io authentication middleware
io.use(socketAuthMiddleware);

connectDB();

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
      connectSrc: ["'self'", "ws://localhost:5001", "wss://localhost:5001", "https://api.deezer.com"],
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling middlewares (deben ir al final, después de todas las rutas)
app.use(notFoundHandler);
app.use(errorHandler);

io.on('connection', (socket) => {
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
