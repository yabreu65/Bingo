const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../utils/roomActivity', () => ({ updateRoomActivity: jest.fn().mockResolvedValue(undefined) }));

const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const roomRoutes = require('../routes/roomRoutes');
const playerRoutes = require('../routes/playerRoutes');
const gameRoutes = require('../routes/gameRoutes');
const { updateRoomActivity } = require('../utils/roomActivity');
const { handleClaimBingo } = require('../socket/handlers/bingoHandlers');
const { handleJoinRoom } = require('../socket/handlers/roomHandlers');
const { createHostCapabilityHash } = require('../middleware/socketAuthMiddleware');

const app = express();
app.use(express.json());
app.use('/api/rooms', roomRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/games', gameRoutes);

const capabilityHash = (secret, roomId, playerId) =>
  crypto.createHash('sha256').update(`${roomId}:${playerId}:${secret}`).digest('hex');
const asQuery = (value) => {
  const query = {
    select: jest.fn(() => query),
    populate: jest.fn().mockResolvedValue(value)
  };
  return query;
};
const asPlayerQuery = (value) => {
  const query = Promise.resolve(value);
  query.select = jest.fn(() => query);
  return query;
};

const makeRoom = (overrides = {}) => {
  const room = {
    _id: new mongoose.Types.ObjectId(),
    code: 'ROOMA1',
    isActive: true,
    config: { maxPlayers: 20 },
    players: [],
    manualPlayers: [],
    reservedCards: [],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
  room.populate = jest.fn().mockResolvedValue(room);
  room.toObject = jest.fn(() => ({ ...room }));
  return room;
};

const makeSocket = ({ id = 'socket-a', roomCode = 'ROOMA1', playerId = 'aaaaaaaaaaaaaaaaaaaaaaaa' } = {}) => ({
  id,
  roomCode,
  playerId,
  join: jest.fn(),
  leave: jest.fn(),
  disconnect: jest.fn(),
  emit: jest.fn()
});

const makeRoomIO = () => {
  const emit = jest.fn();
  return { io: { to: jest.fn(() => ({ emit })) }, emit };
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('guest player capability HTTP boundary', () => {
  test('issues a per-player secret on join and returns only its hash-free public player/room', async () => {
    const room = makeRoom();
    jest.spyOn(Room, 'findOne').mockResolvedValue(room);
    const savedPlayers = [];
    jest.spyOn(Player.prototype, 'save').mockImplementation(async function savePlayer() {
      savedPlayers.push(this);
      return this;
    });

    const response = await request(app)
      .post('/api/rooms/join')
      .send({ roomCode: room.code, playerName: 'Guest A' });

    expect(response.status).toBe(200);
    expect(response.body.playerCapability).toEqual(expect.any(String));
    expect(response.body.playerCapability).toHaveLength(43);
    expect(savedPlayers).toHaveLength(1);
    const player = savedPlayers[0];
    expect(player.guestCapabilityHash).toBe(capabilityHash(
      response.body.playerCapability,
      room._id.toString(),
      player._id.toString()
    ));
    expect(response.body.player.guestCapabilityHash).toBeUndefined();
    expect(JSON.stringify(response.body.room)).not.toContain('guestCapabilityHash');
    expect(JSON.stringify(response.body.room)).not.toContain(response.body.playerCapability);
  });

  test('rejects selecting a card for a player in another room without changing that player', async () => {
    const room = makeRoom({ players: [{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', cardNumber: null }] });
    const foreignPlayer = {
      _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      room: new mongoose.Types.ObjectId(),
      cardNumber: 17,
      bingoCard: { matrix: [], markedCells: [] },
      save: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));
    jest.spyOn(Player, 'findById').mockResolvedValue(foreignPlayer);
    jest.spyOn(Player, 'findOneAndUpdate').mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/rooms/${room.code}/select-card`)
      .send({ playerId: foreignPlayer._id, cardNumber: 42 });

    expect(response.status).toBe(403);
    expect(foreignPlayer.cardNumber).toBe(17);
    expect(foreignPlayer.save).not.toHaveBeenCalled();
    expect(updateRoomActivity).not.toHaveBeenCalled();
  });

  test('rejects a same-room guest changing another player card with their own capability', async () => {
    const roomId = new mongoose.Types.ObjectId();
    const attackerSecret = 'a'.repeat(43);
    const targetSecret = 'b'.repeat(43);
    const attacker = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', cardNumber: null };
    const target = {
      _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      room: roomId,
      guestCapabilityHash: capabilityHash(targetSecret, roomId.toString(), 'bbbbbbbbbbbbbbbbbbbbbbbb'),
      cardNumber: 17,
      bingoCard: { matrix: [], markedCells: [] },
      save: jest.fn().mockResolvedValue(undefined)
    };
    const room = makeRoom({ _id: roomId, players: [attacker, target] });
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));
    jest.spyOn(Player, 'findById').mockResolvedValue(target);
    jest.spyOn(Player, 'findOneAndUpdate').mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/rooms/${room.code}/select-card`)
      .set('x-player-capability', attackerSecret)
      .send({ playerId: target._id, cardNumber: 42 });

    expect(response.status).toBe(403);
    expect(target.cardNumber).toBe(17);
    expect(target.save).not.toHaveBeenCalled();
    expect(updateRoomActivity).not.toHaveBeenCalled();
  });

  test('allows a guest to select only their own card with the matching capability', async () => {
    const roomId = new mongoose.Types.ObjectId();
    const secret = 'c'.repeat(43);
    const player = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      room: roomId,
      guestCapabilityHash: capabilityHash(secret, roomId.toString(), 'aaaaaaaaaaaaaaaaaaaaaaaa'),
      cardNumber: null,
      bingoCard: { matrix: [], markedCells: [] },
      save: jest.fn().mockResolvedValue(undefined)
    };
    const room = makeRoom({ _id: roomId, players: [player] });
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));
    jest.spyOn(Player, 'findById').mockResolvedValue(player);
    jest.spyOn(Player, 'findOneAndUpdate').mockImplementation(async (_filter, update) => {
      player.cardNumber = update.$set.cardNumber;
      player.bingoCard.matrix = update.$set['bingoCard.matrix'];
      player.bingoCard.markedCells = update.$set['bingoCard.markedCells'];
      return player;
    });

    const response = await request(app)
      .post(`/api/rooms/${room.code}/select-card`)
      .set('x-player-capability', secret)
      .send({ playerId: player._id, cardNumber: 42 });

    expect(response.status).toBe(200);
    expect(player.cardNumber).toBe(42);
  });

  test('never serializes a guest capability hash from public room populations', async () => {
    const room = makeRoom({
      players: [{
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        name: 'Guest A',
        guestCapabilityHash: 'private-hash-value',
        bingoCard: { matrix: [[99]], markedCells: [[0, 0]] },
        socketId: 'private-socket',
        isConnected: true
      }]
    });
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));

    const response = await request(app).get(`/api/rooms/${room.code}`);

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('private-hash-value');
    expect(JSON.stringify(response.body)).not.toContain('guestCapabilityHash');
    expect(JSON.stringify(response.body)).not.toContain('bingoCard');
    expect(JSON.stringify(response.body)).not.toContain('private-socket');
  });
});

