jest.mock('../models/Room', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/Game', () => ({ findById: jest.fn() }));
jest.mock('../models/Recording', () => ({ getPlayerRecordings: jest.fn() }));
jest.mock('../services/deezerService', () => ({ searchTracks: jest.fn() }));
jest.mock('../config/logger', () => ({
  error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn(), logError: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const Room = require('../models/Room');
const Game = require('../models/Game');
const Recording = require('../models/Recording');
const deezerService = require('../services/deezerService');
const logger = require('../config/logger');
const roomRoutes = require('../routes/roomRoutes');
const gameRoutes = require('../routes/gameRoutes');
const deezerRoutes = require('../routes/deezerRoutes');
const recordingsRoutes = require('../routes/recordings');
const requestLogger = require('../middleware/requestLogger');
const { errorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/rooms', roomRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/deezer', deezerRoutes);
app.use('/api/recordings', recordingsRoutes);

const errorMiddlewareApp = express();
errorMiddlewareApp.use(express.json());
errorMiddlewareApp.use(requestLogger);
errorMiddlewareApp.post('/failure', (req, res, next) => {
  next(new Error(`Failure password=${req.body.profile.password} ${req.get('x-tv-session-token')}`));
});
errorMiddlewareApp.post('/malformed', (req, res) => res.json({ success: true }));
errorMiddlewareApp.use(errorHandler);

afterEach(() => jest.clearAllMocks());

describe('HTTP error disclosure boundaries', () => {
  test('returns a generic room error while logging the server-side cause', async () => {
    const internalError = new Error('database secret: room-index details');
    Room.findOne.mockReturnValue({ populate: jest.fn().mockRejectedValue(internalError) });

    const response = await request(app).get('/api/rooms/ROOMA1');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify(response.body)).not.toContain(internalError.message);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('room'), internalError);
  });

  test('returns a generic game error while logging the server-side cause', async () => {
    const internalError = new Error('database secret: game-index details');
    Game.findById.mockReturnValue({ populate: jest.fn().mockRejectedValue(internalError) });

    const response = await request(app).get('/api/games/0123456789abcdef01234567');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify(response.body)).not.toContain(internalError.message);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('game'), internalError);
  });

  test('rejects malformed game IDs and returns 404 when the game does not exist', async () => {
    const malformed = await request(app).get('/api/games/not-an-object-id');
    expect(malformed.status).toBe(400);
    expect(malformed.body.success).toBe(false);
    expect(Game.findById).not.toHaveBeenCalled();

    const invalidStart = await request(app).post('/api/games/start').send({ roomId: 'not-an-object-id' });
    expect(invalidStart.status).toBe(400);
    expect(Room.findById).not.toHaveBeenCalled();

    Game.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    const missing = await request(app).get('/api/games/0123456789abcdef01234567');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Partida no encontrada' });
  });

  test('returns a generic Deezer error and records the provider failure server-side', async () => {
    const internalError = new Error('provider credential leaked');
    deezerService.searchTracks.mockRejectedValue(internalError);

    const response = await request(app).get('/api/deezer/search?query=test');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify(response.body)).not.toContain(internalError.message);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Deezer'), internalError);
  });

  test.each(['186abc', '186.5', 186.5, 185, 201, null])(
    'rejects malformed or out-of-range manual card numbers: %s',
    async (cardNumber) => {
      const response = await request(app).post('/api/rooms/ROOMA1/assign-manual-card').send({
        playerName: 'Paper Player',
        cardNumber
      });

      expect(response.status).toBe(400);
      expect(Room.findOne).not.toHaveBeenCalled();
    }
  );

  test.each(['186', '200'])('preserves numeric string input for valid manual card %s', async (cardNumber) => {
    Room.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'room-a', hostCapabilityHash: 'a'.repeat(64) })
    });

    const response = await request(app).post('/api/rooms/ROOMA1/assign-manual-card').send({
      playerName: 'Paper Player',
      cardNumber
    });

    expect(response.status).toBe(403);
    expect(Room.findOne).toHaveBeenCalledWith({ code: 'ROOMA1' });
  });

  test('redacts secrets from the real error middleware response and log context', async () => {
    const password = 'HTTP_PASSWORD_CANARY';
    const bearer = 'HTTP_SESSION_CANARY';
    const urlToken = 'HTTP_URL_TOKEN_CANARY';

    const response = await request(errorMiddlewareApp)
      .post(`/failure?tvSessionToken=${urlToken}`)
      .set('x-tv-session-token', `Bearer ${bearer}`)
      .send({ profile: { password }, entries: [{ playerCapability: 'HTTP_CAPABILITY_CANARY' }] });

    expect(response.status).toBe(500);
    expect(response.text).not.toContain(password);
    expect(response.text).not.toContain(bearer);
    expect(response.text).not.toContain(urlToken);
    expect(response.text).not.toContain('HTTP_CAPABILITY_CANARY');
    expect(logger.logError).toHaveBeenCalledTimes(1);
    const [loggedError, context] = logger.logError.mock.calls[0];
    expect(loggedError.message).not.toContain(password);
    expect(loggedError.message).not.toContain(bearer);
    expect(JSON.stringify(context)).not.toContain(password);
    expect(JSON.stringify(context)).not.toContain(urlToken);
    expect(JSON.stringify(context)).not.toContain('HTTP_CAPABILITY_CANARY');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(password);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(bearer);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(urlToken);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('HTTP_CAPABILITY_CANARY');
  });

  test('returns a safe client error and does not log malformed JSON contents', async () => {
    const canary = 'MALFORMED_TOKEN_CANARY';
    const response = await request(errorMiddlewareApp)
      .post('/malformed?token=URL_MALFORMED_CANARY')
      .set('Content-Type', 'application/json')
      .send(`{"token":"${canary}"`);

    expect(response.status).toBe(400);
    expect(response.text).not.toContain(canary);
    expect(response.text).not.toContain('URL_MALFORMED_CANARY');
    expect(logger.logError).toHaveBeenCalledTimes(1);
    const [loggedError] = logger.logError.mock.calls[0];
    expect(JSON.stringify(loggedError)).not.toContain(canary);
    expect(loggedError.message).not.toContain(canary);
  });

  test('does not include internal details in recording errors', async () => {
    const internalError = new Error('database secret: player recording query');
    Room.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'room-a',
        hostCapabilityHash: require('../middleware/socketAuthMiddleware')
          .createHostCapabilityHash('host-secret', 'room-a')
      })
    });
    Recording.getPlayerRecordings.mockRejectedValue(internalError);

    const response = await request(app)
      .get('/api/recordings/player/2123456789abcdef01234567')
      .set('x-room-host-capability', 'host-secret');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Error interno del servidor');
    expect(JSON.stringify(response.body)).not.toContain(internalError.message);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('recording'), internalError);
  });
});
