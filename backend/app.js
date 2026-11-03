const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { isDatabaseReady } = require('./utils/databaseReadiness');

const roomRoutes = require('./routes/roomRoutes');
const playerRoutes = require('./routes/playerRoutes');
const gameRoutes = require('./routes/gameRoutes');
const spotifyRoutes = require('./routes/spotifyRoutes');
const deezerRoutes = require('./routes/deezerRoutes');
const authRoutes = require('./routes/authRoutes');
const recordingsRoutes = require('./routes/recordings');
const adminRoutes = require('./routes/adminRoutes');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { resolveNetworkPolicy, createCorsOptions } = require('./config/networkPolicy');

function createApp({ networkPolicy = resolveNetworkPolicy(process.env) } = {}) {
  const app = express();
  app.set('trust proxy', networkPolicy.trustProxyHops);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.deezer.com'],
        frameSrc: ["'self'", 'https://www.youtube.com'],
        mediaSrc: ["'self'", 'https:']
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));

  app.use(cors(createCorsOptions(networkPolicy)));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(requestLogger);

  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/players', playerRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/spotify', spotifyRoutes);
  app.use('/api/deezer', deezerRoutes);
  app.use('/api/recordings', recordingsRoutes);
  app.use('/api/admin/rooms/:code', adminRoutes);

  app.get('/api/live', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'OK', timestamp: new Date() });
  });
  app.get(['/api/health', '/api/ready'], async (req, res) => {
    const ready = await isDatabaseReady();
    res.set('Cache-Control', 'no-store').status(ready ? 200 : 503)
      .json({ status: ready ? 'OK' : 'NOT_READY', timestamp: new Date() });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
