const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Server } = require('socket.io');
const socketClient = require('socket.io-client');

const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const roomRoutes = require('../routes/roomRoutes');
const gameRoutes = require('../routes/gameRoutes');
const playerRoutes = require('../routes/playerRoutes');
const socketHandlers = require('../socket/socketHandlers');
const { socketAuthMiddleware } = require('../middleware/socketAuthMiddleware');

jest.setTimeout(30000);

let mongoServer;
let mongoPath;
let server;
let io;
let baseUrl;
const clients = [];

const waitForSocketEvent = (socket, eventName, timeout = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for socket event: ${eventName}`)), timeout);
  socket.once(eventName, (payload) => {
    clearTimeout(timer);
    resolve(payload);
  });
});

const emitWithAck = (socket, eventName, payload) => new Promise((resolve, reject) => {
  socket.timeout(5000).emit(eventName, payload, (error, response) => {
    if (error) return reject(error);
    return resolve(response);
  });
});

const connectSocket = async () => {
  const socket = socketClient.io(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: 5000
  });
  clients.push(socket);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
};

const waitFor = async (predicate, message, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(message);
};

const makeRoom = async (hostName) => {
  const response = await request(server)
    .post('/api/rooms/create')
    .send({ hostName });
  expect(response.status).toBe(200);
  return response.body;
};

const joinRoom = async (roomCode, playerName) => {
  const response = await request(server)
    .post('/api/rooms/join')
    .send({ roomCode, playerName });
  expect(response.status).toBe(200);
  return response.body;
};

const getMongoBinaryOptions = () => {
  const configuredPath = process.env.MONGOMS_SYSTEM_BINARY?.trim();
  if (!configuredPath) return undefined;

  const resolvedPath = path.resolve(configuredPath);
  try {
    if (!fs.statSync(resolvedPath).isFile()) throw new Error('not a file');
    fs.accessSync(resolvedPath, fs.constants.X_OK);
  } catch {
    throw new Error('MONGOMS_SYSTEM_BINARY must point to an executable file');
  }

  return { systemBinary: resolvedPath };
};

beforeAll(async () => {
  mongoPath = fs.mkdtempSync(path.join(__dirname, '../.tmp-u1-integration-'));
  mongoServer = await MongoMemoryServer.create({
    binary: getMongoBinaryOptions(),
    instance: {
      dbPath: mongoPath,
      dbName: `bingo_u1_${crypto.randomBytes(6).toString('hex')}`,
      port: 0
    }
  });
  const dbName = `bingo_u1_${crypto.randomBytes(6).toString('hex')}`;
  await mongoose.connect(mongoServer.getUri(dbName));

  const app = express();
  app.use(express.json());
  app.use('/api/rooms', roomRoutes);
  app.use('/api/players', playerRoutes);
  app.use('/api/games', gameRoutes);

  server = http.createServer(app);
  io = new Server(server, { transports: ['websocket'] });
  io.use(socketAuthMiddleware);
  io.on('connection', (socket) => socketHandlers(io, socket));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  for (const client of clients) client.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  if (mongoose.connection.readyState) await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
  if (mongoPath && fs.existsSync(mongoPath)) fs.rmSync(mongoPath, { recursive: true, force: true });
});

test('integrates HTTP, Socket.IO, room capabilities, reconnects, TV tie-break, and secret redaction on isolated MongoDB', async () => {
  // 1. Create a host room; the creator receives private capabilities only in this response.
  const created = await makeRoom('Integration Host');
  const { room, player: host, hostCapability, tvCapability } = created;
  expect(hostCapability).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(tvCapability).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // 2. Add two independent guest players.
  const guestA = await joinRoom(room.code, 'Guest Alpha');
  const guestB = await joinRoom(room.code, 'Guest Bravo');
  expect(guestA.player._id).not.toBe(guestB.player._id);
  expect(guestA.playerCapability).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(guestB.playerCapability).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // 3. Assign distinct cards with each guest's own capability.
  for (const [guest, cardNumber] of [[guestA, 1], [guestB, 2]]) {
    const response = await request(server)
      .post(`/api/rooms/${room.code}/select-card`)
      .set('x-player-capability', guest.playerCapability)
      .send({ playerId: guest.player._id, cardNumber });
    expect(response.status).toBe(200);
    expect(response.body.cardNumber).toBe(cardNumber);
  }
  const cardA = await Player.findById(guestA.player._id);
  const cardB = await Player.findById(guestB.player._id);
  expect(cardA.cardNumber).toBe(1);
  expect(cardB.cardNumber).toBe(2);

  // 4. Connect host, both guests, and the TV; verify role-bound socket joins.
  const hostSocket = await connectSocket();
  const guestSocketA = await connectSocket();
  const guestSocketB = await connectSocket();
  const publicEvents = [];
  for (const client of [hostSocket, guestSocketA, guestSocketB]) {
    for (const eventName of ['player-joined', 'room-info', 'game-state-changed', 'game-state-update']) {
      client.on(eventName, (payload) => publicEvents.push(payload));
    }
  }
  expect(await emitWithAck(hostSocket, 'join-room', {
    roomCode: room.code, playerId: host._id, hostCapability
  })).toMatchObject({ success: true });
  expect(await emitWithAck(guestSocketA, 'join-room', {
    roomCode: room.code, playerId: guestA.player._id, playerCapability: guestA.playerCapability
  })).toMatchObject({ success: true });
  expect(await emitWithAck(guestSocketB, 'join-room', {
    roomCode: room.code, playerId: guestB.player._id, playerCapability: guestB.playerCapability
  })).toMatchObject({ success: true });

  const tvSocket = await connectSocket();
  expect(await emitWithAck(tvSocket, 'join-room', {
    roomCode: room.code, playerId: 'tv-display', tvCapability
  })).toMatchObject({ success: true });

  // 5. Start over HTTP and pause/resume over the authenticated host socket.
  const start = await request(server)
    .post('/api/games/start')
    .set('x-room-host-capability', hostCapability)
    .send({ roomId: room._id });
  expect(start.status).toBe(200);
  const paused = waitForSocketEvent(guestSocketA, 'game-state-changed');
  hostSocket.emit('pause-game', { roomCode: room.code, hostCapability });
  expect(await paused).toEqual({ state: 'paused' });
  expect((await Room.findById(room._id)).gameState).toBe('paused');
  const resumed = waitForSocketEvent(guestSocketA, 'game-state-changed');
  hostSocket.emit('resume-game', { roomCode: room.code, hostCapability });
  expect(await resumed).toEqual({ state: 'playing' });

  // 6. Reclaim the host from a second, valid host socket; old disconnect must not clear the new owner.
  const hostDisconnected = waitForSocketEvent(hostSocket, 'disconnect');
  const replacementHostSocket = await connectSocket();
  expect(await emitWithAck(replacementHostSocket, 'join-room', {
    roomCode: room.code, playerId: host._id, hostCapability
  })).toMatchObject({ success: true });
  await hostDisconnected;
  const storedHost = await Player.findById(host._id);
  expect(storedHost.socketId).toBe(replacementHostSocket.id);
  expect(storedHost.isConnected).toBe(true);

  // 7. Disconnect/reconnect a guest through the capability-gated HTTP route and a new socket.
  const guestDisconnected = waitForSocketEvent(guestSocketA, 'disconnect');
  guestSocketA.disconnect();
  await guestDisconnected;
  await waitFor(async () => {
    const player = await Player.findById(guestA.player._id);
    return !player?.isConnected && !player?.socketId;
  }, 'Guest disconnect ownership was not released');
  const reconnect = await request(server)
    .post(`/api/rooms/${room.code}/reconnect`)
    .set('x-player-capability', guestA.playerCapability)
    .send({ playerId: guestA.player._id });
  expect(reconnect.status).toBe(200);
  const replacementGuestSocket = await connectSocket();
  expect(await emitWithAck(replacementGuestSocket, 'join-room', {
    roomCode: room.code, playerId: guestA.player._id, playerCapability: guestA.playerCapability
  })).toMatchObject({ success: true });

  // 8. A guest cannot replace the other guest's card, even within the same room.
  const crossOwnerCard = await request(server)
    .post(`/api/rooms/${room.code}/select-card`)
    .set('x-player-capability', guestA.playerCapability)
    .send({ playerId: guestB.player._id, cardNumber: 3 });
  expect(crossOwnerCard.status).toBe(403);
  expect((await Player.findById(guestB.player._id)).cardNumber).toBe(2);

  // 9. A socket cannot claim bingo for the other guest.
  const beforeBingo = await Room.findById(room._id);
  const bingoError = waitForSocketEvent(replacementGuestSocket, 'error');
  replacementGuestSocket.emit('claim-bingo', {
    roomCode: room.code, playerId: guestB.player._id, bingoType: 'full'
  });
  expect(await bingoError).toEqual(expect.objectContaining({ message: expect.any(String) }));
  expect((await Room.findById(room._id)).gameState).toBe(beforeBingo.gameState);

  // 10. A valid guest identity cannot act against another room.
  const otherRoomResponse = await makeRoom('Other Room Host');
  const otherGuest = await joinRoom(otherRoomResponse.room.code, 'Other Guest');
  const crossRoomCard = await request(server)
    .post(`/api/rooms/${otherRoomResponse.room.code}/select-card`)
    .set('x-player-capability', guestA.playerCapability)
    .send({ playerId: otherGuest.player._id, cardNumber: 3 });
  expect(crossRoomCard.status).toBe(403);
  const crossRoomError = waitForSocketEvent(replacementGuestSocket, 'error');
  replacementGuestSocket.emit('claim-bingo', {
    roomCode: otherRoomResponse.room.code, playerId: guestA.player._id, bingoType: 'full'
  });
  expect(await crossRoomError).toEqual(expect.objectContaining({ message: expect.any(String) }));

  // 11. State sync is tied to the reconnecting guest and redacts trivia answers.
  const activeGame = await Game.findById(start.body.game._id);
  activeGame.activeChallenge = {
    type: 'trivia',
    player: guestA.player._id,
    data: { question: 'Public trivia question?', options: ['wrong', 'right'], correct: 'PRIVATE_INTEGRATION_ANSWER_CANARY' },
    startTime: new Date()
  };
  await activeGame.save();
  const synchronized = await emitWithAck(replacementGuestSocket, 'sync-game-state', {
    roomCode: room.code, playerId: guestA.player._id
  });
  expect(synchronized.success).toBe(true);
  expect(synchronized.data.activeChallenge.data.correct).toBeUndefined();
  expect(JSON.stringify(synchronized)).not.toContain('PRIVATE_INTEGRATION_ANSWER_CANARY');
  expect(JSON.stringify(synchronized)).not.toContain('hostCapabilityHash');

  // 12. Public HTTP responses and room broadcasts never disclose private capabilities or hashes.
  const publicRoom = await request(server).get(`/api/rooms/${room.code}`);
  const publicGame = await request(server).get(`/api/games/${start.body.game._id}`);
  expect(publicRoom.status).toBe(200);
  expect(publicGame.status).toBe(200);
  for (const serialized of [JSON.stringify(publicRoom.body), JSON.stringify(publicGame.body), JSON.stringify(reconnect.body), JSON.stringify(publicEvents)]) {
    for (const secret of [hostCapability, tvCapability, guestA.playerCapability, guestB.playerCapability]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain('guestCapabilityHash');
    expect(serialized).not.toContain('hostCapabilityHash');
    expect(serialized).not.toContain('tvCapabilityHash');
    expect(serialized).not.toContain('PRIVATE_INTEGRATION_ANSWER_CANARY');
  }

  // 13. The replacement host retains room authority after overlap recovery.
  const hostStateSync = await emitWithAck(replacementHostSocket, 'sync-dashboard', {
    roomCode: room.code, hostCapability
  });
  expect(hostStateSync.success).toBe(true);
  const hostPause = waitForSocketEvent(guestSocketB, 'game-state-changed');
  replacementHostSocket.emit('pause-game', { roomCode: room.code, hostCapability });
  expect(await hostPause).toEqual({ state: 'paused' });

  // TV remains least-privilege but keeps its explicitly permitted room-bound tie-break action.
  activeGame.tieBreakActive = true;
  activeGame.tieCandidates = [guestA.player._id];
  await activeGame.save();
  const tieBreakConfirmation = waitForSocketEvent(tvSocket, 'tiebreak-performance-confirmed');
  tvSocket.emit('start-tiebreak-performance', {
    roomCode: room.code, performerId: guestA.player._id
  });
  expect(await tieBreakConfirmation).toMatchObject({ performerId: guestA.player._id, status: 'started' });
  const tvPauseError = waitForSocketEvent(tvSocket, 'error');
  tvSocket.emit('pause-game', { roomCode: room.code, tvCapability });
  expect(await tvPauseError).toBeDefined();
  expect((await Room.findById(room._id)).gameState).toBe('paused');

  // 14. Disconnect every client and assert no test sockets remain before teardown.
  for (const client of clients) client.disconnect();
  await waitFor(async () => io.sockets.sockets.size === 0, 'Test sockets remained connected after teardown');
  expect(io.sockets.sockets.size).toBe(0);
});
