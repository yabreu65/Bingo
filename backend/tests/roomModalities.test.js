const express = require('express');
const request = require('supertest');

jest.mock('../utils/roomActivity', () => ({ updateRoomActivity: jest.fn().mockResolvedValue(undefined) }));

const Room = require('../models/Room');
const Player = require('../models/Player');
const roomRoutes = require('../routes/roomRoutes');
const {
  EVENT_MODES,
  normalizeNewRoomConfig,
  resolveEventMode,
  resolveMultimediaPolicy
} = require('../utils/roomConfiguration');

const app = express();
app.use(express.json());
app.use('/api/rooms', roomRoutes);

describe('event modality configuration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('resolves an old room without eventMode as LEGACY without mutating its config', () => {
    const config = { timeBetweenNumbers: 30 };

    expect(resolveEventMode(config)).toBe(EVENT_MODES.LEGACY);
    expect(resolveMultimediaPolicy(config)).toBeNull();
    expect(config).toEqual({ timeBetweenNumbers: 30 });
  });

  test.each([
    ['LOCAL', 'tv'],
    ['REMOTE_PRESENTIAL', 'tv'],
    ['DISTRIBUTED', 'both']
  ])('normalizes a new %s room with a compatible multimedia policy', (eventMode, primarySurface) => {
    const config = normalizeNewRoomConfig({ eventMode });

    expect(config).toMatchObject({
      eventMode,
      multimediaPolicy: {
        primarySurface,
        tvMediaSource: 'SERVER',
        playerPlayback: 'optional',
        allowExternalSources: false
      }
    });
  });

  test('creation defaults to selectable LOCAL without changing playback behavior', async () => {
    jest.spyOn(Room, 'generateUniqueCode').mockResolvedValue('MOD123');
    jest.spyOn(Room.prototype, 'save').mockResolvedValue(undefined);
    jest.spyOn(Room.prototype, 'populate').mockImplementation(function populateRoom() {
      return Promise.resolve(this);
    });
    jest.spyOn(Player.prototype, 'save').mockResolvedValue(undefined);

    const response = await request(app)
      .post('/api/rooms/create')
      .send({ hostName: 'Organizer', roomName: 'Modalities' });

    expect(response.status).toBe(200);
    expect(response.body.room.config).toMatchObject({
      gameMode: 'line',
      gameModes: ['line', 'fourCorners', 'centralCross'],
      eventMode: 'LOCAL',
      multimediaPolicy: {
        primarySurface: 'tv',
        tvMediaSource: 'SERVER',
        playerPlayback: 'optional',
        allowExternalSources: false
      }
    });
  });

  test('rejects LEGACY as a selectable REST eventMode', async () => {
    const response = await request(app)
      .post('/api/rooms/create')
      .send({
        hostName: 'Organizer',
        config: { eventMode: 'LEGACY' }
      });

    expect(response.status).toBe(400);
  });

  test('allows LOCAL_TV only for REMOTE_PRESENTIAL and keeps other modes on SERVER', () => {
    expect(resolveMultimediaPolicy({
      eventMode: 'REMOTE_PRESENTIAL',
      multimediaPolicy: { tvMediaSource: 'LOCAL_TV' }
    })).toMatchObject({
      tvMediaSource: 'LOCAL_TV',
      primarySurface: 'tv'
    });

    expect(resolveMultimediaPolicy({
      eventMode: 'LOCAL',
      multimediaPolicy: { tvMediaSource: 'LOCAL_TV' }
    }).tvMediaSource).toBe('SERVER');
  });

  test('normalizes a partial explicit policy over its mode defaults', () => {
    expect(normalizeNewRoomConfig({
      eventMode: 'REMOTE_PRESENTIAL',
      multimediaPolicy: { tvMediaSource: 'LOCAL_TV' }
    })).toMatchObject({
      eventMode: 'REMOTE_PRESENTIAL',
      multimediaPolicy: {
        primarySurface: 'tv',
        tvMediaSource: 'LOCAL_TV',
        playerPlayback: 'optional',
        allowExternalSources: false
      }
    });
  });
});
