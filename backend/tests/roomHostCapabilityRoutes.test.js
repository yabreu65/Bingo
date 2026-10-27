const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('../utils/roomActivity', () => ({ updateRoomActivity: jest.fn().mockResolvedValue(undefined) }));
const Room = require('../models/Room');
const Player = require('../models/Player');
const User = require('../models/User');
const Game = require('../models/Game');
const { createHostCapabilityHash } = require('../middleware/socketAuthMiddleware');
const roomRoutes = require('../routes/roomRoutes');
const gameRoutes = require('../routes/gameRoutes');

const app = express();
app.use(express.json());
app.use('/api/rooms', roomRoutes);
app.use('/api/games', gameRoutes);

describe('room host capability REST flow', () => {
  let savedRooms;
  let originalJwtSecret;

  beforeEach(() => {
    originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-only-room-capability-secret';
    savedRooms = [];
    jest.spyOn(Room, 'generateUniqueCode').mockResolvedValue('ABC123');
    jest.spyOn(Room.prototype, 'save').mockImplementation(async function saveRoom() {
      savedRooms.push({ id: this._id, hostCapabilityHash: this.hostCapabilityHash });
      return this;
    });
    jest.spyOn(Room.prototype, 'populate').mockImplementation(function populateRoom() {
      return Promise.resolve(this);
    });
    jest.spyOn(Player.prototype, 'save').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  test('issues the room creator a secret and stores only its room-bound hash', async () => {
    const response = await request(app)
      .post('/api/rooms/create')
      .send({ hostName: 'Organizer', roomName: 'Test room' });

    expect(response.status).toBe(200);
    expect(response.body.hostCapability).toEqual(expect.any(String));
    expect(response.body.hostCapability).toHaveLength(43);
    expect(response.body.room.hostCapabilityHash).toBeUndefined();
    expect(savedRooms).toHaveLength(1);
    expect(savedRooms[0].hostCapabilityHash).toBe(
      createHostCapabilityHash(response.body.hostCapability, savedRooms[0].id)
    );
  });

  test('rejects config changes without the room capability and leaves config unchanged', async () => {
    const room = {
      _id: 'room-a',
      config: { tieBreakEnabled: false },
      save: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(Room, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(room) });

    const response = await request(app)
      .patch('/api/rooms/ABC123/config')
      .send({ config: { tieBreakEnabled: true } });

    expect(response.status).toBe(403);
    expect(room.config.tieBreakEnabled).toBe(false);
    expect(room.save).not.toHaveBeenCalled();
  });

  test('rejects manual-card assignment without capability and leaves room unchanged', async () => {
    const room = {
      _id: 'room-a',
      manualPlayers: [],
      reservedCards: [],
      save: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(Room, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(room) });

    const response = await request(app)
      .post('/api/rooms/ABC123/assign-manual-card')
      .send({ playerName: 'Manual player', cardNumber: 186 });

    expect(response.status).toBe(403);
    expect(room.manualPlayers).toHaveLength(0);
    expect(room.reservedCards).toHaveLength(0);
    expect(room.save).not.toHaveBeenCalled();
  });

  test('rejects manual-card removal without capability and leaves room unchanged', async () => {
    const player = { playerId: 'manual-1', playerName: 'Manual player', cardNumber: 186 };
    const room = {
      _id: 'room-a',
      manualPlayers: [player],
      reservedCards: [186],
      save: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(Room, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(room) });

    const response = await request(app)
      .delete('/api/rooms/ABC123/manual-players/manual-1');

    expect(response.status).toBe(403);
    expect(room.manualPlayers).toEqual([player]);
    expect(room.reservedCards).toEqual([186]);
    expect(room.save).not.toHaveBeenCalled();
  });

  test('allows the room capability to remove a manual player and release its card', async () => {
    const capability = 'remove-secret';
    const manualPlayer = { playerId: 'manual-1', playerName: 'Manual player', cardNumber: 186 };
    const room = {
      _id: 'room-a',
      hostCapabilityHash: createHostCapabilityHash(capability, 'room-a'),
      manualPlayers: [manualPlayer],
      reservedCards: [186],
      save: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(Room, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(room) });

    const response = await request(app)
      .delete('/api/rooms/ABC123/manual-players/manual-1')
      .set('x-room-host-capability', capability);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ freedCard: 186 })
    }));
    expect(room.manualPlayers).toEqual([]);
    expect(room.reservedCards).toEqual([]);
    expect(room.save).toHaveBeenCalledTimes(1);
  });

  test('rejects REST game start without room capability before creating or starting a game', async () => {
    const room = {
      _id: 'room-a',
      hostCapabilityHash: createHostCapabilityHash('host-secret', 'room-a'),
      save: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(Room, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue(room) });
    jest.spyOn(Game.prototype, 'save').mockResolvedValue(undefined);

    const response = await request(app)
      .post('/api/games/start')
      .send({ roomId: room._id });

    expect(response.status).toBe(403);
    expect(Game.prototype.save).not.toHaveBeenCalled();
    expect(room.gameState).toBeUndefined();
    expect(room.save).not.toHaveBeenCalled();
  });

  test('accepts the room capability for REST game start', async () => {
    const capability = 'start-secret';
    const room = {
      _id: 'room-a',
      hostCapabilityHash: createHostCapabilityHash(capability, 'room-a'),
      save: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(Room, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue(room) });
    jest.spyOn(Game.prototype, 'save').mockResolvedValue(undefined);

    const response = await request(app)
      .post('/api/games/start')
      .set('x-room-host-capability', capability)
      .send({ roomId: room._id });

    expect(response.status).toBe(200);
    expect(Game.prototype.save).toHaveBeenCalledTimes(1);
    expect(room.gameState).toBe('playing');
    expect(room.save).toHaveBeenCalledTimes(1);
  });

  test('preserves the authenticated admin authorization path for configuration changes', async () => {
    const room = {
      _id: 'room-a',
      config: { tieBreakEnabled: false },
      save: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(Room, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(room) });
    jest.spyOn(User, 'findById').mockResolvedValue({
      _id: 'admin-1',
      role: 'admin',
      isActive: true
    });
    const adminToken = jwt.sign({ userId: 'admin-1' }, process.env.JWT_SECRET);

    const response = await request(app)
      .patch('/api/rooms/ABC123/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ config: { tieBreakEnabled: true } });

    expect(response.status).toBe(200);
    expect(room.config.tieBreakEnabled).toBe(true);
    expect(room.save).toHaveBeenCalledTimes(1);
  });

  test('accepts the room capability for configuration changes', async () => {
    const capability = 'config-secret';
    const room = {
      _id: 'room-a',
      hostCapabilityHash: createHostCapabilityHash(capability, 'room-a'),
      config: { tieBreakEnabled: false },
      save: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(Room, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(room) });

    const response = await request(app)
      .patch('/api/rooms/ABC123/config')
      .set('x-room-host-capability', capability)
      .send({ config: { tieBreakEnabled: true } });

    expect(response.status).toBe(200);
    expect(room.config.tieBreakEnabled).toBe(true);
    expect(room.save).toHaveBeenCalledTimes(1);
    expect(response.body.room.hostCapabilityHash).toBeUndefined();
  });
});
