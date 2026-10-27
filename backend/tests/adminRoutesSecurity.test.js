const express = require('express');
const request = require('supertest');
const Room = require('../models/Room');
const AdminContent = require('../models/AdminContent');
const Playlist = require('../models/Playlist');
const Prize = require('../models/Prize');
const adminRoutes = require('../routes/adminRoutes');
const { createHostCapabilityHash } = require('../middleware/socketAuthMiddleware');

const ROOM_ID = '507f1f77bcf86cd799439011';
const app = express();
app.use(express.json());
app.use('/api/admin/rooms/:code', adminRoutes);

describe('administrative catalog authorization', () => {
  const capability = 'admin-room-secret';
  let room;
  beforeEach(() => {
    room = { _id: ROOM_ID, hostCapabilityHash: createHostCapabilityHash(capability, ROOM_ID), config: {}, save: jest.fn().mockResolvedValue(undefined) };
    jest.spyOn(Room, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(room) });
    jest.spyOn(AdminContent.prototype, 'save').mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  test('rejects clients without a room-host capability', async () => {
    const response = await request(app).post('/api/admin/rooms/ABC123/contents').send({ kind: 'dance', statement: 'Baila' });
    expect(response.status).toBe(403);
    expect(AdminContent.prototype.save).not.toHaveBeenCalled();
  });
  test('allows the room organizer to create validated content', async () => {
    const response = await request(app).post('/api/admin/rooms/ABC123/contents').set('x-room-host-capability', capability).send({ kind: 'trivia', statement: 'Pregunta', options: ['A', 'B'], correctAnswer: 1 });
    expect(response.status).toBe(201);
    expect(response.body.item.correctAnswer).toBe(1);
    expect(room.config.managedContentEnabled).toBe(true);
  });
  test('never partially imports invalid rows', async () => {
    const insertMany = jest.spyOn(AdminContent, 'insertMany');
    const response = await request(app).post('/api/admin/rooms/ABC123/contents/import').set('x-room-host-capability', capability).send({ format: 'json', items: [{ kind: 'dance', statement: 'Válida' }, { kind: 'trivia', statement: 'Inválida', options: ['solo una'], correctAnswer: 0 }] });
    expect(response.status).toBe(422);
    expect(insertMany).not.toHaveBeenCalled();
  });

  test('does not create a playlist with tracks from another room', async () => {
    const create = jest.spyOn(Playlist, 'create');
    jest.spyOn(AdminContent, 'find').mockResolvedValue([]);

    const response = await request(app)
      .post('/api/admin/rooms/ABC123/playlists')
      .set('x-room-host-capability', capability)
      .send({ name: 'Playlist privada', trackIds: ['507f1f77bcf86cd799439012'] });

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  test('activates a room playlist without changing another room', async () => {
    const playlist = { _id: '507f1f77bcf86cd799439012', name: 'Noche', enabled: true };
    jest.spyOn(Playlist, 'findOne').mockResolvedValue(playlist);

    const response = await request(app)
      .post('/api/admin/rooms/ABC123/playlists/507f1f77bcf86cd799439012/activate')
      .set('x-room-host-capability', capability);

    expect(response.status).toBe(200);
    expect(room.config.activePlaylist).toBe(playlist._id);
    expect(room.save).toHaveBeenCalled();
  });

  test('delivers a prize atomically and rejects a duplicate player delivery', async () => {
    const prize = {
      deliveries: [{ deliveryId: 'delivery-1', playerId: 'player-1', playerName: 'Ana' }],
      remaining: 0
    };
    const findOneAndUpdate = jest.spyOn(Prize, 'findOneAndUpdate').mockResolvedValue(prize);

    const response = await request(app)
      .post('/api/admin/rooms/ABC123/prizes/507f1f77bcf86cd799439012/deliveries')
      .set('x-room-host-capability', capability)
      .send({ playerId: 'player-1', playerName: 'Ana' });

    expect(response.status).toBe(201);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ 'deliveries.playerId': { $ne: 'player-1' } }),
      expect.objectContaining({ $inc: { remaining: -1 } }),
      expect.objectContaining({ new: true, runValidators: true })
    );

    findOneAndUpdate.mockResolvedValueOnce(null);
    const duplicate = await request(app)
      .post('/api/admin/rooms/ABC123/prizes/507f1f77bcf86cd799439012/deliveries')
      .set('x-room-host-capability', capability)
      .send({ playerId: 'player-1', playerName: 'Ana' });

    expect(duplicate.status).toBe(409);
  });
});
