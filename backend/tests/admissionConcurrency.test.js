const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Room = require('../models/Room');
const Player = require('../models/Player');
require('../models/Game');
const routes = require('../routes/roomRoutes');
const { getCard } = require('../utils/bingoCards');

jest.setTimeout(120000);
let mongo;
let server;
let dataPath;
const metrics = [];
let scenarioStart;
beforeEach(() => { scenarioStart = performance.now(); });
afterEach(() => { metrics.push({ scenario: expect.getState().currentTestName, durationMs: Math.round(performance.now() - scenarioStart) }); });
const app = express();
app.use(express.json());
app.use('/api/rooms', routes);
const token = (code) => `${code}.${crypto.randomBytes(32).toString('base64url')}`;
const join = (code, secret = token(code), name = 'Guest') => request(server)
  .post('/api/rooms/join').send({ roomCode: code, playerName: name, admissionToken: secret });
const create = async (maxPlayers) => {
  const r = await request(server).post('/api/rooms/create').send({
    hostName: 'Organizer', config: maxPlayers ? { maxPlayers } : {}
  });
  expect(r.status).toBe(200);
  return r.body;
};
const manual = (room, cardNumber) => request(server)
  .post(`/api/rooms/${room.room.code}/assign-manual-card`)
  .set('x-room-host-capability', room.hostCapability).send({ playerName: 'Paper Guest', cardNumber });

const snapshot = async (room) => {
  const stored = await Room.findById(room._id).lean();
  const players = await Player.find({ room: room._id }).lean();
  expect(players.map(p => String(p._id)).sort()).toEqual(stored.players.map(String).sort());
  expect(new Set(stored.players.map(String)).size).toBe(stored.players.length);
  const participants = players.filter(player => !player.isHost).length + stored.manualPlayers.length;
  expect(participants).toBeLessThanOrEqual(stored.config.maxPlayers);
  return { digital: players.filter(p => !p.isHost).length, organizers: players.filter(p => p.isHost).length,
    manual: stored.manualPlayers.length, cards: players.filter(p => p.cardNumber).length,
    reserved: stored.reservedCards.length, orphans: 0 };
};
const burst = async (created, count, secret) => {
  const start = performance.now();
  const results = await Promise.all(Array.from({ length: count }, async () => {
    const t = performance.now();
    const response = await join(created.room.code, secret);
    return { response, ms: performance.now() - t };
  }));
  const times = results.map(r => r.ms).sort((a, b) => a - b);
  metrics.push({ count, accepted: results.filter(r => r.response.status === 200).length,
    statuses: results.reduce((o, r) => ({ ...o, [r.response.status]: (o[r.response.status] || 0) + 1 }), {}),
    durationMs: Math.round(performance.now() - start),
    p50: Math.round(times[Math.ceil(times.length * .5) - 1]),
    p95: Math.round(times[Math.ceil(times.length * .95) - 1]),
    p99: Math.round(times[Math.ceil(times.length * .99) - 1]), persisted: await snapshot(created.room) });
  return results.map(r => r.response);
};

beforeAll(async () => {
  // No environment URI, dotenv, existing listener or persistent database is used.
  dataPath = fs.mkdtempSync(path.join(__dirname, '../.tmp-t5-'));
  mongo = await MongoMemoryReplSet.create({ binary: { downloadDir: path.join(__dirname, '../node_modules/.cache/t5-mongodb') },
    replSet: { count: 1, storageEngine: 'wiredTiger', spawn: { args: [] } },
    instanceOpts: [{ dbPath: dataPath, args: ['--setParameter', 'enableTestCommands=1'] }] });
  await mongoose.connect(mongo.getUri('t5_disposable'), { maxPoolSize: 30 });
  await Player.init();
  await Room.init();
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
});
afterAll(async () => {
  try {
  if (mongoose.connection.readyState) {
    const allRooms = await Room.find().lean();
    const states = [];
    for (const room of allRooms) states.push(await snapshot(room));
    metrics.push({ final: { rooms: await Room.countDocuments(), players: await Player.countDocuments(), states },
      machine: { platform: os.platform(), arch: os.arch(), cpus: os.cpus().length, node: process.version } });
  }
  } finally {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  console.log('T5_METRICS', JSON.stringify(metrics));
  if (server) await new Promise(resolve => server.close(resolve));
  if (mongo) await mongo.stop();
  if (dataPath) fs.rmSync(dataPath, { recursive: true, force: true });
  }
});

