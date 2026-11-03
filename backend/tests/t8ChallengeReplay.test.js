const fs = require('fs');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { Server } = require('socket.io');
const { io: clientIO } = require('socket.io-client');
const { createApp } = require('../app');
const Game = require('../models/Game');
const Player = require('../models/Player');
const { registerChallengeHandlers } = require('../socket/handlers/challengeHandlers');
const gameHandlers = require('../socket/handlers/gameHandlers');
const { getChallengePoints } = require('../utils/challengeRules');
jest.setTimeout(20000);
let owned, mongo, server, io;
const app = createApp({ networkPolicy: { mode: 'local', frontendOrigin: 'http://localhost:5173', allowedOrigins: ['http://localhost:5173'], trustProxyHops: 0 } });
beforeAll(async () => {
  owned = fs.mkdtempSync(path.join(__dirname, '../.tmp-t8-replay-'));
  mongo = await MongoMemoryReplSet.create({ binary: { downloadDir: path.join(__dirname, '../node_modules/.cache/t5-mongodb') },
    instanceOpts: [{ dbPath: owned }], replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri('t8_replay'));
  await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));
  server = http.createServer(app); io = new Server(server, { transports: ['websocket'] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
});
afterAll(async () => {
  jest.restoreAllMocks();
  if (io) await new Promise(resolve => io.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  if (owned) fs.rmSync(owned, { recursive: true, force: true });
});

test.each(['dance', 'riddle'])('simultaneous legitimate %s replies award once and emit one completion', async type => {
  const created = await request(server).post('/api/rooms/create').send({ hostName: 'Replay Host' });
  expect(created.status).toBe(200);
  const code = created.body.room.code;
  const joined = await request(server).post('/api/rooms/join').send({ roomCode: code, playerName: 'Performer', admissionToken: `${code}.${'q'.repeat(43)}` });
  expect(joined.status).toBe(200);
  const player = joined.body.player;
  const challengeId = `t8-${type}`;
  const game = await Game.create({ room: created.body.room._id, availableNumbers: [1, 2], calledNumbers: [],
    activeChallenge: { id: challengeId, type, player: player._id, data: { answers: ['yes'] }, responses: [], pointsAwarded: false } });
  const Room = require('../models/Room');
  await Room.updateOne({ _id: created.body.room._id }, { $set: { currentGame: game._id, gameState: 'paused' } });
  // Only unrelated next-number/timer orchestration is suppressed; real socket handlers,
  // auth-bound identity, Mongo persistence, points and HTTP player API stay live.
  jest.spyOn(gameHandlers, 'immediateNextNumberUnlocked').mockResolvedValue(undefined);
  jest.spyOn(gameHandlers, 'scheduleRoomInterval').mockResolvedValue(undefined);
  const timerSpy = jest.spyOn(require('../socket/utils/roomTimer'), 'ensureWatchdog').mockImplementation(() => {});
  let serverSocket;
  io.once('connection', async s => {
    serverSocket = s; s.roomCode = code; s.playerId = player._id;
    await Player.updateOne({ _id: player._id }, { $set: { socketId: s.id, isConnected: true } });
    s.join(code); registerChallengeHandlers(io, s); s.emit('fixture-ready');
  });
  const client = clientIO(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  const done = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket fixture timeout')), 5000);
    client.once('fixture-ready', () => { clearTimeout(timeout); resolve(); });
  });
  await done;
  const completions = [];
  client.on('challenge-completed', data => completions.push(data));
  const originalRead = Game.findById.bind(Game);
  let readers = 0, release;
  const bothSnapshots = new Promise(resolve => { release = resolve; });
  const readSpy = jest.spyOn(Game, 'findById').mockImplementation(async (...args) => {
    const doc = await originalRead(...args);
    if (++readers <= 2) { if (readers === 2) release(); await bothSnapshots; }
    return doc;
  });
  const event = type === 'riddle' ? 'challenge-answer' : 'challenge-complete';
  const handlers = serverSocket.listeners(event);
  let handled = 0, resolveHandled;
  const allHandled = new Promise(resolve => { resolveHandled = resolve; });
  serverSocket.removeAllListeners(event);
  serverSocket.on(event, async data => { try { await handlers[0](data); } finally { if (++handled === 2) resolveHandled(); } });
  try {
    const payload = { roomCode: code, playerId: player._id, challengeId, type, answer: 'yes' };
    client.emit(event, payload); client.emit(event, payload);
    let timeout;
    try {
      await Promise.race([allHandled, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Handlers did not finish')), 5000); })]);
    } finally { clearTimeout(timeout); }
    await new Promise(resolve => setImmediate(resolve));
    const response = await request(server).get(`/api/players/${player._id}`).set('x-player-capability', joined.body.playerCapability);
    expect(response.status).toBe(200);
    expect(response.body.player.stats.points).toBe(getChallengePoints(type, { success: true }));
    expect(response.body.player.stats.challengesCompleted).toBe(1);
    expect(completions).toHaveLength(1);
    const final = await Game.findOne({ room: created.body.room._id });
    expect(final.activeChallenge).toBeNull();
    expect(final.gameEvents.filter(e => e.type === 'challenge_completed')).toHaveLength(1);
  } finally {
    client.disconnect(); readSpy.mockRestore(); timerSpy.mockRestore(); jest.restoreAllMocks();
  }
});
