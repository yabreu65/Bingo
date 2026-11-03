const { createSocketEventRateLimiter } = require('../middleware/socketRateLimiter');

describe('socket event rate limiter', () => {
  test('bounds event bursts per socket without affecting normal traffic', () => {
    const limiter = createSocketEventRateLimiter({ windowMs: 1000, maxEvents: 2 });
    const next = jest.fn();
    limiter(['ping'], next);
    limiter(['ping'], next);
    limiter(['ping'], next);
    expect(next).toHaveBeenNthCalledWith(1);
    expect(next).toHaveBeenNthCalledWith(2);
    expect(next.mock.calls[2][0]).toBeInstanceOf(Error);
  });
});
