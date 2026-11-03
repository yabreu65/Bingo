// Bounded protocol load: real production HTTP/socket middleware, no browser or TLS claim.
process.env.NODE_ENV = 'production';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execFileSync } = require('child_process');
const { performance, monitorEventLoopDelay } = require('perf_hooks');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { Server } = require('socket.io');
const { io: clientIO } = require('socket.io-client');
const { createApp } = require('../app');
const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const socketHandlers = require('../socket/socketHandlers');
const { socketAuthMiddleware } = require('../middleware/socketAuthMiddleware');
const { createSocketEventRateLimiter } = require('../middleware/socketRateLimiter');
const { clearAllRoomTimers } = require('../socket/utils/roomTimer');
const { clearChallengeTimer } = require('../socket/handlers/gameHandlers');
const { getCard } = require('../utils/bingoCards');

jest.setTimeout(90000);
const MAX_MS = 180000;
const MAX_RSS = 1024 * 1024 * 1024;
const report = { version: 1, profile: 'production middleware; synthetic per-room trusted-proxy IP; loopback HTTP/WebSocket',
  limits: { wallMs: MAX_MS, maxSockets: 540, nodeRssBytes: MAX_RSS, mongoRssBytes: MAX_RSS, cpuSeconds: 160 },
  machine: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0].model, logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(), node: process.version }, scenarios: [] };
