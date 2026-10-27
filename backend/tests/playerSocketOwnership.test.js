jest.mock('../models/Room', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/Player', () => ({ findOneAndUpdate: jest.fn(), findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/Game', () => ({ findById: jest.fn() }));
jest.mock('../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), logGameEvent: jest.fn()
}));
jest.mock('../socket/utils/roomTimer', () => ({ clearAllRoomTimers: jest.fn(), ensureWatchdog: jest.fn() }));

const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const { handleMarkCell, handleUpdatePoints } = require('../socket/handlers/playerHandlers');
const {
  handleVerifyRoom,
  handleSyncGameState,
  handleSyncDashboard
} = require('../socket/handlers/connectionHandlers');
const { createHostCapabilityHash } = require('../middleware/socketAuthMiddleware');

const asQuery = (value) => {
  const query = Promise.resolve(value);
  query.select = jest.fn(() => query);
  query.populate = jest.fn().mockResolvedValue(value);
  return query;
};
const makeRoom = () => ({
  _id: 'room-a',
  code: 'ROOMA1',
  players: ['player-a', 'host-a'],
  currentGame: 'game-a',
  gameState: 'playing',
  config: {},
  save: jest.fn().mockResolvedValue(undefined)
});
const makeSocket = (overrides = {}) => ({
  id: 'socket-a',
  roomCode: 'ROOMA1',
  playerId: 'player-a',
  emit: jest.fn(),
  ...overrides
});
const makeIO = () => {
  const emit = jest.fn();
  return { io: { to: jest.fn(() => ({ emit })) }, emit };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('player socket mutation ownership', () => {
  test('rejects mark-cell and update-points spoofing before any database mutation', async () => {
    const socket = makeSocket({ playerId: 'player-attacker' });
    const { io, emit } = makeIO();

    await handleMarkCell(io, socket)({ roomCode: 'ROOMA1', playerId: 'player-victim', row: 0, col: 0 });
    await handleUpdatePoints(io, socket)({ roomCode: 'ROOMA1', playerId: 'player-victim', points: 10 });

    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(Room.findOne).not.toHaveBeenCalled();
    expect(Player.findOneAndUpdate).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  test('rejects stale socket writes and permits the bound owner to mark their own cell', async () => {
    const socket = makeSocket({ id: 'socket-old' });
    const room = makeRoom();
    const player = {
      _id: 'player-a',
      name: 'Guest A',
      bingoCard: {
        matrix: [
          [1, 2, 3, 4, 5],
          [16, 17, 18, 19, 20],
          [31, 32, 'BINGO', 34, 35],
          [46, 47, 48, 49, 50],
          [61, 62, 63, 64, 65]
        ],
        markedCells: []
      },
      stats: { numbersMarked: 0, points: 0 },
      save: jest.fn().mockResolvedValue(undefined)
    };
    const game = { calledNumbers: [1] };
    Room.findOne.mockReturnValue(asQuery(room));
    Game.findById.mockResolvedValue(game);
    Player.findOne.mockResolvedValue(player);
    Player.findOneAndUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce(player);
    const { io, emit } = makeIO();

    await handleMarkCell(io, socket)({ roomCode: 'ROOMA1', playerId: 'player-a', row: 0, col: 0 });
    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(player.save).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();

    socket.id = 'socket-current';
    await handleMarkCell(io, socket)({ roomCode: 'ROOMA1', playerId: 'player-a', row: 0, col: 0 });

    expect(Player.findOneAndUpdate).toHaveBeenLastCalledWith(
      {
        _id: 'player-a', room: 'room-a', socketId: 'socket-current', isConnected: true,
        'bingoCard.markedCells': { $not: { $elemMatch: { row: 0, col: 0 } } }
      },
      {
        $addToSet: { 'bingoCard.markedCells': { row: 0, col: 0 } },
        $inc: { 'stats.numbersMarked': 1, 'stats.points': 10 }
      },
      { new: true }
    );
    expect(player.save).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('cell-marked', { playerId: 'player-a', row: 0, col: 0 });

    Player.findOneAndUpdate.mockResolvedValueOnce({ stats: { points: 7 } });
    await handleUpdatePoints(io, socket)({ roomCode: 'ROOMA1', playerId: 'player-a', points: 7 });
    expect(Player.findOneAndUpdate).toHaveBeenLastCalledWith(
      { _id: 'player-a', room: 'room-a', socketId: 'socket-current', isConnected: true },
      { $inc: { 'stats.points': 7 } },
      { new: true }
    );
    expect(emit).toHaveBeenCalledWith('points-updated', { playerId: 'player-a', newPoints: 7 });
  });

  test('binds verify-room and game-state sync to the current socket owner', async () => {
    const socket = makeSocket({ id: 'socket-old' });
    const room = makeRoom();
    const callback = jest.fn();
    Room.findOne.mockReturnValue(asQuery(room));
    Player.findOne.mockResolvedValue(null);

    await handleVerifyRoom({}, socket)({ roomCode: 'ROOMA1', playerId: 'player-a' }, callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(Player.findOne).toHaveBeenCalledWith(
      { _id: 'player-a', room: 'room-a', socketId: 'socket-old', isConnected: true }
    );

    callback.mockClear();
    await handleSyncGameState({}, socket)({ roomCode: 'ROOMA1', playerId: 'player-a' }, callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(Player.findOne).toHaveBeenLastCalledWith(
      { _id: 'player-a', room: 'room-a', socketId: 'socket-old', isConnected: true }
    );

    callback.mockClear();
    Player.findOne.mockResolvedValue({ _id: 'player-a', name: 'Guest A', bingoCard: { matrix: [] } });
    Game.findById.mockResolvedValue({ calledNumbers: [], currentNumber: 1 });
    await handleSyncGameState({}, socket)({ roomCode: 'ROOMA1', playerId: 'player-a' }, callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('requires hostCapability for dashboard sync while preserving host access', async () => {
    const hostCapability = 'room-host-secret';
    const room = {
      ...makeRoom(),
      host: 'host-a',
      hostCapabilityHash: createHostCapabilityHash(hostCapability, 'room-a'),
      players: ['player-a', 'host-a']
    };
    const socket = makeSocket({ playerId: 'host-a' });
    const callback = jest.fn();
    Room.findOne.mockReturnValue(asQuery(room));
    Player.findOne.mockResolvedValue({ _id: 'host-a', isHost: true });
    Game.findById.mockResolvedValue({ calledNumbers: [] });

    await handleSyncDashboard({}, socket)({ roomCode: room.code }, callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));

    callback.mockClear();
    await handleSyncDashboard({}, socket)({ roomCode: room.code, hostCapability }, callback);
    expect(Player.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'host-a', room: 'room-a', isHost: true, socketId: 'socket-a' })
    );
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(JSON.stringify(callback.mock.calls)).not.toContain(room.hostCapabilityHash);
  });
});
