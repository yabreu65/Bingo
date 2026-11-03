const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../app');
const policy = { mode: 'public', frontendOrigin: 'https://event.example',
  allowedOrigins: ['https://event.example'], trustProxyHops: 1 };

test('liveness remains OK but readiness and health fail closed with Mongo disconnected', async () => {
  expect(mongoose.connection.readyState).toBe(0);
  const app = createApp({ networkPolicy: policy });
  const live = await request(app).get('/api/live');
  expect(live.status).toBe(200);
  expect(live.body.status).toBe('OK');
  for (const path of ['/api/ready', '/api/health']) {
    const response = await request(app).get(path);
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('NOT_READY');
    expect(response.body).not.toHaveProperty('error');
    expect(response.headers['cache-control']).toBe('no-store');
  }
});
