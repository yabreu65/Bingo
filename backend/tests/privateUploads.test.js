const fs = require('fs').promises;
const path = require('path');
const request = require('supertest');
const { createApp } = require('../app');
const { resolveNetworkPolicy } = require('../config/networkPolicy');

const uploadsDirectory = path.join(__dirname, '../uploads/recordings');
const filename = `private-route-canary-${process.pid}-${Date.now()}.webm`;
const canary = 'PRIVATE_RECORDING_ROUTE_CANARY';
let createdDirectory = false;

beforeAll(async () => {
  try {
    await fs.access(uploadsDirectory);
  } catch {
    await fs.mkdir(uploadsDirectory, { recursive: true });
    createdDirectory = true;
  }
  await fs.writeFile(path.join(uploadsDirectory, filename), canary, { flag: 'wx' });
});

afterAll(async () => {
  await fs.unlink(path.join(uploadsDirectory, filename)).catch(() => {});
  if (createdDirectory) await fs.rmdir(uploadsDirectory).catch(() => {});
});

test.each([
  '/uploads/recordings/:filename',
  '/uploads%2Frecordings%2F:filename',
  '/uploads/recordings/%2e%2e/recordings/:filename',
  '/%75ploads/recordings/:filename',
  '/uploads%252Frecordings%252F:filename'
])('does not serve a private recording through %s', async (route) => {
  const app = createApp({
    networkPolicy: resolveNetworkPolicy({
      BINGO_ACCESS_MODE: 'local',
      FRONTEND_URL: 'http://localhost:5173',
      TRUST_PROXY_HOPS: '0'
    })
  });
  const pathname = route.replace(':filename', filename);

  const response = await request(app).get(pathname);

  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(response.status).toBeLessThan(500);
  expect(response.text).not.toContain(canary);
});