describe('guest socket join capability boundary', () => {
  test('rejects a wrong guest capability without binding or joining the socket', async () => {
    const roomId = 'room-a';
    const correctSecret = 'd'.repeat(43);
    const player = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', room: roomId, isHost: false, socketId: null,
      guestCapabilityHash: capabilityHash(correctSecret, roomId, 'aaaaaaaaaaaaaaaaaaaaaaaa')
    };
    const room = { _id: roomId, code: 'ROOMA1', host: 'host-a', players: [player] };
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));
    jest.spyOn(Player, 'findById').mockResolvedValue(player);
    jest.spyOn(Player, 'findOneAndUpdate').mockResolvedValue(null);
    const socket = makeSocket({ id: 'socket-new', roomCode: undefined, playerId: undefined });
    const callback = jest.fn();
    const io = { to: jest.fn(() => ({ emit: jest.fn() })), sockets: { sockets: new Map() } };

    await handleJoinRoom(io, socket)({
      roomCode: room.code,
      playerId: player._id,
      playerCapability: 'e'.repeat(43)
    }, callback);

    expect(Player.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: player._id,
        room: roomId,
        isHost: false,
        guestCapabilityHash: capabilityHash('e'.repeat(43), roomId, player._id)
      }),
      expect.any(Object),
      expect.any(Object)
    );
    expect(socket.join).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(io.to).not.toHaveBeenCalled();
  });

  test('joins a guest with their capability and never broadcasts its hash', async () => {
    const roomId = 'room-a';
    const secret = 'f'.repeat(43);
    const player = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', room: roomId, isHost: false, socketId: null, isConnected: false,
      name: 'Guest A', guestCapabilityHash: capabilityHash(secret, roomId, 'aaaaaaaaaaaaaaaaaaaaaaaa')
    };
    const room = { _id: roomId, code: 'ROOMA1', host: 'host-a', players: [player] };
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));
    jest.spyOn(Player, 'findById').mockResolvedValue(player);
    jest.spyOn(Player, 'findOneAndUpdate').mockResolvedValue({ ...player, socketId: 'socket-new', isConnected: true });
    const socket = makeSocket({ id: 'socket-new', roomCode: undefined, playerId: undefined });
    const callback = jest.fn();
    const emit = jest.fn();
    const io = { to: jest.fn(() => ({ emit })), sockets: { sockets: new Map() } };

    await handleJoinRoom(io, socket)({
      roomCode: room.code,
      playerId: player._id,
      playerCapability: secret
    }, callback);

    expect(socket.join).toHaveBeenCalledWith(room.code);
    expect(callback).toHaveBeenCalledWith({ success: true, roomCode: room.code, playerId: player._id });
    expect(JSON.stringify(emit.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(emit.mock.calls)).not.toContain(player.guestCapabilityHash);
  });

  test('requires a dedicated TV capability while preserving host capability join', async () => {
    const roomId = 'room-a';
    const hostSecret = 'host-secret';
    const tvSecret = 't'.repeat(43);
    const host = { _id: 'host-player', room: roomId, isHost: true, socketId: null };
    const room = {
      _id: roomId,
      code: 'ROOMA1',
      host: host._id,
      hostCapabilityHash: createHostCapabilityHash(hostSecret, roomId),
      tvCapabilityHash: crypto.createHash('sha256').update(`${roomId}:${tvSecret}`).digest('hex'),
      players: [host]
    };
    const query = asQuery(room);
    jest.spyOn(Room, 'findOne').mockReturnValue(query);
    jest.spyOn(Player, 'findById').mockResolvedValue(host);
    jest.spyOn(Player, 'findOneAndUpdate').mockResolvedValue(host);
    const emit = jest.fn();
    const io = { to: jest.fn(() => ({ emit })), sockets: { sockets: new Map() } };
    const tvSocket = makeSocket({ id: 'tv-socket' });
    delete tvSocket.roomCode;
    delete tvSocket.playerId;
    const tvCallback = jest.fn();

    await handleJoinRoom(io, tvSocket)({ roomCode: room.code, playerId: 'tv-display' }, tvCallback);
    expect(tvCallback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(tvSocket.join).not.toHaveBeenCalled();

    const authorizedTvSocket = makeSocket({ id: 'authorized-tv-socket' });
    delete authorizedTvSocket.roomCode;
    delete authorizedTvSocket.playerId;
    const authorizedTvCallback = jest.fn();
    await handleJoinRoom(io, authorizedTvSocket)({
      roomCode: room.code,
      playerId: 'tv-display',
      tvCapability: tvSecret
    }, authorizedTvCallback);
    expect(authorizedTvCallback).toHaveBeenCalledWith({
      success: true, roomCode: room.code, playerId: 'tv-display'
    });
    expect(authorizedTvSocket.join).toHaveBeenCalledWith(room.code);

    const hostSocket = makeSocket({ id: 'host-socket' });
    delete hostSocket.roomCode;
    delete hostSocket.playerId;
    const hostCallback = jest.fn();
    await handleJoinRoom(io, hostSocket)({
      roomCode: room.code,
      playerId: host._id,
      hostCapability: hostSecret
    }, hostCallback);
    expect(hostCallback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(Player.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: host._id, room: roomId, isHost: true }),
      expect.any(Object),
      expect.any(Object)
    );
  });
});

