jest.mock('../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../models/Player', () => ({ findOne: jest.fn() }));
jest.mock('../models/Game', () => ({ findById: jest.fn() }));
jest.mock('../config/logger', () => ({ info: jest.fn(), error: jest.fn() }));

const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const { handleSyncGameState } = require('../socket/handlers/connectionHandlers');

afterEach(() => jest.clearAllMocks());

test('does not disclose a trivia answer in player state synchronization', async () => {
  const player = { _id: 'player-a', name: 'Guest A', bingoCard: { matrix: [[1]] } };
  const room = {
    _id: 'room-a', code: 'ROOMA1', currentGame: 'game-a', gameState: 'paused', players: [player]
  };
  const game = {
    currentNumber: 7,
    calledNumbers: [3, 7],
    activeChallenge: {
      type: 'trivia',
      player: player._id,
      data: { question: 'Question?', options: ['A', 'B'], correct: 1 }
    }
  };
  const roomQuery = { populate: jest.fn().mockResolvedValue(room) };
  Room.findOne.mockReturnValue(roomQuery);
  Player.findOne.mockResolvedValue({ ...player, room: room._id, socketId: 'socket-a', isConnected: true });
  Game.findById.mockResolvedValue(game);
  const socket = {
    id: 'socket-a', roomCode: room.code, playerId: player._id, emit: jest.fn()
  };
  const callback = jest.fn();

  await handleSyncGameState({}, socket)({ roomCode: room.code, playerId: player._id }, callback);

  expect(callback).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    data: expect.objectContaining({
      activeChallenge: expect.objectContaining({
        type: 'trivia',
        data: { question: 'Question?', options: ['A', 'B'] }
      })
    })
  }));
  expect(JSON.stringify(callback.mock.calls)).not.toContain('"correct":1');
  expect(JSON.stringify(socket.emit.mock.calls)).not.toContain('"correct":1');
});