test('new-room default maxPlayers is participant capacity, excluding the organizer', async () => {
  const created = await create();
  expect(created.room.config.maxPlayers).toBe(50);
});

test('organizer does not consume digital participant capacity', async () => {
  const created = await create(2);
  expect((await join(created.room.code)).status).toBe(200);
  expect((await join(created.room.code)).status).toBe(200);
  const full = await join(created.room.code);
  expect(full.status).toBe(400);
  expect(full.body).toEqual({ error: 'Sala llena' });
});

test('organizer does not consume manual participant capacity', async () => {
  const created = await create(2);
  expect((await manual(created, 186)).status).toBe(200);
  expect((await manual(created, 187)).status).toBe(200);
  const full = await manual(created, 188);
  expect(full.status).toBe(400);
  expect(full.body).toEqual({ success: false, error: { code: 'ADMISSION_REJECTED', message: 'Sala llena' } });
});

test('maxPlayers reductions count participants but exclude the organizer', async () => {
  const created = await create(4);
  expect((await join(created.room.code)).status).toBe(200);
  expect((await join(created.room.code)).status).toBe(200);
  expect((await join(created.room.code)).status).toBe(200);
  const exactCapacity = await request(server).patch(`/api/rooms/${created.room.code}/config`)
    .set('x-room-host-capability', created.hostCapability).send({ config: { maxPlayers: 3 } });
  expect(exactCapacity.status).toBe(200);
  expect(exactCapacity.body.room.config.maxPlayers).toBe(3);
  const belowCapacity = await request(server).patch(`/api/rooms/${created.room.code}/config`)
    .set('x-room-host-capability', created.hostCapability).send({ config: { maxPlayers: 2 } });
  expect(belowCapacity.status).toBe(409);
  expect(belowCapacity.body).toEqual({ error: 'El cupo o el estado actual no permite este cambio' });
});

test('50 simultaneous guests plus organizer, TV not a member, valid independent cards', async () => {
  const created = await create();
  expect(created.room.config.maxPlayers).toBe(50);
  const responses = await burst(created, 50);
  expect(responses.every(r => r.status === 200)).toBe(true);
  expect(new Set(responses.map(r => r.body.player._id)).size).toBe(50);
  for (const [i, r] of responses.entries()) {
    const assigned = await request(server).post(`/api/rooms/${created.room.code}/select-card`)
      .set('x-player-capability', r.body.playerCapability).send({ playerId: r.body.player._id, cardNumber: i + 1 });
    expect(assigned.status).toBe(200);
    expect(assigned.body.bingoCard.matrix).toEqual(getCard(i + 1));
  }
  expect(await snapshot(created.room)).toEqual({ digital: 50, organizers: 1, manual: 0, cards: 50, reserved: 0, orphans: 0 });
});

test('100 distinct requests compete for exactly 50 slots without orphans', async () => {
  const created = await create(50);
  const responses = await burst(created, 100);
  expect(responses.filter(r => r.status === 200)).toHaveLength(50);
  const rejected = responses.filter(r => r.status !== 200);
  expect(rejected).toHaveLength(50);
  for (const r of rejected) { expect(r.status).toBe(400); expect(r.body).toEqual({ error: 'Sala llena' }); }
  expect(await snapshot(created.room)).toEqual({ digital: 50, organizers: 1, manual: 0, cards: 0, reserved: 0, orphans: 0 });
});

test('same secret converges under concurrency, reload and reconnect recover identity and card', async () => {
  const created = await create(2);
  const secret = token(created.room.code);
  const results = await burst(created, 12, secret);
  expect(results.every(r => r.status === 200)).toBe(true);
  expect(new Set(results.map(r => r.body.player._id)).size).toBe(1);
  expect(new Set(results.map(r => r.body.playerCapability)).size).toBe(1);
  const guest = results[0].body;
  const assigned = await request(server).post(`/api/rooms/${created.room.code}/select-card`)
    .set('x-player-capability', guest.playerCapability).send({ playerId: guest.player._id, cardNumber: 4 });
  expect(assigned.status).toBe(200);
  const reload = await join(created.room.code, secret);
  expect(reload.status).toBe(200);
  expect(reload.body.player._id).toBe(guest.player._id);
  expect(reload.body.player.bingoCard.matrix).toEqual(getCard(4));
  const reconnect = await request(server).post(`/api/rooms/${created.room.code}/reconnect`)
    .set('x-player-capability', guest.playerCapability).send({ playerId: guest.player._id });
  expect(reconnect.status).toBe(200);
  expect(reconnect.body.player.bingoCard.matrix).toEqual(getCard(4));
  expect(await snapshot(created.room)).toMatchObject({ digital: 1, cards: 1, orphans: 0 });
  expect(JSON.stringify(reload.body)).not.toContain('admissionTokenHash');
  expect(JSON.stringify(reload.body)).not.toContain(secret);
});

