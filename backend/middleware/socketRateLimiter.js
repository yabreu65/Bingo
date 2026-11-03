const WINDOW_MS = 10_000;
const MAX_EVENTS_PER_WINDOW = 240;

const createSocketEventRateLimiter = ({ windowMs = WINDOW_MS, maxEvents = MAX_EVENTS_PER_WINDOW } = {}) => {
  let windowStartedAt = Date.now();
  let eventCount = 0;

  return (_packet, next) => {
    const now = Date.now();
    if (now - windowStartedAt >= windowMs) {
      windowStartedAt = now;
      eventCount = 0;
    }

    eventCount += 1;
    if (eventCount > maxEvents) {
      return next(new Error('Socket event rate limit exceeded'));
    }
    return next();
  };
};

module.exports = { createSocketEventRateLimiter, WINDOW_MS, MAX_EVENTS_PER_WINDOW };
