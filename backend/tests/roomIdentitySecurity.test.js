jest.mock('../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../models/Player', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn()
}));
jest.mock('../models/Game', () => ({ findById: jest.fn() }));
jest.mock('../socket/utils/roomTimer', () => ({ clearAllRoomTimers: jest.fn(), ensureWatchdog: jest.fn() }));
jest.mock('../socket/handlers/gameHandlers', () => ({
  immediateNextNumber: jest.fn(),
  scheduleRoomInterval: jest.fn()
}));
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  logRoomEvent: jest.fn(),
  logSocketEvent: jest.fn()
}));

const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const { createHostCapabilityHash } = require('../middleware/socketAuthMiddleware');
const { createPlayerCapabilityHash } = require('../utils/playerCapability');
const { handleDisconnect, handleJoinRoom, handleLeaveRoom } = require('../socket/handlers/roomHandlers');
const logger = require('../config/logger');

const emitted = jest.fn();
const io = { to: jest.fn(() => ({ emit: emitted })), sockets: { sockets: new Map() } };
const populateRoom = (room) => {
  const query = {
    select: jest.fn(() => query),
    populate: jest.fn().mockResolvedValue(room)
  };
  return query;
};
const makeSocket = (id = 'socket-1') => ({
  id,
  join: jest.fn(),
  leave: jest.fn(),
  disconnect: jest.fn(),
  emit: jest.fn()
});
const makeLivePlayer = ({
  roomId = 'room-a', roomCode = 'ROOMA', isHost = true, storedCapability = 'room-host-secret',
  oldRoomCode = roomCode, oldPlayerId, oldSocketLive = true
} = {}) => {
  const playerId = `player-${roomId}`;
  const room = {
    _id: roomId,
    code: roomCode,
    host: playerId,
    hostCapabilityHash: createHostCapabilityHash(storedCapability, roomId),
    players: []
  };
  const guestCapability = 'g'.repeat(43);
  const player = {
    _id: playerId,
    room: roomId,
    isHost,
    socketId: 'old-host-socket',
    isConnected: true,
    guestCapabilityHash: createPlayerCapabilityHash(guestCapability, roomId, playerId)
  };
  room.players = [player];
  const oldSocket = makeSocket(player.socketId);
  oldSocket.roomCode = oldRoomCode;
  oldSocket.playerId = oldPlayerId || player._id;
  if (oldSocketLive) io.sockets.sockets.set(oldSocket.id, oldSocket);
  Room.findOne.mockReturnValue(populateRoom(room));
  Player.findById.mockResolvedValue(player);
  return { room, player, oldSocket };
};

beforeEach(() => {
  jest.clearAllMocks();
  io.to.mockImplementation(() => ({ emit: emitted }));
  io.sockets.sockets.clear();
});