test('manual admissions race with digital guests for the same quota and duplicate cards are rejected', async () => {
  const created = await create(6);
  const results = await Promise.all([
    ...Array.from({ length: 10 }, () => join(created.room.code)),
    ...Array.from({ length: 10 }, (_, i) => manual(created, 186 + i))
  ]);
  expect(results.filter(r => r.status === 200)).toHaveLength(6);
  expect((await snapshot(created.room)).digital + (await snapshot(created.room)).manual).toBe(6);
  const paper = await create(3);
  const duplicates = await Promise.all(Array.from({ length: 8 }, () => manual(paper, 186)));
  expect(duplicates.filter(r => r.status === 200)).toHaveLength(1);
  expect(duplicates.filter(r => r.status === 409)).toHaveLength(7);
  expect(await snapshot(paper.room)).toMatchObject({ manual: 1, reserved: 1 });
});

test('a real insert failure rolls back membership and retry safely succeeds', async () => {
  const created = await create(2);
  const secret = token(created.room.code);
  await mongoose.connection.db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 },
    data: { failCommands: ['insert'], errorCode: 121 } });
  try {
    const failed = await join(created.room.code, secret);
    expect(failed.status).toBe(500);
    expect(await snapshot(created.room)).toMatchObject({ digital: 0, cards: 0, orphans: 0 });
  } finally {
    await mongoose.connection.db.admin().command({ configureFailPoint: 'failCommand', mode: 'off' });
  }
  const recovered = await join(created.room.code, secret);
  expect(recovered.status).toBe(200);
  expect(await snapshot(created.room)).toMatchObject({ digital: 1, orphans: 0 });
});

test('invalid or foreign secrets cannot recover another guest, cross rooms, or authorize host actions', async () => {
  const a = await create(3);
  const b = await create(3);
  const secret = token(a.room.code);
  const guest = (await join(a.room.code, secret)).body;
  for (const invalid of ['', 'invalid', token(b.room.code), 123, { token: secret }]) {
    const denied = await join(a.room.code, invalid);
    expect(denied.status).toBe(400);
  }
  const foreign = await join(b.room.code, secret);
  expect(foreign.status).toBe(400);
  const attacker = (await join(a.room.code)).body;
  const denied = await request(server).post(`/api/rooms/${a.room.code}/reconnect`)
    .set('x-player-capability', attacker.playerCapability).send({ playerId: guest.player._id });
  expect(denied.status).toBe(403);
  const hostDenied = await request(server).post(`/api/rooms/${a.room.code}/assign-manual-card`)
    .set('x-room-host-capability', secret).send({ playerName: 'Attacker', cardNumber: 186 });
  expect(hostDenied.status).toBe(403);
  expect(await snapshot(a.room)).toMatchObject({ digital: 2, manual: 0 });
  expect(await snapshot(b.room)).toMatchObject({ digital: 0 });
  const bGuest = await join(b.room.code);
  expect(bGuest.status).toBe(200);
  expect(bGuest.body.player._id).not.toBe(guest.player._id);
});

test('historical explicit capacity is preserved and absent admission keys fail before writing', async () => {
  const created = await create(3);
  const missing = await request(server).post('/api/rooms/join')
    .send({ roomCode: created.room.code, playerName: 'Legacy Client' });
  expect(missing.status).toBe(400);
  const results = await burst(created, 5);
  expect(results.filter(r => r.status === 200)).toHaveLength(3);
  expect(await snapshot(created.room)).toMatchObject({ digital: 3, organizers: 1 });
  expect((await Room.findById(created.room._id)).config.maxPlayers).toBe(3);
});

