const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');
const http = require('http');
const { spawn } = require('child_process');
const { Server } = require('socket.io');
const { io: connectSocket } = require('socket.io-client');
const { registerRoomHandlers } = require('../socket/handlers/roomHandlers');
const { socketAuthMiddleware } = require('../middleware/socketAuthMiddleware');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { createApp } = require('../app');
const Room = require('../models/Room');
const Player = require('../models/Player');
jest.setTimeout(60000);

let mongo;
let owned;
let uri;
const auth = { user: 't6_disposable_root', pass: 'SYNTHETIC_T6_ONLY_PASSWORD', authSource: 'admin', serverSelectionTimeoutMS: 2000 };
const app = createApp({ networkPolicy: { mode: 'public', frontendOrigin: 'https://event.example',
  allowedOrigins: ['https://event.example'], trustProxyHops: 1 } });
beforeAll(async () => {
  owned = fs.mkdtempSync(path.join(__dirname, '../.tmp-t6-mongo-'));
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = owned;
  try {
    mongo = await MongoMemoryReplSet.create({ binary: { downloadDir: path.join(__dirname, '../node_modules/.cache/t5-mongodb') },
      instanceOpts: [{ dbPath: owned }], replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger',
        auth: { enable: true, customRootName: auth.user, customRootPwd: auth.pass } } });
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
  uri = mongo.getUri('t6_disposable');
  await mongoose.connect(uri, auth);
  await Promise.all([Room.init(), Player.init()]);
});
afterAll(async () => {
  try { await mongoose.disconnect(); } finally {
    if (mongo) await mongo.stop();
    if (owned) fs.rmSync(owned, { recursive: true, force: true });
  }
});

test('authenticated transactional Mongo with required indexes is ready; missing index is not', async () => {
  const ready = await request(app).get('/api/ready');
  expect(ready.status).toBe(200);
  expect(ready.body.status).toBe('OK');
  const created = await request(app).post('/api/rooms/create').send({ hostName: 'Readiness Host' });
  expect(created.status).toBe(200);
  expect(await Room.countDocuments()).toBe(1);
  // Drop only a named index in this disposable DB, never any external database.
  await Player.collection.dropIndex('room_1_admissionTokenHash_1');
  expect((await request(app).get('/api/ready')).status).toBe(503);
  await Player.collection.createIndex({ room: 1, admissionTokenHash: 1 }, {
    unique: true, partialFilterExpression: { admissionTokenHash: { $type: 'number' } }
  });
  try {
    // Same keys and uniqueness, but the wrong predicate excludes all legitimate hashes.
    expect((await request(app).get('/api/ready')).status).toBe(503);
  } finally {
    await Player.collection.dropIndex('room_1_admissionTokenHash_1');
    await Player.createIndexes();
  }
  expect((await request(app).get('/api/health')).status).toBe(200);
});

test('bad authentication is rejected without leaking credentials through health responses', async () => {
  const wrong = mongoose.createConnection();
  wrong.on('error', () => {});
  try {
    await expect(wrong.openUri(uri, { ...auth, pass: 'WRONG_SYNTHETIC_PASSWORD' })).rejects.toThrow(/authentication/i);
  } finally { await wrong.close(); }
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.text).not.toContain(auth.pass);
});

test('disconnect is not ready; reconnect retains persisted room and indexes without duplicating state', async () => {
  const before = await Room.countDocuments();
  await mongoose.disconnect();
  expect((await request(app).get('/api/live')).status).toBe(200);
  expect((await request(app).get('/api/ready')).status).toBe(503);
  await mongoose.connect(uri, auth);
  expect((await request(app).get('/api/ready')).status).toBe(200);
  expect(await Room.countDocuments()).toBe(before);
  expect(await Player.countDocuments()).toBe(1);
});