let owned, mongo, server, io, url, watchdog, sample, baselineStats;
let started, baselineCpu, abortReason;
let commands = 0;
const allClients = new Set();
const pendingDisconnects = new Set();
async function drainDisconnects() {
  for (const client of allClients) client.disconnect();
  allClients.clear();
  const end = performance.now() + 10000;
  while ((io.sockets.sockets.size || pendingDisconnects.size) && performance.now() < end) {
    await Promise.allSettled([...pendingDisconnects]);
    await delay(10);
  }
  expect(io.sockets.sockets.size).toBe(0);
  expect(pendingDisconnects.size).toBe(0);
}
const createdRooms = [];
const lag = monitorEventLoopDelay({ resolution: 20 });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const p = n => sorted.length ? Math.round(sorted[Math.ceil(sorted.length * n) - 1] * 100) / 100 : 0;
  return { count: sorted.length, p50: p(.5), p95: p(.95), p99: p(.99), max: sorted.at(-1) || 0 };
};
const guard = () => { if (abortReason) throw new Error(abortReason); };
const measure = async (metrics, name, fn) => {
  guard();
  const t = performance.now();
  try { return await fn(); } finally { (metrics[name] ||= []).push(performance.now() - t); }
};
const send = async (metrics, method, route, body, ip, headers = {}) => measure(metrics, 'httpMs', async () => {
  const response = await request(server)[method](route).set('X-Forwarded-For', ip)
    .set('Origin', 'https://event.example').set(headers).send(body).timeout({ response: 20000, deadline: 25000 });
  metrics.statuses[response.status] = (metrics.statuses[response.status] || 0) + 1;
  return response;
});
const expectOK = response => { expect(response.status).toBe(200); return response.body; };
const run = async (label, action) => {
  if (abortReason) throw new Error(abortReason);
  const metrics = { label, statuses: {}, socketErrors: 0, commandsBefore: commands };
  const t = performance.now();
  const cpu = process.cpuUsage();
  try { await action(metrics); guard(); metrics.verdict = 'PASS'; }
  catch (error) { metrics.verdict = 'FAIL'; throw error; }
  finally {
    metrics.durationMs = Math.round(performance.now() - t);
    const used = process.cpuUsage(cpu);
    metrics.nodeCpuMs = (used.user + used.system) / 1000;
    metrics.mongoCommandCount = commands - metrics.commandsBefore;
    delete metrics.commandsBefore;
    for (const name of Object.keys(metrics)) if (Array.isArray(metrics[name]) && name.endsWith('Ms')) metrics[name] = stats(metrics[name]);
    try {
      await drainDisconnects();
      metrics.socketsAfterDisconnect = io.sockets.sockets.size;
      metrics.pendingDisconnectHandlers = pendingDisconnects.size;
    } catch (error) { metrics.verdict = 'FAIL'; throw error; }
    finally {
      report.scenarios.push(metrics);
      console.log('T7_SCENARIO', JSON.stringify(metrics));
    }
  }
};
const room = async (m, ip) => {
  const created = expectOK(await send(m, 'post', '/api/rooms/create', { hostName: 'Synthetic Host' }, ip));
  created.ip = ip;
  createdRooms.push(created.room.code);
  return created;
};
const admission = async (m, created, i) => {
  const admissionToken = `${created.room.code}.${crypto.randomBytes(32).toString('base64url')}`;
  const response = await measure(m, 'admissionMs', () => send(m, 'post', '/api/rooms/join', {
    roomCode: created.room.code, playerName: `Guest ${i}`, admissionToken
  }, created.ip));
  return { response, admissionToken };
};
const burst = async (m, created, count, spreadMs = 0) => {
  const origin = performance.now();
  const dispatched = [];
  const completed = await Promise.allSettled(Array.from({ length: count }, async (_, i) => {
    if (spreadMs) await delay(Math.max(0, origin + i * spreadMs / (count - 1) - performance.now()));
    dispatched.push(performance.now() - origin);
    return admission(m, created, i);
  }));
  const failed = completed.find(item => item.status === 'rejected');
  if (failed) throw failed.reason;
  const results = completed.map(item => item.value);
  const spanMs = Math.round(Math.max(...dispatched) - Math.min(...dispatched));
  const elapsedMs = performance.now() - origin;
  (m.roomBursts ||= []).push({ requests: count, dispatchSpanMs: spanMs, durationMs: Math.round(elapsedMs),
    requestsPerSecond: count * 1000 / elapsedMs });
  if (m.label !== 'E') {
    m.dispatchSpanMs = spanMs;
    m.admissionThroughputPerSecond = count * 1000 / elapsedMs;
  }
  return results;
};
const cards = async (m, created, admitted) => {
  for (const [i, item] of admitted.entries()) {
    const guest = expectOK(item.response);
    const assigned = expectOK(await measure(m, 'cardMs', () => send(m, 'post', `/api/rooms/${created.room.code}/select-card`,
      { playerId: guest.player._id, cardNumber: i + 1 }, created.ip, { 'x-player-capability': guest.playerCapability })));
    expect(assigned.bingoCard.matrix).toEqual(getCard(i + 1));
    item.guest = guest;
    item.card = assigned;
  }
};
const socket = async (m, created, identity) => measure(m, 'socketMs', async () => {
  guard();
  expect(io.sockets.sockets.size).toBeLessThan(540);
  const client = clientIO(url, { transports: ['websocket'], forceNew: true, reconnection: false, timeout: 10000,
    extraHeaders: { Origin: 'https://event.example' } });
  allClients.add(client);
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
  client.on('error', () => { m.socketErrors = (m.socketErrors || 0) + 1; });
  const ack = await new Promise((resolve, reject) => client.timeout(10000).emit('join-room',
    { roomCode: created.room.code, ...identity }, (error, response) => error ? reject(error) : resolve(response)));
  expect(ack.success).toBe(true);
  report.peakSockets = Math.max(report.peakSockets || 0, io.sockets.sockets.size);
  return client;
});
const connectGroup = async (m, created, admitted) => {
  const host = await socket(m, created, { playerId: created.player._id, hostCapability: created.hostCapability });
  const tv = await socket(m, created, { playerId: 'tv-display', tvCapability: created.tvCapability });
  // Bound handshake batches avoid unbounded client-side connection queues.
  for (let start = 0; start < admitted.length; start += 10) await Promise.all(admitted.slice(start, start + 10).map(async item => {
    item.socket = await socket(m, created, { playerId: item.guest.player._id, playerCapability: item.guest.playerCapability });
  }));
  return { host, tv };
};
const once = (client, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { client.off(event, listener); reject(new Error(`Timed out: ${event}`)); }, 10000);
  const listener = data => { clearTimeout(timer); resolve(data); };
  client.once(event, listener);
});
const audit = async (m, created, expected, expectedCards) => {
  const state = await Room.findById(created.room._id).lean();
  const players = await Player.find({ room: created.room._id }).lean();
  expect(players.map(p => String(p._id)).sort()).toEqual(state.players.map(String).sort());
  expect(players.filter(p => !p.isHost)).toHaveLength(expected);
  expect(players.filter(p => p.isHost)).toHaveLength(1);
  expect(new Set(players.map(p => String(p._id))).size).toBe(expected + 1);
  const assigned = players.filter(p => p.cardNumber != null);
  expect(assigned).toHaveLength(expectedCards);
  expect(new Set(assigned.map(p => p.cardNumber)).size).toBe(expectedCards);
  for (const p of assigned) expect(p.bingoCard.matrix).toEqual(getCard(p.cardNumber));
  (m.persisted ||= []).push({ guests: expected, hosts: 1, cards: expectedCards, duplicateIds: 0, orphans: 0, members: state.players.length });
};

