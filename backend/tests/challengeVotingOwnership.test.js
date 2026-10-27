jest.mock('../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../models/Player', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../models/Game', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../models/Vote', () => ({ findById: jest.fn() }));
jest.mock('../services/votingService', () => ({
  hasVoted: jest.fn(),
  submitVote: jest.fn(),
  createVoting: jest.fn(),
  completeVoting: jest.fn(),
  getSpecialRankings: jest.fn(),
  getGameVotings: jest.fn()
}));
jest.mock('../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), logGameEvent: jest.fn() }));
jest.mock('../socket/utils/roomTimer', () => ({ clearAllRoomTimers: jest.fn(), ensureWatchdog: jest.fn() }));
jest.mock('../socket/handlers/gameHandlers', () => ({
  immediateNextNumber: jest.fn().mockResolvedValue(undefined),
  scheduleRoomInterval: jest.fn().mockResolvedValue(undefined)
}));

const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const Vote = require('../models/Vote');
const votingService = require('../services/votingService');
const gameHandlers = require('../socket/handlers/gameHandlers');
const {
  registerChallengeHandlers,
  handleChallengeAnswer,
  handleChallengeComplete,
  handleKaraokeVideoEnd
} = require('../socket/handlers/challengeHandlers');
const {
  castVote,
  startVoting,
  endVoting,
  getSpecialRankings,
  getGameVotings
} = require('../socket/handlers/votingHandlers');
const { handleCastTiebreakVote } = require('../socket/handlers/bingoHandlers');

const makeSocket = (overrides = {}) => ({
  id: 'socket-a',
  roomCode: 'ROOMA1',
  playerId: 'player-a',
  emit: jest.fn(),
  on: jest.fn(),
  ...overrides
});
const makeIO = () => {
  const emit = jest.fn();
  return {
    io: {
      to: jest.fn(() => ({ emit })),
      in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([]) }))
    },
    emit
  };
};

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('challenge and voting socket identity', () => {
  test('rejects another player’s challenge answer and completion', async () => {
    const socket = makeSocket({ playerId: 'player-attacker' });
    const { io, emit } = makeIO();

    await handleChallengeAnswer(io, socket)({
      roomCode: 'ROOMA1', playerId: 'player-victim', challengeId: 'challenge-a', answer: 'yes'
    });
    await handleChallengeComplete(io, socket)({
      roomCode: 'ROOMA1', playerId: 'player-victim', challengeId: 'challenge-a', type: 'dance'
    });

    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(io.to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(Room.findOne).not.toHaveBeenCalled();
  });

  test('rejects a stale digital player from answering trivia before broadcasting or scheduling game changes', async () => {
    jest.useFakeTimers();
    const socket = makeSocket({ id: 'socket-old' });
    const { io, emit } = makeIO();

    registerChallengeHandlers(io, socket);
    const triviaAnswered = socket.on.mock.calls.find(([event]) => event === 'trivia-answered')[1];
    await triviaAnswered({ roomCode: 'ROOMA1', playerId: 'player-a', answer: 2, correct: 2 });

    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(io.to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('rejects uncredentialed voting start/end requests before changing voting state', async () => {
    const room = { _id: 'room-a', code: 'ROOMA1', hostCapabilityHash: 'stored-hash', players: [] };
    const roomQuery = {
      select: jest.fn(() => roomQuery),
      populate: jest.fn().mockResolvedValue(room)
    };
    Room.findOne.mockReturnValue(roomQuery);
    const socket = makeSocket({ playerId: 'player-attacker' });
    const { io } = makeIO();

    await startVoting(io, socket, {
      roomCode: room.code,
      challengeType: 'dance',
      performerId: 'player-a',
      performerName: 'Player A'
    });
    await endVoting(io, socket, { roomCode: room.code, voteId: 'vote-a' });

    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    }));
    expect(Game.findOne).not.toHaveBeenCalled();
    expect(votingService.createVoting).not.toHaveBeenCalled();
    expect(votingService.completeVoting).not.toHaveBeenCalled();
  });

  test('rejects challenge answer and completion events from a non-performer', async () => {
    const room = { _id: 'room-a', code: 'ROOMA1', currentGame: 'game-a' };
    const player = { _id: 'player-a', room: room._id, socketId: 'socket-a', isConnected: true };
    const game = { activeChallenge: { type: 'dance', player: 'player-victim' } };
    Room.findOne.mockResolvedValue(room);
    Player.findOne.mockResolvedValue(player);
    Game.findById.mockResolvedValue(game);
    const socket = makeSocket({ playerId: player._id });
    const { io } = makeIO();

    await handleChallengeAnswer(io, socket)({
      roomCode: room.code, playerId: player._id, challengeId: 'challenge-a', answer: 'yes'
    });
    await handleChallengeComplete(io, socket)({
      roomCode: room.code, playerId: player._id, challengeId: 'challenge-a', type: 'dance'
    });

    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(io.to).not.toHaveBeenCalled();
  });

  test('preserves challenge answer and completion events for the active performer', async () => {
    const room = { _id: 'room-a', code: 'ROOMA1', currentGame: 'game-a' };
    const player = { _id: 'player-a', room: room._id, socketId: 'socket-a', isConnected: true };
    const game = { activeChallenge: { type: 'dance', player: player._id } };
    Room.findOne.mockResolvedValue(room);
    Player.findOne.mockResolvedValue(player);
    Game.findById.mockResolvedValue(game);
    const socket = makeSocket({ playerId: player._id });
    const { io, emit } = makeIO();

    await handleChallengeAnswer(io, socket)({
      roomCode: room.code, playerId: player._id, challengeId: 'challenge-a', answer: 'yes'
    });
    await handleChallengeComplete(io, socket)({
      roomCode: room.code, playerId: player._id, challengeId: 'challenge-a', type: 'dance'
    });

    expect(emit).toHaveBeenCalledWith('challenge-result', expect.objectContaining({
      playerId: player._id, challengeId: 'challenge-a'
    }));
    expect(socket.emit).not.toHaveBeenCalledWith('error', expect.any(Object));
  });

  test('does not let a non-performer complete another player’s trivia challenge', async () => {
    jest.useFakeTimers();
    const room = {
      _id: 'room-a', code: 'ROOMA1', currentGame: 'game-a',
      manualPlayers: []
    };
    const player = {
      _id: 'player-a', room: room._id, socketId: 'socket-a', isConnected: true
    };
    const game = {
      activeChallenge: {
        type: 'trivia', player: 'player-victim',
        data: { question: 'Question?', options: ['A', 'B'], correct: 1 }
      }
    };
    Room.findOne.mockResolvedValue(room);
    Player.findOne.mockResolvedValue(player);
    Game.findById.mockResolvedValue(game);
    const socket = makeSocket({ playerId: player._id });
    const { io, emit } = makeIO();
    registerChallengeHandlers(io, socket);
    const triviaAnswered = socket.on.mock.calls.find(([event]) => event === 'trivia-answered')[1];

    await triviaAnswered({ roomCode: room.code, playerId: player._id, answer: 1, correct: 1 });

    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(io.to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('uses the stored trivia answer instead of a client-supplied correct value', async () => {
    jest.useFakeTimers();
    const room = {
      _id: 'room-a', code: 'ROOMA1', currentGame: 'game-a',
      manualPlayers: []
    };
    const player = {
      _id: 'player-a', room: room._id, socketId: 'socket-a', isConnected: true
    };
    const game = {
      activeChallenge: {
        type: 'trivia', player: player._id,
        data: { question: 'Question?', options: ['A', 'B'], correct: 1 }
      }
    };
    Room.findOne.mockResolvedValue(room);
    Player.findOne.mockResolvedValue(player);
    Game.findById.mockResolvedValue(game);
    const socket = makeSocket({ playerId: player._id });
    const { io, emit } = makeIO();
    registerChallengeHandlers(io, socket);
    const triviaAnswered = socket.on.mock.calls.find(([event]) => event === 'trivia-answered')[1];

    await triviaAnswered({ roomCode: room.code, playerId: player._id, answer: 1, correct: 0 });

    expect(emit).toHaveBeenCalledWith('trivia-answered', {
      playerId: player._id, answer: 1
    });
    expect(emit).not.toHaveBeenCalledWith('trivia-answered', expect.objectContaining({
      correct: expect.anything(), isCorrect: expect.anything()
    }));
    expect(socket.emit).toHaveBeenCalledWith('trivia-result', expect.objectContaining({
      playerId: player._id, answer: 1, correct: 1, isCorrect: true
    }));
  });

  test('evaluates riddles server-side without broadcasting the accepted answers', async () => {
    const room = {
      _id: 'room-a', code: 'ROOMA1', currentGame: 'game-a',
      save: jest.fn().mockResolvedValue(undefined)
    };
    const player = {
      _id: 'player-a', room: room._id, socketId: 'socket-a', isConnected: true
    };
    const game = {
      activeChallenge: {
        id: 'riddle-a', type: 'riddle', player: player._id,
        data: { prompt: '¿Qué tiene hojas y no es árbol?', answers: ['libro'] },
        responses: []
      },
      save: jest.fn().mockResolvedValue(undefined)
    };
    Room.findOne.mockResolvedValue(room);
    Player.findOne.mockResolvedValue(player);
    Game.findById.mockResolvedValue(game);
    const socket = makeSocket({ playerId: player._id });
    const { io, emit } = makeIO();

    await handleChallengeAnswer(io, socket)({
      roomCode: room.code, playerId: player._id, challengeId: 'riddle-a', answer: '¡LIBRO!'
    });

    expect(socket.emit).toHaveBeenCalledWith('challenge-result', expect.objectContaining({
      result: expect.objectContaining({ success: true, points: 30 })
    }));
    expect(emit).toHaveBeenCalledWith('challenge-result-public', expect.objectContaining({
      result: { answer: '¡LIBRO!' }
    }));
    expect(emit).not.toHaveBeenCalledWith('challenge-result-public', expect.objectContaining({
      result: expect.objectContaining({ success: true })
    }));
    expect(game.save).toHaveBeenCalledTimes(1);
  });

  test('requires every group participant before completing a group challenge', async () => {
    const room = {
      _id: 'room-a', code: 'ROOMA1', currentGame: 'game-a',
      save: jest.fn().mockResolvedValue(undefined)
    };
    const playerA = { _id: 'player-a', room: room._id, socketId: 'socket-a', isConnected: true };
    const game = {
      activeChallenge: {
        id: 'group-a', type: 'group', player: playerA._id,
        participants: [
          { playerId: 'player-a', playerName: 'A' },
          { playerId: 'player-b', playerName: 'B' }
        ], responses: []
      },
      save: jest.fn().mockResolvedValue(undefined)
    };
    Room.findOne.mockResolvedValue(room);
    Player.findOne.mockResolvedValue(playerA);
    Game.findById.mockResolvedValue(game);
    const socket = makeSocket({ playerId: playerA._id });
    const { io, emit } = makeIO();

    await handleChallengeComplete(io, socket)({
      roomCode: room.code, playerId: playerA._id, challengeId: 'group-a', type: 'group'
    });

    expect(game.activeChallenge.responses).toHaveLength(1);
    expect(game.save).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalledWith('challenge-completed', expect.anything());
  });

  test('rejects a host ending a voting record belonging to a different room', async () => {
    const hostCapability = 'host-secret';
    const room = {
      _id: 'room-a', code: 'ROOMA1',
      hostCapabilityHash: require('../middleware/socketAuthMiddleware')
        .createHostCapabilityHash(hostCapability, 'room-a')
    };
    Room.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(room) });
    Vote.findById.mockResolvedValue({ _id: 'vote-b', roomCode: 'ROOMB2' });
    const socket = makeSocket({ playerId: 'host-a' });
    const { io } = makeIO();

    await endVoting(io, socket, {
      roomCode: room.code, voteId: 'vote-b', hostCapability
    });

    expect(Vote.findById).toHaveBeenCalledWith('vote-b');
    expect(votingService.completeVoting).not.toHaveBeenCalled();
    expect(Game.findOne).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
  });

  test('blocks voting-stat reads for a room other than the socket-bound room', async () => {
    const roomB = { _id: 'room-b', code: 'ROOMB2' };
    const game = { _id: 'game-b' };
    const query = { sort: jest.fn().mockResolvedValue(game) };
    Room.findOne.mockResolvedValue(roomB);
    Game.findOne.mockReturnValue(query);
    votingService.getSpecialRankings.mockResolvedValue([{ playerName: 'Private B' }]);
    votingService.getGameVotings.mockResolvedValue([{ performerName: 'Private B' }]);
    const socket = makeSocket({ roomCode: 'ROOMA1' });
    const { io } = makeIO();

    await getSpecialRankings(io, socket, { roomCode: 'ROOMB2' });
    await getGameVotings(io, socket, { roomCode: 'ROOMB2' });

    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(socket.emit).not.toHaveBeenCalledWith('specialRankings', expect.anything());
    expect(socket.emit).not.toHaveBeenCalledWith('gameVotings', expect.anything());
    expect(Room.findOne).not.toHaveBeenCalled();
    expect(Game.findOne).not.toHaveBeenCalled();
    expect(votingService.getSpecialRankings).not.toHaveBeenCalled();
    expect(votingService.getGameVotings).not.toHaveBeenCalled();
  });

  test('preserves voting-stat reads for the socket-bound room', async () => {
    const room = { _id: 'room-a', code: 'ROOMA1' };
    const game = { _id: 'game-a' };
    const query = { sort: jest.fn().mockResolvedValue(game) };
    const rankings = [{ playerName: 'Guest A' }];
    const votings = [{ performerName: 'Guest A' }];
    Room.findOne.mockResolvedValue(room);
    Game.findOne.mockReturnValue(query);
    votingService.getSpecialRankings.mockResolvedValue(rankings);
    votingService.getGameVotings.mockResolvedValue(votings);
    const socket = makeSocket({ roomCode: room.code });
    const { io } = makeIO();

    await getSpecialRankings(io, socket, { roomCode: room.code.toLowerCase() });
    await getGameVotings(io, socket, { roomCode: room.code });

    expect(socket.emit).toHaveBeenCalledWith('specialRankings', rankings);
    expect(socket.emit).toHaveBeenCalledWith('gameVotings', { votings, total: 1 });
  });

  test('rejects spoofed regular and tie-break voter IDs before recording votes', async () => {
    const socket = makeSocket({ playerId: 'player-attacker' });
    const { io } = makeIO();

    await castVote(io, socket, {
      voteId: 'vote-a', voterId: 'player-victim', voterName: 'Victim', stars: 5
    });
    await handleCastTiebreakVote(io, socket)({
      roomCode: 'ROOMA1', voterId: 'player-victim', performerId: 'performer-a', stars: 5
    });

    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(Vote.findById).not.toHaveBeenCalled();
    expect(votingService.hasVoted).not.toHaveBeenCalled();
    expect(votingService.submitVote).not.toHaveBeenCalled();
    expect(Room.findOne).not.toHaveBeenCalled();
    expect(Game.findById).not.toHaveBeenCalled();
  });

  test('keeps TV karaoke completion restricted to the TV socket bound to that room', async () => {
    const playerSocket = makeSocket({ roomCode: 'ROOMA1', playerId: 'player-a' });
    const { io } = makeIO();

    await handleKaraokeVideoEnd(io, playerSocket)({ roomCode: 'ROOMA1' });

    expect(playerSocket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(Room.findOne).not.toHaveBeenCalled();

    const unauthorizedTvSocket = makeSocket({
      roomCode: 'ROOMA1', playerId: 'tv-display', tvAuthorized: false
    });
    await handleKaraokeVideoEnd(io, unauthorizedTvSocket)({ roomCode: 'ROOMA1' });
    expect(unauthorizedTvSocket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(Room.findOne).not.toHaveBeenCalled();

    const tvSocket = makeSocket({ roomCode: 'ROOMA1', playerId: 'tv-display', tvAuthorized: true });
    await handleKaraokeVideoEnd(io, tvSocket)({ roomCode: 'ROOMB2' });
    expect(tvSocket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(Room.findOne).not.toHaveBeenCalled();
  });

  test('preserves valid TV/manual-player trivia and karaoke completion', async () => {
    const room = {
      _id: 'room-a',
      code: 'ROOMA1',
      currentGame: 'game-a',
      gameState: 'paused',
      config: {},
      manualPlayers: [{ playerId: 'manual-1', playerName: 'Paper guest' }],
      save: jest.fn().mockResolvedValue(undefined)
    };
    const game = {
      activeChallenge: {
        type: 'trivia', player: 'manual-1', startTime: new Date(),
        data: { question: 'Question?', options: ['A', 'B', 'C'], correct: 2 }
      },
      save: jest.fn().mockResolvedValue(undefined)
    };
    Room.findOne.mockResolvedValue(room);
    Game.findById.mockResolvedValue(game);
    const tvSocket = makeSocket({ playerId: 'tv-display', tvAuthorized: true });
    const { io, emit } = makeIO();
    jest.useFakeTimers();

    registerChallengeHandlers(io, tvSocket);
    const triviaAnswered = tvSocket.on.mock.calls.find(([event]) => event === 'trivia-answered')[1];
    await triviaAnswered({ roomCode: 'ROOMA1', playerId: 'manual-1', answer: 2, correct: 2 });
    expect(emit).toHaveBeenCalledWith('trivia-answered', expect.objectContaining({ playerId: 'manual-1' }));

    game.activeChallenge.type = 'karaoke';
    await handleKaraokeVideoEnd(io, tvSocket)({ roomCode: 'ROOMA1' });
    expect(emit).toHaveBeenCalledWith('challenge-completed', { success: true });
    expect(game.save).toHaveBeenCalledTimes(2);
    expect(room.save).toHaveBeenCalledTimes(1);
    expect(gameHandlers.immediateNextNumber).toHaveBeenCalledWith(io, 'ROOMA1');
  });
});
