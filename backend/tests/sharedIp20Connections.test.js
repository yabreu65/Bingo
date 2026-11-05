const express = require('express');
const request = require('supertest');
const http = require('http');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');

const { NODE_ENV: previousEnv } = process.env;
let limiters;

beforeAll(() => {
  process.env.NODE_ENV = 'production';
  jest.resetModules();
  limiters = require('../config/rateLimiters');
});

afterAll(() => {
  if (previousEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnv;
  jest.resetModules();
});

function makeRateTestApp(limiter, path) {
  const app = express();
  // Only this isolated test process acts as a trusted one-hop proxy.
  app.set('trust proxy', 1);
  app.post(path, limiter, (_req, res) => res.status(200).json({ success: true }));
  return app;
}

test('20 room creations from the same IP pass; request 21 is limited with Retry-After semantics', async () => {
  const app = makeRateTestApp(limiters.createRoomLimiter, '/api/rooms/create');
  const ip = '203.0.113.42';
  for (let i = 0; i < 20; i++) {
    const response = await request(app).post('/api/rooms/create').set('X-Forwarded-For', ip);
    expect(response.status).toBe(200);
  }
  const denied = await request(app).post('/api/rooms/create').set('X-Forwarded-For', ip);
  expect(denied.status).toBe(429);
  expect(denied.body.success).toBe(false);
  expect(denied.body).toMatchObject({ error: { code: 'RATE_LIMIT_EXCEEDED' } });
  expect(denied.headers['ratelimit-limit']).toBe('20');
  expect((await request(app).post('/api/rooms/create').set('X-Forwarded-For', '198.51.100.45')).status).toBe(200);
});

test('20 guest admission requests from one IP are within the existing 100-per-hour policy', async () => {
  const app = makeRateTestApp(limiters.joinRoomLimiter, '/api/rooms/join');
  const ip = '198.51.100.200';
  const outcomes = await Promise.all(Array.from({ length: 20 }, () =>
    request(app).post('/api/rooms/join').set('X-Forwarded-For', ip)
  ));
  expect(outcomes.every(response => response.status === 200)).toBe(true);
  const next = await request(app).post('/api/rooms/join').set('X-Forwarded-For', ip);
  expect(next.status).toBe(200);
  expect(next.headers['ratelimit-limit']).toBe('100');
});

test('account registration keeps its separate maximum of five requests per IP', async () => {
  const app = makeRateTestApp(limiters.registerLimiter, '/api/auth/register');
  const ip = '192.0.2.99';
  for (let i = 0; i < 5; i++) {
    expect((await request(app).post('/api/auth/register').set('X-Forwarded-For', ip)).status).toBe(200);
  }
  const denied = await request(app).post('/api/auth/register').set('X-Forwarded-For', ip);
  expect(denied.status).toBe(429);
  expect(denied.headers['ratelimit-limit']).toBe('5');
});

test('20 concurrent Socket.IO transport connections work from one IP in an isolated harness', async () => {
  const server = http.createServer();
  const io = new Server(server, { transports: ['websocket'] });
  const clients = [];
  const remoteIPs = new Set();
  io.on('connection', socket => remoteIPs.add(socket.handshake.address));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    await Promise.all(Array.from({ length: 20 }, () => new Promise((resolve, reject) => {
      const client = connectClient(url, { transports: ['websocket'], reconnection: false, forceNew: true, timeout: 5000 });
      clients.push(client);
      client.once('connect', resolve);
      client.once('connect_error', reject);
    })));
    expect(clients).toHaveLength(20);
    expect(clients.every(client => client.connected)).toBe(true);
    expect(io.of('/').sockets.size).toBe(20);
    expect(remoteIPs.size).toBe(1);
  } finally {
    for (const client of clients) client.disconnect();
    await new Promise(resolve => io.close(resolve));
  }
});