describe('room socket identity boundaries', () => {
  test('does not send internal database errors to a socket join client', async () => {
    const internalError = new Error('mongodb://private.internal/database credentials=secret');
    const query = {
      select: jest.fn(() => query),
      populate: jest.fn().mockRejectedValue(internalError)
    };
    Room.findOne.mockReturnValue(query);
    const socket = makeSocket();
    const callback = jest.fn();

    await handleJoinRoom(io, socket)({ roomCode: 'ROOMA', playerId: 'tv-display' }, callback);

    expect(JSON.stringify(socket.emit.mock.calls)).not.toContain('private.internal');
    expect(JSON.stringify(callback.mock.calls)).not.toContain('private.internal');
    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'No se pudo ingresar a la sala' });
    expect(callback).toHaveBeenCalledWith({ success: false, error: 'No se pudo ingresar a la sala' });
  });

  test('rejects leaving a different room than the socket joined', async () => {
    const socket = makeSocket();
    socket.roomCode = 'ROOMA';
    socket.playerId = 'player-a';

    await handleLeaveRoom(io, socket)({ roomCode: 'ROOMB' });

    expect(socket.leave).not.toHaveBeenCalled();
    expect(Player.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(Room.findOne).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'No tienes permisos para dejar esta sala' });
  });

  test('releases room ownership on leave so a new socket can reclaim the player', async () => {
    const room = { _id: 'room-a', code: 'ROOMA', players: [] };
    const capability = 'g'.repeat(43);
    const player = {
      _id: 'player-a', room: room._id, socketId: 'socket-1', isConnected: true, isHost: false,
      guestCapabilityHash: createPlayerCapabilityHash(capability, room._id, 'player-a')
    };
    room.players = [player];
    Room.findOne.mockReturnValue(populateRoom(room));
    Player.findOneAndUpdate
      .mockResolvedValueOnce({ ...player, socketId: null, isConnected: false })
      .mockResolvedValueOnce({ ...player, socketId: 'socket-2', isConnected: true });
    Player.findById.mockResolvedValue({ ...player, socketId: null, isConnected: false });
    const socket = makeSocket('socket-1');
    socket.roomCode = room.code;
    socket.playerId = player._id;

    await handleLeaveRoom(io, socket)({ roomCode: room.code });

    expect(Player.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { _id: player._id, room: room._id, socketId: socket.id },
      { $set: { isConnected: false, socketId: null } },
      { new: true }
    );
    expect(socket.leave).toHaveBeenCalledWith(room.code);
    expect(socket.roomCode).toBeUndefined();
    expect(socket.playerId).toBeUndefined();
    expect(io.to).toHaveBeenCalledWith(room.code);
    expect(emitted).toHaveBeenCalledWith('player-left', expect.objectContaining({ playerId: player._id }));

    const broadcastsAfterLeave = io.to.mock.calls.length;
    await handleLeaveRoom(io, socket)({ roomCode: room.code });
    expect(io.to).toHaveBeenCalledTimes(broadcastsAfterLeave);
    expect(socket.leave).toHaveBeenCalledTimes(1);

    const newSocket = makeSocket('socket-2');
    const callback = jest.fn();
    await handleJoinRoom(io, newSocket)({ roomCode: room.code, playerId: player._id, playerCapability: capability }, callback);

    expect(Player.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      {
        _id: player._id,
        room: room._id,
        isHost: false,
        guestCapabilityHash: player.guestCapabilityHash,
        $or: [{ socketId: { $exists: false } }, { socketId: null }]
      },
      { $set: { socketId: newSocket.id, isConnected: true } },
      { new: true }
    );
    expect(newSocket.join).toHaveBeenCalledWith(room.code);
    expect(callback).toHaveBeenCalledWith({ success: true, roomCode: room.code, playerId: player._id });
  });

  test('rejects a stale same-room leave without changing ownership or broadcasting', async () => {
    const room = { _id: 'room-a', code: 'ROOMA', players: [] };
    Room.findOne.mockReturnValue(populateRoom(room));
    Player.findOneAndUpdate.mockResolvedValue(null);
    const socket = makeSocket('stale-socket');
    socket.roomCode = room.code;
    socket.playerId = 'player-a';

    await handleLeaveRoom(io, socket)({ roomCode: room.code });

    expect(Player.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: socket.playerId, room: room._id, socketId: socket.id },
      { $set: { isConnected: false, socketId: null } },
      { new: true }
    );
    expect(socket.leave).not.toHaveBeenCalled();
    expect(socket.roomCode).toBe(room.code);
    expect(socket.playerId).toBe('player-a');
    expect(Room.findOne).toHaveBeenCalledTimes(1);
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'No tienes permisos para dejar esta sala' });
  });

  test('rejects joining a room with a player ID that belongs to another room', async () => {
    const roomA = { _id: 'room-a', code: 'ROOMA', players: [] };
    const playerB = { _id: 'player-b', room: 'room-b', isConnected: false };
    Room.findOne.mockReturnValue(populateRoom(roomA));
    Player.findById.mockResolvedValue(playerB);
    const socket = makeSocket();
    const callback = jest.fn();

    await handleJoinRoom(io, socket)({ roomCode: roomA.code, playerId: playerB._id }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.join).not.toHaveBeenCalled();
    expect(Player.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  test('rejects reusing one socket to join a second room', async () => {
    const roomB = { _id: 'room-b', code: 'ROOMB', players: [] };
    const playerB = { _id: 'player-b', room: roomB._id, isConnected: false };
    Room.findOne.mockReturnValue(populateRoom(roomB));
    Player.findById.mockResolvedValue(playerB);
    Player.findOneAndUpdate.mockResolvedValue({ ...playerB, socketId: 'socket-1', isConnected: true });
    const socket = makeSocket();
    socket.roomCode = 'ROOMA';
    socket.playerId = 'player-a';
    const callback = jest.fn();

    await handleJoinRoom(io, socket)({ roomCode: roomB.code, playerId: playerB._id }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(Player.findOneAndUpdate).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  test('rejects rebinding one socket to another player in the same room', async () => {
    const room = { _id: 'room-a', code: 'ROOMA', players: [] };
    const playerB = { _id: 'player-b', room: room._id, isConnected: false };
    Room.findOne.mockReturnValue(populateRoom(room));
    Player.findById.mockResolvedValue(playerB);
    Player.findOneAndUpdate.mockResolvedValue({ ...playerB, socketId: 'socket-1', isConnected: true });
    const socket = makeSocket();
    socket.roomCode = room.code;
    socket.playerId = 'player-a';
    const callback = jest.fn();

    await handleJoinRoom(io, socket)({ roomCode: room.code, playerId: playerB._id }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(Player.findOneAndUpdate).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  test('allows a room member to claim their socket and join', async () => {
    const room = { _id: 'room-a', code: 'ROOMA', players: [] };
    const capability = 'g'.repeat(43);
    const player = {
      _id: 'player-a', room: room._id, isConnected: false, isHost: false,
      guestCapabilityHash: createPlayerCapabilityHash(capability, room._id, 'player-a')
    };
    room.players = [player];
    Room.findOne.mockImplementation(() => populateRoom(room));
    Player.findById.mockResolvedValue(player);
    Player.findOneAndUpdate.mockResolvedValue({ ...player, socketId: 'socket-1', isConnected: true });
    const socket = makeSocket();
    const callback = jest.fn();

    await handleJoinRoom(io, socket)({ roomCode: room.code, playerId: player._id, playerCapability: capability }, callback);

    expect(Player.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: player._id,
        room: room._id,
        isHost: false,
        guestCapabilityHash: player.guestCapabilityHash,
        $or: [{ socketId: { $exists: false } }, { socketId: null }]
      },
      { $set: { socketId: socket.id, isConnected: true } },
      { new: true }
    );
    expect(socket.join).toHaveBeenCalledWith(room.code);
    expect(callback).toHaveBeenCalledWith({ success: true, roomCode: room.code, playerId: player._id });
  });

  test('rejects claiming a player identity already owned by another live socket', async () => {
    const room = { _id: 'room-a', code: 'ROOMA', players: [] };
    const capability = 'g'.repeat(43);
    const player = {
      _id: 'player-a', room: room._id, socketId: 'existing-socket', isConnected: true, isHost: false,
      guestCapabilityHash: createPlayerCapabilityHash(capability, room._id, 'player-a')
    };
    room.players = [player];
    Room.findOne.mockReturnValue(populateRoom(room));
    Player.findById.mockResolvedValue(player);
    io.sockets.sockets.set(player.socketId, {});
    const socket = makeSocket();
    const callback = jest.fn();

    await handleJoinRoom(io, socket)({ roomCode: room.code, playerId: player._id, playerCapability: capability }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Jugador ya conectado' });
    expect(Player.findOneAndUpdate).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  test('a valid room host capability atomically replaces only the matching host socket', async () => {
    const hostCapability = 'room-host-secret';
    const { room, player, oldSocket } = makeLivePlayer();
    Player.findById
      .mockResolvedValueOnce(player)
      .mockResolvedValueOnce({ ...player, socketId: 'new-host-socket' });
    Player.findOneAndUpdate.mockResolvedValue({ ...player, socketId: 'new-host-socket' });
    const newSocket = makeSocket('new-host-socket');
    const callback = jest.fn();

    await handleJoinRoom(io, newSocket)({ roomCode: room.code, playerId: player._id, hostCapability }, callback);
    const broadcastsBeforeOldDisconnect = io.to.mock.calls.length;
    await handleDisconnect(io, oldSocket)();

    expect(Player.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: player._id, room: room._id, isHost: true, socketId: oldSocket.id },
      { $set: { socketId: newSocket.id, isConnected: true } },
      { new: true }
    );
    expect(oldSocket.disconnect).toHaveBeenCalledWith(true);
    expect(newSocket.join).toHaveBeenCalledWith(room.code);
    expect(callback).toHaveBeenCalledWith({ success: true, roomCode: room.code, playerId: player._id });
    expect(Player.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(io.to).toHaveBeenCalledTimes(broadcastsBeforeOldDisconnect);
    const loggedValues = Object.values(logger).flatMap((logMethod) => logMethod.mock.calls);
    expect(JSON.stringify([emitted.mock.calls, loggedValues, callback.mock.calls])).not.toContain(hostCapability);
  });

  test.each([
    ['player ID only', {}],
    ['incorrect capability', { hostCapability: 'wrong-secret' }],
    ['non-host target', { isHost: false, hostCapability: 'room-host-secret' }],
    ['cross-room capability', { roomId: 'room-b', roomCode: 'ROOMB', storedCapability: 'room-b-secret', hostCapability: 'room-host-secret' }],
    ['old socket bound elsewhere', { hostCapability: 'room-host-secret', oldRoomCode: 'ROOMB' }],
    ['offline host player ID only', { oldSocketLive: false }]
  ])('rejects host takeover with %s', async (_label, options) => {
    const { room, player, oldSocket } = makeLivePlayer(options);
    const newSocket = makeSocket('new-host-socket');
    const callback = jest.fn();

    await handleJoinRoom(io, newSocket)({
      roomCode: room.code,
      playerId: player._id,
      hostCapability: options.hostCapability
    }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(Player.findOneAndUpdate).not.toHaveBeenCalled();
    expect(oldSocket.disconnect).not.toHaveBeenCalled();
    expect(newSocket.join).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  test('does not let an unowned socket disconnect a player or mutate an active challenge', async () => {
    const player = { _id: 'player-a', room: 'room-a', socketId: 'legitimate-socket', isConnected: true };
    const room = {
      _id: 'room-a',
      code: 'ROOMA',
      players: [],
      currentGame: 'game-a',
      gameState: 'paused',
      save: jest.fn().mockResolvedValue(undefined)
    };
    const game = {
      activeChallenge: { player: 'player-a' },
      save: jest.fn().mockResolvedValue(undefined)
    };
    Player.findById.mockResolvedValue(player);
    Room.findOne.mockReturnValue(populateRoom(room));
    Game.findById.mockResolvedValue(game);
    const socket = makeSocket('spoofed-socket');
    socket.playerId = player._id;
    socket.roomCode = room.code;

    await handleDisconnect(io, socket)();

    expect(Player.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(game.activeChallenge).toEqual({ player: 'player-a' });
    expect(game.save).not.toHaveBeenCalled();
    expect(room.gameState).toBe('paused');
    expect(room.save).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  test('an owned player disconnect leaves challenge completion to its timeout', async () => {
    const player = { _id: 'player-a', room: 'room-a', socketId: 'socket-1', isConnected: true };
    const room = {
      _id: 'room-a',
      code: 'ROOMA',
      players: [],
      currentGame: 'game-a',
      gameState: 'paused',
      save: jest.fn().mockResolvedValue(undefined)
    };
    Room.findOne.mockImplementation(() => populateRoom(room));
    Player.findById.mockResolvedValue(player);
    Player.findOneAndUpdate.mockResolvedValue({ ...player, isConnected: false, socketId: null });
    Game.findById.mockResolvedValue({ activeChallenge: { player: player._id }, save: jest.fn() });
    const socket = makeSocket();
    socket.playerId = player._id;
    socket.roomCode = room.code;

    await handleDisconnect(io, socket)();

    expect(Player.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: player._id, room: room._id, socketId: socket.id },
      { $set: { isConnected: false, socketId: null } },
      { new: true }
    );
    expect(Game.findById).not.toHaveBeenCalled();
    expect(room.gameState).toBe('paused');
    expect(room.save).not.toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalledWith('game-state-changed', expect.anything());
    expect(emitted).not.toHaveBeenCalledWith('challenge-complete', expect.anything());
  });
});
