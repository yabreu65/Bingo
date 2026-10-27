jest.mock('../models/Recording', () => {
  function Recording(data) {
    Recording.constructed.push(this);
    Object.assign(this, data);
    this._id = 'recording-a';
  }
  Recording.constructed = [];
  Recording.prototype.save = jest.fn(function save() { return Promise.resolve(this); });
  Recording.findById = jest.fn();
  Recording.findByIdAndDelete = jest.fn();
  return Recording;
});
jest.mock('../models/Room', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/Player', () => ({ findById: jest.fn() }));
jest.mock('../models/Game', () => ({ findById: jest.fn() }));
jest.mock('../config/logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

const express = require('express');
const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const Recording = require('../models/Recording');
const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const recordingsRoutes = require('../routes/recordings');
const { parseByteRange } = recordingsRoutes;
const { createHostCapabilityHash } = require('../middleware/socketAuthMiddleware');
const { createPlayerCapabilityHash } = require('../utils/playerCapability');

const app = express();
app.use('/api/recordings', recordingsRoutes);

const roomId = '0123456789abcdef01234567';
const gameId = '1123456789abcdef01234567';
const playerId = '2123456789abcdef01234567';
const recordingId = '3123456789abcdef01234567';
const uploadDirectory = path.join(__dirname, '../uploads/recordings');
const uploadedFiles = [];

function mockRoom(room = {}) {
  const value = {
    _id: roomId,
    code: 'ROOMA1',
    currentGame: gameId,
    players: [playerId],
    hostCapabilityHash: createHostCapabilityHash('host-secret', roomId),
    ...room
  };
  Room.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(value) });
  return value;
}

function mockPlayer(secret = 'p'.repeat(43)) {
  const value = {
    _id: playerId,
    room: roomId,
    name: 'Trusted Player',
    isHost: false,
    guestCapabilityHash: createPlayerCapabilityHash(secret, roomId, playerId)
  };
  Player.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(value) });
  return value;
}

function mockActiveGame() {
  const value = {
    _id: gameId,
    room: roomId,
    activeChallenge: { type: 'dance', player: playerId, data: { text: 'Dance challenge' } }
  };
  Game.findById.mockResolvedValue(value);
  return value;
}

async function sendUpload({ capability = 'player', playerSecret = 'p'.repeat(43) } = {}) {
  const req = request(app).post('/api/recordings/upload')
    .set('x-room-code', 'ROOMA1')
    .set('x-player-id', playerId)
    .field('gameId', 'forged-game')
    .field('roomCode', 'ROOMB2')
    .field('playerId', 'forged-player')
    .field('playerName', 'Forged Player')
    .field('challengeType', 'dance')
    .field('challengeText', 'Dance challenge')
    .attach('recording', Buffer.from('test video'), {
      filename: 'test.webm',
      contentType: 'video/webm'
    });

  return req.set(
    capability === 'host' ? 'x-room-host-capability' : 'x-player-capability',
    capability === 'host' ? 'host-secret' : playerSecret
  );
}

