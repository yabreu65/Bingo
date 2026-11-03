const express = require('express');
const request = require('supertest');

jest.mock('../utils/roomActivity', () => ({ updateRoomActivity: jest.fn().mockResolvedValue(undefined) }));

const Room = require('../models/Room');
const roomRoutes = require('../routes/roomRoutes');
const { createHostCapabilityHash } = require('../middleware/socketAuthMiddleware');
const {
  createTvAuthorizationToken,
  hashTvAuthorizationToken
} = require('../utils/tvAuthorization');
const { stripGuestCapabilityHashes } = require('../utils/publicData');

const app = express();
app.use(express.json());
app.use('/api/rooms', roomRoutes);

const makeQuery = (value) => ({
  select: jest.fn(() => Promise.resolve(value)),
  populate: jest.fn(() => Promise.resolve(value))
});

const makeRoom = (overrides = {}) => {
  const room = {
    _id: 'room-tv-authorization',
    code: 'ROOMTV',
    isActive: true,
    hostCapabilityHash: createHostCapabilityHash('host-secret', 'room-tv-authorization'),
    tvAuthorization: null,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
  return room;
};

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('temporary TV authorization', () => {
  test('requires the room host capability and stores only a hash when generating a link', async () => {
    const room = makeRoom();
    jest.spyOn(Room, 'findOne').mockReturnValue(makeQuery(room));

    const response = await request(app)
      .post('/api/rooms/ROOMTV/tv-authorization')
      .set('x-room-host-capability', 'host-secret');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      roomCode: 'ROOMTV',
      tvToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expiresAt: expect.any(String)
    }));
    expect(room.tvAuthorization.linkTokenHash).toHaveLength(64);
    expect(room.tvAuthorization.linkTokenHash).not.toBe(response.body.tvToken);
    expect(room.save).toHaveBeenCalledTimes(1);
  });

  test('rejects generation without the organizer capability', async () => {
    const room = makeRoom();
    jest.spyOn(Room, 'findOne').mockReturnValue(makeQuery(room));

    const response = await request(app)
      .post('/api/rooms/ROOMTV/tv-authorization');

    expect(response.status).toBe(403);
    expect(room.save).not.toHaveBeenCalled();
  });

  test('consumes a link atomically and returns a distinct session token', async () => {
    const linkToken = createTvAuthorizationToken();
    const room = makeRoom({
      tvAuthorization: {
        linkTokenHash: hashTvAuthorizationToken(linkToken, 'room-tv-authorization'),
        linkExpiresAt: new Date(Date.now() + 60_000),
        linkClaimedAt: null,
        revokedAt: null
      }
    });
    const claimedRoom = { ...room };
    jest.spyOn(Room, 'findOne').mockReturnValue(makeQuery(room));
    jest.spyOn(Room, 'findOneAndUpdate').mockResolvedValue(claimedRoom);

    const response = await request(app)
      .post('/api/rooms/ROOMTV/tv-authorization/claim')
      .send({ token: linkToken });

    expect(response.status).toBe(200);
    expect(response.body.tvSessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body.tvSessionToken).not.toBe(linkToken);
    expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        'tvAuthorization.linkTokenHash': room.tvAuthorization.linkTokenHash,
        'tvAuthorization.linkClaimedAt': null
      }),
      expect.objectContaining({ $set: expect.objectContaining({
        'tvAuthorization.sessionTokenHash': expect.any(String)
      }) }),
      expect.objectContaining({ new: true, runValidators: true })
    );
  });

  test('allows only one of two concurrent claims to consume the same link', async () => {
    const linkToken = createTvAuthorizationToken();
    const room = makeRoom({
      tvAuthorization: {
        linkTokenHash: hashTvAuthorizationToken(linkToken, 'room-tv-authorization'),
        linkExpiresAt: new Date(Date.now() + 60_000),
        linkClaimedAt: null,
        revokedAt: null
      }
    });
    jest.spyOn(Room, 'findOne').mockReturnValue(makeQuery(room));
    jest.spyOn(Room, 'findOneAndUpdate')
      .mockResolvedValueOnce({ ...room })
      .mockResolvedValueOnce(null);

    const responses = await Promise.all([
      request(app).post('/api/rooms/ROOMTV/tv-authorization/claim').send({ token: linkToken }),
      request(app).post('/api/rooms/ROOMTV/tv-authorization/claim').send({ token: linkToken })
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(Room.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  test('rejects a second claim, an expired link, and a token from another room', async () => {
    const linkToken = createTvAuthorizationToken();
    const room = makeRoom({
      tvAuthorization: {
        linkTokenHash: hashTvAuthorizationToken(linkToken, 'different-room'),
        linkExpiresAt: new Date(Date.now() - 1),
        linkClaimedAt: null,
        revokedAt: null
      }
    });
    jest.spyOn(Room, 'findOne').mockReturnValue(makeQuery(room));
    jest.spyOn(Room, 'findOneAndUpdate').mockResolvedValue(null);

    const response = await request(app)
      .post('/api/rooms/ROOMTV/tv-authorization/claim')
      .send({ token: linkToken });

    expect(response.status).toBe(409);
    expect(response.body.error).not.toContain(linkToken);
  });

  test('renews only a live session and never accepts a player capability', async () => {
    const sessionToken = createTvAuthorizationToken();
    const room = makeRoom({
      tvAuthorization: {
        sessionTokenHash: hashTvAuthorizationToken(sessionToken, 'room-tv-authorization'),
        sessionExpiresAt: new Date(Date.now() + 60_000),
        revokedAt: null
      }
    });
    jest.spyOn(Room, 'findOne').mockReturnValue(makeQuery(room));
    jest.spyOn(Room, 'findOneAndUpdate').mockResolvedValue(room);

    const response = await request(app)
      .post('/api/rooms/ROOMTV/tv-authorization/renew')
      .set('x-tv-session-token', sessionToken);

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('tvSessionToken');

    const invalidResponse = await request(app)
      .post('/api/rooms/ROOMTV/tv-authorization/renew')
      .set('x-tv-session-token', 'player-capability');
    expect(invalidResponse.status).toBe(401);
    expect(Room.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test('revokes the pending link and active session without returning secrets', async () => {
    const room = makeRoom({
      tvAuthorization: {
        linkTokenHash: 'a'.repeat(64),
        sessionTokenHash: 'b'.repeat(64),
        sessionExpiresAt: new Date(Date.now() + 60_000)
      }
    });
    jest.spyOn(Room, 'findOne').mockReturnValue(makeQuery(room));

    const response = await request(app)
      .post('/api/rooms/ROOMTV/tv-authorization/revoke')
      .set('x-room-host-capability', 'host-secret');

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('tvToken');
    expect(response.body).not.toHaveProperty('tvSessionToken');
    expect(room.tvAuthorization.linkTokenHash).toBeUndefined();
    expect(room.tvAuthorization.sessionTokenHash).toBeUndefined();
    expect(room.tvAuthorization.revokedAt).toBeInstanceOf(Date);
  });

  test('never exposes temporary authorization fields through public room data', () => {
    const safe = stripGuestCapabilityHashes({
      code: 'ROOMTV',
      tvAuthorization: { linkTokenHash: 'secret-hash', sessionTokenHash: 'session-hash' },
      config: { eventMode: 'REMOTE_PRESENTIAL' }
    });

    expect(safe).toEqual({ code: 'ROOMTV', config: { eventMode: 'REMOTE_PRESENTIAL' } });
  });
});
