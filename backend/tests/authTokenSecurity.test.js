jest.mock('../models/User', () => ({
  findById: jest.fn(),
  findOne: jest.fn()
}));

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');
const User = require('../models/User');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

process.env.JWT_SECRET = 'phase4-auth-test-secret';

const app = express();
app.use(express.json());
app.get('/protected', requireAuth, (req, res) => res.json({ ok: true }));
app.post('/refresh', authController.refreshToken);

afterEach(() => jest.clearAllMocks());

describe('JWT session revocation and refresh rotation', () => {
  test('rejects a signed access token after the user auth version changes', async () => {
    const token = jwt.sign({ userId: 'user-a', authVersion: 0 }, process.env.JWT_SECRET);
    User.findById.mockResolvedValue({ _id: 'user-a', isActive: true, authVersion: 1 });

    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  test('rotates the refresh token and rejects its replay', async () => {
    const oldRefreshToken = jwt.sign(
      { userId: 'user-a', authVersion: 0, type: 'refresh' },
      process.env.JWT_SECRET
    );
    const user = {
      _id: 'user-a',
      isActive: true,
      authVersion: 0,
      refreshTokenHash: crypto.createHash('sha256').update(oldRefreshToken).digest('hex'),
      save: jest.fn().mockResolvedValue(undefined)
    };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const first = await request(app).post('/refresh').send({ refreshToken: oldRefreshToken });
    expect(first.status).toBe(200);
    expect(first.body.data.refreshToken).toBeTruthy();
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(user.refreshTokenHash).not.toBe(
      crypto.createHash('sha256').update(oldRefreshToken).digest('hex')
    );

    const replay = await request(app).post('/refresh').send({ refreshToken: oldRefreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('INVALID_TOKEN');
  });
});