test('manual versus digital card race has only one winner and replay preserves marks', async () => {
  const created = await create(4);
  const guest = (await join(created.room.code)).body;
  const select = () => request(server).post(`/api/rooms/${created.room.code}/select-card`)
    .set('x-player-capability', guest.playerCapability).send({ playerId: guest.player._id, cardNumber: 186 });
  const results = await Promise.all([select(), manual(created, 186)]);
  expect(results.filter(r => r.status === 200)).toHaveLength(1);
  expect(results.filter(r => r.status !== 200)).toHaveLength(1);
  const state = await snapshot(created.room);
  expect(state.cards + state.reserved).toBe(1);
  const normal = await request(server).post(`/api/rooms/${created.room.code}/select-card`)
    .set('x-player-capability', guest.playerCapability).send({ playerId: guest.player._id, cardNumber: 7 });
  expect(normal.status).toBe(200);
  // Fixture simulates marks already persisted by the normal gameplay path.
  await Player.updateOne({ _id: guest.player._id }, { $set: { 'bingoCard.markedCells': [[2, 2], [0, 0]] } });
  const replay = await request(server).post(`/api/rooms/${created.room.code}/select-card`)
    .set('x-player-capability', guest.playerCapability).send({ playerId: guest.player._id, cardNumber: 7 });
  expect(replay.status).toBe(200);
  expect(replay.body.bingoCard.markedCells).toEqual([[2, 2], [0, 0]]);
  expect(await snapshot(created.room)).toMatchObject({ digital: 1, cards: 1, orphans: 0 });
});

test('capacity reduction races cannot make an occupied room exceed its limit', async () => {
  const created = await create(4);
  expect((await join(created.room.code)).status).toBe(200);
  expect((await join(created.room.code)).status).toBe(200);
  expect((await join(created.room.code)).status).toBe(200);
  const reduce = await request(server).patch(`/api/rooms/${created.room.code}/config`)
    .set('x-room-host-capability', created.hostCapability).send({ config: { maxPlayers: 2 } });
  expect(reduce.status).toBe(409);
  expect((await Room.findById(created.room._id)).config.maxPlayers).toBe(4);
  expect(await snapshot(created.room)).toMatchObject({ digital: 3 });
});

test('stale double manual removal cannot release a newly reassigned reservation', async () => {
  const created = await create(4);
  expect((await manual(created, 186)).status).toBe(200);
  const old = (await Room.findById(created.room._id)).manualPlayers[0];
  const original = Room.updateOne.bind(Room);
  let ready;
  const captured = [];
  const bothReady = new Promise(resolve => { ready = resolve; });
  const spy = jest.spyOn(Room, 'updateOne').mockImplementation((...args) =>
    new Promise((resolve, reject) => {
      captured.push(async () => { try { resolve(await original(...args)); } catch (e) { reject(e); } });
      if (captured.length === 2) ready();
    }));
  const remove = () => request(server).delete(`/api/rooms/${created.room.code}/manual-players/${old.playerId}`)
    .set('x-room-host-capability', created.hostCapability).then(r => r);
  const first = remove();
  const stale = remove();
  await bothReady;
  spy.mockRestore();
  await captured[0]();
  expect((await first).status).toBe(200);
  expect((await manual(created, 186)).status).toBe(200);
  await captured[1]();
  expect((await stale).status).toBe(404);
  expect(await snapshot(created.room)).toMatchObject({ manual: 1, reserved: 1 });
  const stored = await Room.findById(created.room._id);
  expect(stored.manualPlayers[0].playerId).not.toBe(old.playerId);
  expect(stored.reservedCards).toEqual([186]);
});

test('stale unrelated config patch cannot undo a capacity increase after admission', async () => {
  const created = await create(2);
  expect((await join(created.room.code)).status).toBe(200);
  const original = Room.findOne.bind(Room);
  let loaded;
  let resume;
  const didLoad = new Promise(resolve => { loaded = resolve; });
  const gate = new Promise(resolve => { resume = resolve; });
  const spy = jest.spyOn(Room, 'findOne').mockImplementationOnce((...args) => {
    const query = original(...args);
    const select = query.select.bind(query);
    query.select = (...selection) => select(...selection).exec().then(async doc => {
      loaded(); await gate; return doc;
    });
    return query;
  });
  const stale = request(server).patch(`/api/rooms/${created.room.code}/config`)
    .set('x-room-host-capability', created.hostCapability).send({ config: { eventName: 'Stale request' } }).then(r => r);
  await didLoad;
  spy.mockRestore();
  const grow = await request(server).patch(`/api/rooms/${created.room.code}/config`)
    .set('x-room-host-capability', created.hostCapability).send({ config: { maxPlayers: 3 } });
  expect(grow.status).toBe(200);
  expect((await join(created.room.code)).status).toBe(200);
  resume();
  expect((await stale).status).toBe(200);
  const stored = await Room.findById(created.room._id);
  expect(stored.config.maxPlayers).toBe(3);
  expect(stored.config.eventName).toBe('Stale request');
  expect(await snapshot(created.room)).toMatchObject({ digital: 2 });
});