test('main and one temporary TV coexist without memberships; replay and revoke stay room-bound', async () => {
  const created = await request(app).post('/api/rooms/create').send({ hostName: 'TV Host' });
  expect(created.status).toBe(200);
  const { room, hostCapability, tvCapability } = created.body;
  const server = http.createServer(app);
  const io = new Server(server, { transports: ['websocket'] });
  app.set('io', io);
  io.use(socketAuthMiddleware);
  io.on('connection', socket => registerRoomHandlers(io, socket));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const clients = [];
  const join = async credentials => {
    const client = connectSocket(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], reconnection: false, forceNew: true });
    clients.push(client);
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    const ack = await new Promise((resolve, reject) => client.timeout(2000).emit('join-room',
      { roomCode: room.code, playerId: 'tv-display', ...credentials }, (error, response) => error ? reject(error) : resolve(response)));
    return { client, ack };
  };
  try {
    const primary = await join({ tvCapability });
    expect(primary.ack.success).toBe(true);
    const link = await request(app).post(`/api/rooms/${room.code}/tv-authorization`)
      .set('x-room-host-capability', hostCapability);
    expect(link.status).toBe(200);
    const claim = await request(app).post(`/api/rooms/${room.code}/tv-authorization/claim`).send({ token: link.body.tvToken });
    expect(claim.status).toBe(200);
    const replay = await request(app).post(`/api/rooms/${room.code}/tv-authorization/claim`).send({ token: link.body.tvToken });
    expect(replay.status).not.toBe(200);
    const temp = await join({ tvSessionToken: claim.body.tvSessionToken });
    expect(temp.ack.success).toBe(true);
    const duplicate = await join({ tvSessionToken: claim.body.tvSessionToken });
    expect(duplicate.ack.success).toBe(false);
    expect(await Player.countDocuments({ room: room._id })).toBe(1);
    expect((await Room.findById(room._id)).players).toHaveLength(1);
    const disconnected = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Temporary TV not revoked')), 2000);
      temp.client.once('disconnect', () => { clearTimeout(timeout); resolve(); });
    });
    const revoke = await request(app).post(`/api/rooms/${room.code}/tv-authorization/revoke`)
      .set('x-room-host-capability', hostCapability).send({});
    expect(revoke.status).toBe(200);
    await disconnected;
    expect(primary.client.connected).toBe(true);
    const stale = await join({ tvSessionToken: claim.body.tvSessionToken });
    expect(stale.ack.success).toBe(false);
  } finally {
    for (const client of clients) client.disconnect();
    await new Promise(resolve => io.close(resolve));
    app.set('io', undefined);
  }
});

test('actual startup waits for database initialization and exposes readiness on loopback only', async () => {
  const script = `
    const http = require('http');
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function(_port, callback) { return listen.call(this, 0, '127.0.0.1', callback); };
    const logger = require.resolve(${JSON.stringify(path.resolve(__dirname, '../config/logger.js'))});
    require.cache[logger] = { id: logger, filename: logger, loaded: true,
      exports: new Proxy({}, { get: () => () => {} }) };
    const runtime = require(${JSON.stringify(path.resolve(__dirname, '../server.js'))});
    runtime.startup.then(() => {
      const report = () => console.log('T6_PORT=' + runtime.server.address().port);
      if (runtime.server.listening) report(); else runtime.server.once('listening', report);
    });
  `;
  const authUri = uri.replace('mongodb://', `mongodb://${encodeURIComponent(auth.user)}:${encodeURIComponent(auth.pass)}@`) + '&authSource=admin';
  const child = spawn(process.execPath, ['-e', script], { cwd: owned,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '54321', MONGODB_URI: authUri,
      JWT_SECRET: 'SYNTHETIC_T6_JWT_SECRET_NOT_FOR_REAL_USE', FRONTEND_URL: 'https://event.example',
      BINGO_ACCESS_MODE: 'public', ALLOWED_ORIGINS: 'https://event.example', TRUST_PROXY_HOPS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data.toString(); });
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Isolated startup timed out')), 8000);
      child.stdout.on('data', data => {
        const match = data.toString().match(/T6_PORT=(\d+)/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error(`Isolated startup exited before readiness: ${stderr.slice(0, 1500)}`)); });
    });
    const health = await fetch(`http://127.0.0.1:${port}/api/ready`);
    expect(health.status).toBe(200);
    expect((await health.json()).status).toBe('OK');
  } finally {
    child.kill('SIGTERM');
    await exited;
  }
});
