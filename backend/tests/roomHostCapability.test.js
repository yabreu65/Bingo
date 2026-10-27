jest.mock('../models/Room', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/Player');
jest.mock('../utils/roomActivity', () => ({ updateRoomActivity: jest.fn() }));

const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const {
  createHostCapabilityHash,
  isRoomHost
} = require('../middleware/socketAuthMiddleware');
const {
  handleStartGame,
  handlePauseGame,
  handleResumeGame,
  handleGameStateChange,
  handleResetGame,
  handleLaunchEvent,
  handleStartCountdown
} = require('../socket/handlers/gameHandlers');
const {
  handleMusicPlay,
  handleMusicPause,
  handleMusicSongChange,
  handleMusicVolumeChange
} = require('../socket/handlers/musicHandlers');
const { handleCloseRoom, handleKickPlayer } = require('../socket/handlers/roomHandlers');
const {
  handleCallNumber,
  handleStartTiebreakPerformance,
  handleStartTiebreakVoting,
  handleVerifyBingoManual
} = require('../socket/handlers/bingoHandlers');

const emitted = jest.fn();
const io = { to: jest.fn(() => ({ emit: emitted })) };
const makeRoom = (code = 'ROOM01', id = 'room-a') => ({
  _id: id,
  code,
  hostCapabilityHash: createHostCapabilityHash('room-secret', id),
  gameState: 'waiting',
  config: { timeBetweenNumbers: 30 },
  save: jest.fn().mockResolvedValue(undefined)
});
const makeSocket = (id = 'guest') => ({
  id,
  user: null,
  emit: jest.fn()
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Game.prototype, 'save').mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('room-bound guest host capability', () => {
  test('authorizes the creator capability only for its room', async () => {
    const room = makeRoom();

    expect(await isRoomHost(makeSocket(), room, 'room-secret')).toBe(true);
    expect(await isRoomHost(makeSocket(), room, 'wrong-secret')).toBe(false);
    expect(await isRoomHost(makeSocket(), { ...room, _id: 'room-b' }, 'room-secret')).toBe(false);
  });

  test('does not use the authenticated-player fallback for guests without a capability', async () => {
    const room = { ...makeRoom(), players: [{ _id: 'host-player' }] };
    Player.findOne.mockResolvedValue({ _id: 'host-player', isHost: true });

    expect(await isRoomHost(makeSocket(), room)).toBe(false);
    expect(Player.findOne).not.toHaveBeenCalled();
  });

  test('preserves authenticated player and admin host authorization', async () => {
    const room = { ...makeRoom(), players: [{ _id: 'host-player' }] };
    Player.findOne.mockResolvedValue({ _id: 'host-player', isHost: true });

    expect(await isRoomHost({ user: { userId: 'user-1', role: 'host' } }, room)).toBe(true);
    expect(Player.findOne).toHaveBeenCalledWith({ room: room._id, isHost: true, user: 'user-1' });
    expect(await isRoomHost({ user: { userId: 'admin-1', role: 'admin' } }, room)).toBe(true);
  });

  test('allows the guest organizer to start the game with the issued capability', async () => {
    jest.useFakeTimers();
    const room = makeRoom();
    Room.findOne.mockResolvedValue(room);

    await handleStartGame(io, makeSocket())({ roomCode: room.code, hostCapability: 'room-secret' });

    expect(Game.prototype.save).toHaveBeenCalledTimes(1);
    expect(room.gameState).toBe('playing');
    expect(room.save).toHaveBeenCalledTimes(1);
    expect(io.to).toHaveBeenCalledWith(room.code);
  });

  test('allows the guest organizer to pause and resume with the issued capability', async () => {
    const room = makeRoom();
    room.gameState = 'playing';
    Room.findOne.mockResolvedValue(room);
    const socket = makeSocket();
    const request = { roomCode: room.code, hostCapability: 'room-secret' };

    await handlePauseGame(io, socket)(request);
    expect(room.gameState).toBe('paused');
    await handleResumeGame(io, socket)(request);

    expect(room.gameState).toBe('playing');
    expect(room.save).toHaveBeenCalledTimes(2);
    expect(io.to).toHaveBeenCalledWith(room.code);
  });

  test.each([
    ['missing capability', undefined],
    ['invalid capability', 'not-the-secret'],
    ['capability from another room', 'room-secret']
  ])('rejects %s from pausing or resuming without side effects', async (label, capability) => {
    const room = makeRoom();
    room.gameState = 'playing';
    Room.findOne.mockResolvedValue(room);
    const socket = makeSocket(label);
    const pause = handlePauseGame(io, socket);
    const resume = handleResumeGame(io, socket);
    const request = { roomCode: room.code, hostCapability: capability };
    if (label === 'capability from another room') {
      room._id = 'target-room';
    }

    await pause(request);
    await resume(request);

    expect(room.gameState).toBe('playing');
    expect(room.save).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledTimes(2);
  });

  test('rejects unauthorized game-state changes before mutation or broadcast', async () => {
    const room = makeRoom();
    Room.findOne.mockResolvedValue(room);
    const socket = makeSocket('ordinary-player');

    await handleGameStateChange(io, socket)({ roomCode: room.code, state: 'paused' });

    expect(room.gameState).toBe('waiting');
    expect(room.save).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });

  test('rejects unauthorized close-room before disconnection, deletion, or broadcast', async () => {
    const player = { _id: 'player-a', socketId: 'player-socket', isConnected: true };
    const room = { ...makeRoom(), players: [player], currentGame: 'game-a' };
    Room.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(room) });
    const socket = makeSocket('ordinary-player');

    await handleCloseRoom(io, socket)({ roomCode: room.code });

    expect(player.isConnected).toBe(true);
    expect(room.save).not.toHaveBeenCalled();
    expect(Player.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });

  test('rejects unauthorized launch-event before broadcasting', async () => {
    const room = { ...makeRoom(), players: [], manualPlayers: [] };
    Room.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(room) });
    const socket = makeSocket('ordinary-player');

    await handleLaunchEvent(io, socket)({ roomCode: room.code, type: 'cartonazo' });

    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });

  test('does not broadcast reset when the room does not exist', async () => {
    Room.findOne.mockResolvedValue(null);
    const socket = makeSocket('guest');

    await handleResetGame(io, socket)({ roomCode: 'MISSING' });

    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });

  test.each([
    ['reset-game', handleResetGame, { currentGame: 'game-1' }],
    ['start-countdown', handleStartCountdown, {}]
  ])('rejects unauthorized %s before mutation or broadcast', async (eventName, handler, overrides) => {
    const room = { ...makeRoom(), ...overrides };
    Room.findOne.mockResolvedValue(room);
    const socket = makeSocket('ordinary-player');

    await handler(io, socket)({ roomCode: room.code });

    expect(room.save).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });

  test.each([
    ['music-play', handleMusicPlay, { songId: 7 }],
    ['music-pause', handleMusicPause, { currentTime: 12 }],
    ['music-song-change', handleMusicSongChange, { songId: 8 }],
    ['music-volume-change', handleMusicVolumeChange, { volume: 0.8 }]
  ])('rejects unauthorized %s before mutation or broadcast', async (eventName, handler, action) => {
    const room = { ...makeRoom(), musicState: { isPlaying: false, currentSongId: 1, volume: 0.5 } };
    Room.findOne.mockResolvedValue(room);
    const socket = makeSocket('ordinary-player');

    await handler(io, socket)({ roomCode: room.code, ...action });

    expect(room.save).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });

  test('rejects unauthorized manual number call before changing game or broadcasting', async () => {
    const room = makeRoom();
    room.currentGame = 'game-1';
    Room.findOne.mockResolvedValue(room);
    const findGame = jest.spyOn(Game, 'findById').mockResolvedValue({ save: jest.fn() });
    const socket = makeSocket('ordinary-player');

    await handleCallNumber(io, socket)({ roomCode: room.code, number: 42 });

    expect(findGame).not.toHaveBeenCalled();
    expect(room.save).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });

  test('rejects unauthorized tie-break controls before confirming or changing game state', async () => {
    const room = makeRoom();
    Room.findOne.mockResolvedValue(room);
    const findGame = jest.spyOn(Game, 'findById').mockResolvedValue({ tieBreakActive: true });
    const socket = makeSocket('ordinary-player');

    await handleStartTiebreakPerformance(io, socket)({ roomCode: room.code, performerId: 'p1' });
    await handleStartTiebreakVoting(io, socket)({ roomCode: room.code });

    expect(findGame).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalledWith('tiebreak-performance-confirmed', expect.anything());
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });

  test('rejects manual-BINGO verification before finishing a game or announcing a winner', async () => {
    const room = makeRoom();
    Room.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(room) });
    const findGame = jest.spyOn(Game, 'findById').mockResolvedValue({ save: jest.fn() });
    const socket = makeSocket('ordinary-player');

    await handleVerifyBingoManual(io, socket)({
      roomCode: room.code,
      playerName: 'Fake winner',
      cardNumber: 186,
      playerId: 'manual-player'
    });

    expect(findGame).not.toHaveBeenCalled();
    expect(room.gameState).toBe('waiting');
    expect(room.save).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });

  test('rejects unauthorized kick before loading or mutating a player', async () => {
    const room = makeRoom();
    Room.findOne.mockResolvedValue(room);
    const socket = makeSocket('ordinary-player');

    await handleKickPlayer(io, socket)({ roomCode: room.code, playerId: 'player-target' });

    expect(room.save).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });

  test('does not let a host kick a player who belongs to another room', async () => {
    const hostRoom = makeRoom('ROOM01', 'room-a');
    const target = {
      _id: 'player-b',
      room: 'room-b',
      socketId: 'socket-b',
      isConnected: true,
      save: jest.fn().mockResolvedValue(undefined)
    };
    Room.findOne.mockResolvedValue(hostRoom);
    jest.spyOn(Player, 'findById').mockResolvedValue(target);
    const socket = makeSocket('host');

    await handleKickPlayer(io, socket)({
      roomCode: hostRoom.code,
      playerId: target._id,
      hostCapability: 'room-secret'
    });

    expect(target.isConnected).toBe(true);
    expect(target.save).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  test('rejects start when a player or guest supplies only client room identity', async () => {
    const room = makeRoom();
    Room.findOne.mockResolvedValue(room);
    const socket = makeSocket('ordinary-player');

    await handleStartGame(io, socket)({ roomCode: room.code, playerId: 'host-player-id' });

    expect(Game.prototype.save).not.toHaveBeenCalled();
    expect(room.gameState).toBe('waiting');
    expect(room.save).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
  });
});