describe('trivia answer HTTP disclosure boundary', () => {
  const answerCanary = 'PRIVATE_TRIVIA_ANSWER_CANARY';
  const makeGame = () => ({
    _id: new mongoose.Types.ObjectId(),
    activeChallenge: {
      type: 'trivia',
      player: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      data: { question: 'Question?', options: ['A', 'B'], correct: answerCanary }
    }
  });

  test('does not expose the trivia answer through public room GET', async () => {
    const room = makeRoom({ currentGame: makeGame() });
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));

    const response = await request(app).get(`/api/rooms/${room.code}`);

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(answerCanary);
  });

  test('does not expose the trivia answer through public game GET', async () => {
    const game = makeGame();
    const query = { populate: jest.fn().mockResolvedValue(game) };
    jest.spyOn(Game, 'findById').mockReturnValue(query);

    const response = await request(app).get(`/api/games/${game._id}`);

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(answerCanary);
  });

  test('does not disclose the trivia answer in a guest reconnect response', async () => {
    const roomId = new mongoose.Types.ObjectId();
    const playerId = new mongoose.Types.ObjectId();
    const secret = 'p'.repeat(43);
    const player = {
      _id: playerId,
      room: roomId,
      isHost: false,
      isConnected: false,
      guestCapabilityHash: capabilityHash(secret, roomId.toString(), playerId.toString()),
      save: jest.fn().mockResolvedValue(undefined),
      toObject() { const result = { ...this }; delete result.toObject; return result; }
    };
    const room = makeRoom({
      _id: roomId,
      currentGame: makeGame(),
      players: [player]
    });
    room.currentGame.room = roomId;
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));
    jest.spyOn(Player, 'findById').mockReturnValue(asPlayerQuery(player));
    jest.spyOn(Player, 'findOneAndUpdate').mockResolvedValue({ ...player, isConnected: true });

    const response = await request(app)
      .post(`/api/rooms/${room.code}/reconnect`)
      .set('x-player-capability', secret)
      .send({ playerId: playerId.toString() });

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(answerCanary);
  });
});