beforeAll(async () => {
  owned = fs.mkdtempSync(path.join(__dirname, '../.tmp-t7-'));
  fs.mkdirSync(path.join(owned, 'db'));
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = owned;
  try {
    mongo = await MongoMemoryReplSet.create({ binary: { downloadDir: path.join(__dirname, '../node_modules/.cache/t5-mongodb') },
      instanceOpts: [{ dbPath: path.join(owned, 'db'), args: ['--wiredTigerCacheSizeGB', '0.25'] }],
      replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger',
        auth: { enable: true, customRootName: 't7_synthetic', customRootPwd: 'SYNTHETIC_T7_ONLY_PASSWORD' } } });
  } finally { if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous; }
  await mongoose.connect(mongo.getUri('t7_only'), { user: 't7_synthetic', pass: 'SYNTHETIC_T7_ONLY_PASSWORD', authSource: 'admin',
    maxPoolSize: 50, monitorCommands: true, serverSelectionTimeoutMS: 3000 });
  mongoose.connection.getClient().on('commandStarted', () => { commands++; });
  await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));
  const app = createApp({ networkPolicy: { mode: 'public', frontendOrigin: 'https://event.example',
    allowedOrigins: ['https://event.example'], trustProxyHops: 1 } });
  server = http.createServer(app);
  io = new Server(server, { transports: ['websocket'], maxHttpBufferSize: 100 * 1024,
    allowRequest: (req, cb) => cb(null, req.headers.origin === 'https://event.example') });
  app.set('io', io);
  io.use(socketAuthMiddleware);
  io.on('connection', s => {
    s.use(createSocketEventRateLimiter()); socketHandlers(io, s);
    // Socket.IO removes a socket before its async disconnect listeners finish.
    // Await those existing listeners before closing the fixture database.
    const listeners = s.listeners('disconnect');
    s.removeAllListeners('disconnect');
    s.on('disconnect', (...args) => {
      const task = Promise.allSettled(listeners.map(listener => listener(...args)));
      pendingDisconnects.add(task);
      task.finally(() => pendingDisconnects.delete(task));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  expect((await request(server).get('/api/ready')).status).toBe(200);
  baselineStats = await mongoose.connection.db.stats();
  started = performance.now(); baselineCpu = process.cpuUsage(); lag.enable();
  sample = setInterval(() => {
    report.peakNodeRssBytes = Math.max(report.peakNodeRssBytes || 0, process.memoryUsage().rss);
    const pid = mongo.servers[0].instanceInfo.instance.mongodProcess.pid;
    try {
      const [cpu, rss] = execFileSync('ps', ['-p', String(pid), '-o', '%cpu=', '-o', 'rss='], { encoding: 'utf8', timeout: 1000 }).trim().split(/\s+/).map(Number);
      report.peakMongoCpuPercent = Math.max(report.peakMongoCpuPercent || 0, cpu);
      report.peakMongoRssBytes = Math.max(report.peakMongoRssBytes || 0, rss * 1024);
    } catch { report.mongoResourceSamplingUnavailable = true; }
    const cpu = process.cpuUsage(baselineCpu);
    if (performance.now() - started > MAX_MS || process.memoryUsage().rss > MAX_RSS ||
        report.peakMongoRssBytes > MAX_RSS || (cpu.user + cpu.system) / 1e6 > 160) {
      abortReason = 'T7 resource/time budget exceeded';
      for (const client of allClients) client.disconnect();
      server.close();
    }
  }, 500);
  watchdog = setTimeout(() => { abortReason = 'T7 hard wall limit'; for (const client of allClients) client.disconnect(); server.close(); }, MAX_MS);
});
afterAll(async () => {
  clearInterval(sample); clearTimeout(watchdog); lag.disable();
  try {
    if (mongoose.connection.readyState === 1) {
      const final = await mongoose.connection.db.stats();
      report.database = { rooms: await Room.countDocuments(), players: await Player.countDocuments(), games: await Game.countDocuments(),
        dataBytes: final.dataSize, dataGrowthBytes: final.dataSize - baselineStats.dataSize, commandCount: commands };
    }
    const cpu = process.cpuUsage(baselineCpu);
    report.durationMs = Math.round(performance.now() - started);
    report.nodeCpuMs = (cpu.user + cpu.system) / 1000;
    report.eventLoopDelayMs = { p95: lag.percentile(95) / 1e6, p99: lag.percentile(99) / 1e6 };
    report.abortReason = abortReason || null;
    fs.writeFileSync(path.join(__dirname, '../.t7-latest-metrics.json'), JSON.stringify(report, null, 2));
    console.log('T7_FINAL', JSON.stringify(report));
  } finally {
    for (const code of createdRooms) { clearAllRoomTimers(code); clearChallengeTimer(code); }
    if (io) await drainDisconnects();
    if (io) await new Promise(resolve => io.close(resolve));
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
    if (owned) fs.rmSync(owned, { recursive: true, force: true });
  }
});

test('A: 50 requests dispatched within one second create 50 identities and valid cards', () => run('A', async m => {
  const created = await room(m, '198.18.1.1');
  const admitted = await burst(m, created, 50);
  expect(m.dispatchSpanMs).toBeLessThanOrEqual(1000);
  expect(admitted.filter(x => x.response.status === 200)).toHaveLength(50);
  await cards(m, created, admitted);
  await audit(m, created, 50, 50);
}));

test('B: 50 requests over five seconds join Socket.IO and receive authorized later events', () => run('B', async m => {
  const created = await room(m, '198.18.2.1');
  const admitted = await burst(m, created, 50, 5000);
  expect(m.dispatchSpanMs).toBeGreaterThanOrEqual(4900);
  expect(m.dispatchSpanMs).toBeLessThan(6500);
  await cards(m, created, admitted);
  const { host, tv } = await connectGroup(m, created, admitted);
  const t = performance.now();
  const deliveries = [...admitted.map(x => x.socket), tv].map(client => once(client, 'launch-event').then(data => {
    expect(data).toEqual({ type: 't7-probe', text: 'SYNTHETIC_B_EVENT' });
    (m.eventMs ||= []).push(performance.now() - t);
  }));
  host.emit('launch-event', { roomCode: created.room.code, type: 't7-probe', text: 'SYNTHETIC_B_EVENT', hostCapability: created.hostCapability });
  await Promise.all(deliveries);
  expect(m.socketErrors || 0).toBe(0);
  await audit(m, created, 50, 50);
}));

test('C: 100 simultaneous admissions compete for 50 slots; rejected requests persist nothing', () => run('C', async m => {
  const created = await room(m, '198.18.3.1');
  const results = await burst(m, created, 100);
  expect(results.filter(x => x.response.status === 200)).toHaveLength(50);
  const denied = results.filter(x => x.response.status !== 200);
  expect(denied).toHaveLength(50);
  for (const item of denied) { expect(item.response.status).toBe(400); expect(item.response.body).toEqual({ error: 'Sala llena' }); }
  await audit(m, created, 50, 0);
}));

test('D: reconnect 10 of 50 guests, preserve cards/membership and reject session takeover', () => run('D', async m => {
  const created = await room(m, '198.18.4.1');
  const admitted = await burst(m, created, 50);
  await cards(m, created, admitted);
  await connectGroup(m, created, admitted);
  for (const item of admitted.slice(0, 10)) {
    const previous = item.socket.id;
    item.socket.disconnect();
    const end = performance.now() + 3000;
    while (performance.now() < end && await Player.exists({ _id: item.guest.player._id, socketId: previous })) await delay(10);
    expect(await Player.exists({ _id: item.guest.player._id, socketId: previous })).toBeNull();
    const restored = expectOK(await measure(m, 'reconnectMs', () => send(m, 'post', `/api/rooms/${created.room.code}/reconnect`,
      { playerId: item.guest.player._id }, created.ip, { 'x-player-capability': item.guest.playerCapability })));
    expect(restored.player._id).toBe(item.guest.player._id);
    expect(restored.player.bingoCard).toEqual(item.card.bingoCard);
    item.socket = await socket(m, created, { playerId: item.guest.player._id, playerCapability: item.guest.playerCapability });
    const retry = expectOK(await send(m, 'post', '/api/rooms/join', { roomCode: created.room.code,
      playerName: 'Retry Guest', admissionToken: item.admissionToken }, created.ip));
    expect(retry.player._id).toBe(item.guest.player._id);
    expect(retry.player.bingoCard).toEqual(item.card.bingoCard);
  }
  const before = await Player.findById(admitted[0].guest.player._id).lean();
  const rejected = await send(m, 'post', `/api/rooms/${created.room.code}/reconnect`, { playerId: before._id }, created.ip,
    { 'x-player-capability': admitted[1].guest.playerCapability });
  expect(rejected.status).toBe(403);
  expect(await Player.findById(before._id).lean()).toEqual(before);
  await audit(m, created, 50, 50);
}));

test('E: ten independent rooms with 500 guests isolate real number, challenge and room events', () => run('E', async m => {
  const groups = [];
  for (let i = 0; i < 10; i++) groups.push({ created: await room(m, `198.19.${i}.1`) });
  // E requires 500 simultaneous members, not 500 simultaneous TCP handshakes.
  // Keep 50-way room bursts, with two rooms at a time, below the local accept backlog.
  m.admissionSchedule = '2 rooms at a time, 50 simultaneous requests per room';
  const admissionsStarted = performance.now();
  for (let i = 0; i < groups.length; i += 2) {
    const batch = await Promise.allSettled(groups.slice(i, i + 2).map(async group => {
      group.admitted = await burst(m, group.created, 50);
    }));
    const failed = batch.find(item => item.status === 'rejected');
    if (failed) throw failed.reason;
  }
  m.aggregateAdmissionDurationMs = Math.round(performance.now() - admissionsStarted);
  m.aggregateAdmissionsPerSecond = 500000 / m.aggregateAdmissionDurationMs;
  for (const group of groups) {
    await cards(m, group.created, group.admitted);
    Object.assign(group, await connectGroup(m, group.created, group.admitted));
    const started = expectOK(await send(m, 'post', '/api/games/start', { roomId: group.created.room._id }, group.created.ip,
      { 'x-room-host-capability': group.created.hostCapability }));
    group.gameId = started.game._id;
  }
  expect(io.sockets.sockets.size).toBe(520);
  const received = new Map();
  for (const [index, group] of groups.entries()) for (const item of group.admitted) {
    const record = { number: [], challenge: [], event: [] }; received.set(item.socket.id, record);
    item.socket.on('number-called', data => record.number.push(data.number));
    item.socket.on('challenge-triggered', data => record.challenge.push(String(data.roomCode || 'received')));
    item.socket.on('launch-event', data => record.event.push(data.text));
    item.groupIndex = index;
  }
  for (const [index, group] of groups.entries()) {
    const targets = [...group.admitted.map(x => x.socket), group.tv];
    const t = performance.now();
    const numberReceived = targets.map(client => once(client, 'number-called').then(data => {
      expect(data.number).toBe(index + 1); (m.numberEventMs ||= []).push(performance.now() - t);
    }));
    group.host.emit('call-number', { roomCode: group.created.room.code, number: index + 1, hostCapability: group.created.hostCapability });
    await Promise.all(numberReceived);
    const challengeReceived = targets.map(client => once(client, 'challenge-triggered'));
    group.host.emit('launch-event', { roomCode: group.created.room.code, type: 'dance', hostCapability: group.created.hostCapability });
    await Promise.all(challengeReceived);
    clearChallengeTimer(group.created.room.code); clearAllRoomTimers(group.created.room.code);
    const eventReceived = targets.map(client => once(client, 'launch-event'));
    group.host.emit('launch-event', { roomCode: group.created.room.code, type: 't7-probe', text: `ROOM_${index}`, hostCapability: group.created.hostCapability });
    await Promise.all(eventReceived);
  }
  // Barrier: all server handlers/events above completed, then allow queued transport frames to drain.
  await delay(100);
  for (const [index, group] of groups.entries()) {
    for (const item of group.admitted) {
      const record = received.get(item.socket.id);
      expect(record.number).toEqual([index + 1]);
      expect(record.challenge).toHaveLength(1);
      expect(record.event).toEqual([`ROOM_${index}`]);
      const sync = await new Promise((resolve, reject) => item.socket.timeout(5000).emit('sync-game-state',
        { roomCode: group.created.room.code, playerId: item.guest.player._id }, (err, ack) => err ? reject(err) : resolve(ack)));
      expect(sync.success).toBe(true);
      expect(sync.data.calledNumbers).toEqual([index + 1]);
      expect(sync.data.playerData.bingoCard.matrix).toEqual(item.card.bingoCard.matrix);
      expect(sync.data.activeChallenge).toBeTruthy();
    }
    await audit(m, group.created, 50, 50);
    const game = await Game.findById(group.gameId).lean();
    expect(game.calledNumbers).toEqual([index + 1]);
    expect(game.activeChallenge).toBeTruthy();
  }
  expect(m.socketErrors || 0).toBe(0);
  m.globalGuests = groups.reduce((n, group) => n + group.admitted.length, 0);
  m.activeSockets = io.sockets.sockets.size;
}));