afterEach(async () => {
  for (const filename of uploadedFiles.splice(0)) {
    await fs.unlink(path.join(uploadDirectory, filename)).catch(() => {});
  }
  Recording.constructed.length = 0;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('recording authorization boundary', () => {
  test.each([
    ['bytes=0-9', { start: 0, end: 9 }],
    ['bytes=10-', { start: 10, end: 99 }],
    ['bytes=-10', { start: 90, end: 99 }],
    ['bytes=90-120', { start: 90, end: 99 }]
  ])('normalizes valid byte range %s', (header, expected) => {
    expect(parseByteRange(header, 100)).toEqual(expected);
  });

  test.each(['bytes=abc-def', 'bytes=100-', 'bytes=20-10', 'bytes=0-1,2-3', 'bytes=-0'])
    ('rejects invalid byte range %s', (header) => {
      expect(parseByteRange(header, 100)).toBeNull();
    });

  test('returns 416 for malformed ranges without incrementing views', async () => {
    const recording = {
      filename: 'existing.webm',
      mimeType: 'video/webm',
      incrementViews: jest.fn().mockResolvedValue(undefined)
    };
    Recording.findById.mockResolvedValue(recording);
    jest.spyOn(fs, 'access').mockResolvedValue(undefined);
    jest.spyOn(fs, 'stat').mockResolvedValue({ size: 100 });

    const response = await request(app)
      .get(`/api/recordings/${recordingId}/stream`)
      .set('Range', 'bytes=1000-');

    expect(response.status).toBe(416);
    expect(response.headers['content-range']).toBe('bytes */100');
    expect(recording.incrementViews).not.toHaveBeenCalled();
  });

  test.each([
    ['/api/recordings/not-an-object-id', 'get'],
    ['/api/recordings/not-an-object-id/stream', 'get'],
    ['/api/recordings/not-an-object-id/like', 'post'],
    ['/api/recordings/not-an-object-id/like', 'delete']
  ])('rejects malformed recording identifier on %s', async (pathName, method) => {
    const response = await request(app)[method](pathName);

    expect(response.status).toBe(400);
    expect(Recording.findById).not.toHaveBeenCalled();
  });

  test('rejects malformed player IDs before database lookup', async () => {
    const response = await request(app)
      .post('/api/recordings/upload')
      .set('x-room-code', 'ROOMA1')
      .set('x-player-id', 'not-an-object-id')
      .set('x-player-capability', 'p'.repeat(43));

    expect(response.status).toBe(400);
    expect(Room.findOne).not.toHaveBeenCalled();
  });

  test('rejects unauthenticated uploads before storage instead of trusting submitted identities', async () => {
    const response = await request(app)
      .post('/api/recordings/upload')
      .field('gameId', gameId)
      .field('roomCode', 'ROOMA1')
      .field('playerId', playerId)
      .field('playerName', 'Forged Player')
      .field('challengeType', 'dance')
      .field('challengeText', 'Dance challenge')
      .attach('recording', Buffer.from('test video'), {
        filename: 'test.webm',
        contentType: 'video/webm'
      });

    expect(response.status).toBe(403);
    expect(Room.findOne).not.toHaveBeenCalled();
    expect(Recording.constructed).toHaveLength(0);
  });

  test.each(['player', 'host'])('allows active performer uploads authenticated by %s capability and persists trusted attribution', async (capability) => {
    mockRoom();
    const playerSecret = 'p'.repeat(43);
    mockPlayer(playerSecret);
    mockActiveGame();

    const response = await sendUpload({ capability, playerSecret });
    if (response.body.recording?.filename) uploadedFiles.push(response.body.recording.filename);

    expect(response.status).toBe(201);
    expect(Recording.constructed).toHaveLength(1);
    expect(Recording.constructed[0]).toMatchObject({
      gameId,
      roomCode: 'ROOMA1',
      playerId,
      playerName: 'Trusted Player',
      challengeType: 'dance'
    });
  });

  test('rejects a valid player capability when the player is not the active performer', async () => {
    const room = mockRoom();
    mockPlayer();
    Game.findById.mockResolvedValue({
      _id: gameId,
      room: room._id,
      activeChallenge: { type: 'dance', player: '3123456789abcdef01234567' }
    });

    const response = await sendUpload();
    if (response.body.recording?.filename) uploadedFiles.push(response.body.recording.filename);

    expect(response.status).toBe(403);
    expect(Recording.constructed).toHaveLength(0);
  });

  test('rejects unauthenticated deletion before removing the stored video or record', async () => {
    mockRoom();
    mockPlayer();
    Recording.findById.mockResolvedValue({
      _id: recordingId,
      roomCode: 'ROOMA1',
      playerId,
      filename: 'existing.webm'
    });
    Recording.findByIdAndDelete.mockResolvedValue({ _id: recordingId });
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    const response = await request(app).delete(`/api/recordings/${recordingId}`);

    expect(response.status).toBe(403);
    expect(fs.unlink).not.toHaveBeenCalled();
    expect(Recording.findByIdAndDelete).not.toHaveBeenCalled();
  });

  test('allows the recording owner to delete their recording with the room-bound player capability', async () => {
    mockRoom();
    mockPlayer();
    Recording.findById.mockResolvedValue({
      _id: recordingId, roomCode: 'ROOMA1', playerId, filename: 'owned.webm'
    });
    Recording.findByIdAndDelete.mockResolvedValue({ _id: recordingId });
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    const response = await request(app)
      .delete(`/api/recordings/${recordingId}`)
      .set('x-player-capability', 'p'.repeat(43));

    expect(response.status).toBe(200);
    expect(fs.unlink).toHaveBeenCalledWith(path.join(uploadDirectory, 'owned.webm'));
    expect(Recording.findByIdAndDelete).toHaveBeenCalledWith(recordingId);
  });

  test('allows the owning room host to delete a recording', async () => {
    mockRoom();
    mockPlayer();
    Recording.findById.mockResolvedValue({
      _id: recordingId, roomCode: 'ROOMA1', playerId, filename: 'host-deleted.webm'
    });
    Recording.findByIdAndDelete.mockResolvedValue({ _id: recordingId });
    jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    const response = await request(app)
      .delete(`/api/recordings/${recordingId}`)
      .set('x-room-host-capability', 'host-secret');

    expect(response.status).toBe(200);
    expect(Recording.findByIdAndDelete).toHaveBeenCalledWith(recordingId);
  });
});