describe('guest reconnect HTTP boundary', () => {
  test('rejects a guest without the matching capability before changing connected state', async () => {
    const roomId = new mongoose.Types.ObjectId();
    const secret = 'm'.repeat(43);
    const player = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', room: roomId, isHost: false, isConnected: false,
      guestCapabilityHash: capabilityHash(secret, roomId.toString(), 'aaaaaaaaaaaaaaaaaaaaaaaa'),
      save: jest.fn().mockResolvedValue(undefined),
      toObject() { const result = { ...this }; delete result.toObject; return result; }
    };
    const room = makeRoom({ _id: roomId, players: [player] });
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));
    jest.spyOn(Player, 'findById').mockReturnValue(asPlayerQuery(player));
    jest.spyOn(Player, 'findOneAndUpdate').mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/rooms/${room.code}/reconnect`)
      .send({ playerId: player._id });

    expect(response.status).toBe(403);
    expect(player.isConnected).toBe(false);
    expect(player.save).not.toHaveBeenCalled();
    expect(Player.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('allows only the matching guest capability and omits the hash from reconnect data', async () => {
    const roomId = new mongoose.Types.ObjectId();
    const secret = 'n'.repeat(43);
    const player = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', room: roomId, isHost: false, isConnected: false,
      guestCapabilityHash: capabilityHash(secret, roomId.toString(), 'aaaaaaaaaaaaaaaaaaaaaaaa'),
      name: 'Guest A', cardNumber: 42, bingoCard: { matrix: [[1]], markedCells: [] },
      save: jest.fn().mockResolvedValue(undefined),
      toObject() { const result = { ...this }; delete result.toObject; return result; }
    };
    const room = makeRoom({ _id: roomId, players: [player] });
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));
    jest.spyOn(Player, 'findById').mockReturnValue(asPlayerQuery(player));
    jest.spyOn(Player, 'findOneAndUpdate').mockResolvedValue({ ...player, isConnected: true });

    const response = await request(app)
      .post(`/api/rooms/${room.code}/reconnect`)
      .set('x-player-capability', secret)
      .send({ playerId: player._id });

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(player.guestCapabilityHash);
    expect(response.body.player.guestCapabilityHash).toBeUndefined();
    expect(Player.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: player._id, room: roomId, guestCapabilityHash: player.guestCapabilityHash }),
      expect.any(Object),
      expect.any(Object)
    );
  });
});

describe('player-id REST ownership', () => {
  const setupGuest = (secret = 'p'.repeat(43)) => {
    const roomId = new mongoose.Types.ObjectId();
    const player = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', room: roomId, isHost: false, isConnected: true,
      guestCapabilityHash: capabilityHash(secret, roomId.toString(), 'aaaaaaaaaaaaaaaaaaaaaaaa'),
      stats: { points: 10 }, name: 'Guest A',
      save: jest.fn().mockResolvedValue(undefined)
    };
    const room = { _id: roomId, players: [player], host: 'host-a' };
    jest.spyOn(Player, 'findById').mockReturnValue(asPlayerQuery(player));
    jest.spyOn(Room, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue(room) });
    jest.spyOn(Player, 'findOneAndUpdate').mockResolvedValue({ ...player, stats: { points: 15 } });
    return { roomId, player, room, secret };
  };

  test('denies player reads without their capability and does not disclose the player', async () => {
    const { player } = setupGuest();
    const response = await request(app).get(`/api/players/${player._id}`);
    expect(response.status).toBe(403);
    expect(response.body.player).toBeUndefined();
  });

  test('returns a hash-free player view only to its owner', async () => {
    const { player, secret } = setupGuest();
    const response = await request(app)
      .get(`/api/players/${player._id}`)
      .set('x-player-capability', secret);

    expect(response.status).toBe(200);
    expect(response.body.player.guestCapabilityHash).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(player.guestCapabilityHash);
  });

  test('rejects points mutation with another or missing capability without changing points', async () => {
    const { player } = setupGuest();
    const response = await request(app)
      .patch(`/api/players/${player._id}/points`)
      .send({ points: 5 });

    expect(response.status).toBe(403);
    expect(player.stats.points).toBe(10);
    expect(Player.findOneAndUpdate).not.toHaveBeenCalled();
    expect(player.save).not.toHaveBeenCalled();
  });
});

describe('claim-bingo socket ownership', () => {
  const runClaim = async ({ socket, player, ownerResult, data }) => {
    const room = {
      _id: 'room-a',
      code: 'ROOMA1',
      currentGame: 'game-a',
      gameState: 'playing',
      config: { tieBreakEnabled: false },
      save: jest.fn().mockResolvedValue(undefined)
    };
    const game = { _id: 'game-a', status: 'playing', calledNumbers: [], save: jest.fn().mockResolvedValue(undefined) };
    jest.spyOn(Room, 'findOne').mockReturnValue(asQuery(room));
    jest.spyOn(Game, 'findById').mockResolvedValue(game);
    jest.spyOn(Player, 'findById').mockResolvedValue(player);
    jest.spyOn(Player, 'findOneAndUpdate').mockResolvedValue(ownerResult);
    const { io, emit } = makeRoomIO();

    await handleClaimBingo(io, socket)(data);
    return { room, game, emit };
  };

  test('rejects a same-room guest spoofing another playerId before game effects', async () => {
    const socket = makeSocket({ id: 'socket-attacker', playerId: 'aaaaaaaaaaaaaaaaaaaaaaaattacker' });
    const target = { _id: 'player-victim', bingoCard: { markedCells: [] }, name: 'Victim' };
    const { room, emit } = await runClaim({
      socket,
      player: target,
      ownerResult: null,
      data: { roomCode: 'ROOMA1', playerId: 'player-victim', bingoType: 'full' }
    });

    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(Player.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Player.findById).not.toHaveBeenCalled();
    expect(room.save).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  test('rejects a stale socket when atomic owner comparison finds a newer socket', async () => {
    const socket = makeSocket({ id: 'socket-old', playerId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    const player = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Guest A', bingoCard: { markedCells: [] }, stats: {} };
    const { room, emit } = await runClaim({
      socket,
      player,
      ownerResult: null,
      data: { roomCode: 'ROOMA1', playerId: 'aaaaaaaaaaaaaaaaaaaaaaaa', bingoType: 'full' }
    });

    expect(Player.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', room: 'room-a', socketId: 'socket-old', isConnected: true }),
      expect.any(Object),
      expect.any(Object)
    );
    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    expect(room.save).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  test('allows the current room/player/socket owner to submit their claim', async () => {
    const socket = makeSocket({ id: 'socket-current', playerId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    const player = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Guest A', bingoCard: { markedCells: [] }, stats: {} };
    const { emit } = await runClaim({
      socket,
      player,
      ownerResult: player,
      data: { roomCode: 'ROOMA1', playerId: 'aaaaaaaaaaaaaaaaaaaaaaaa', bingoType: 'full' }
    });

    expect(Player.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', room: 'room-a', socketId: 'socket-current', isConnected: true }),
      expect.any(Object),
      expect.any(Object)
    );
    expect(emit).toHaveBeenCalledWith('bingo-claimed', { playerId: 'aaaaaaaaaaaaaaaaaaaaaaaa', bingoType: 'full' });
  });
});
