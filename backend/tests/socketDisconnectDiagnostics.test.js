const { EventEmitter } = require('events');
const { attachSocketDisconnectDiagnostics } = require('../socket/disconnectDiagnostics');

test('logs only allowlisted disconnect metadata with UTC time and monotonic duration', () => {
  const socket = new EventEmitter();
  socket.id = 'socket-synthetic-7';
  socket.handshake = { headers: { authorization: 'Bearer AUTH_SECRET' }, auth: { token: 'TOKEN_SECRET' } };
  socket.data = { playerCapability: 'CAPABILITY_SECRET', password: 'PASSWORD_SECRET' };
  socket.user = { email: 'person@example.invalid', userId: 'USER_SECRET' };
  const logger = { info: jest.fn() };
  let monotonicNowNs = 10_000_000_000n;

  const correlationId = attachSocketDisconnectDiagnostics(socket, logger, {
    correlationId: 'correlation-synthetic-7',
    connectedAtMonotonicNs: monotonicNowNs,
    nowMonotonicNs: () => monotonicNowNs,
    nowUtc: () => new Date('2026-11-02T12:30:00.000Z')
  });
  monotonicNowNs += 250_000_000n;
  socket.emit('disconnect', 'transport close');

  expect(correlationId).toBe('correlation-synthetic-7');
  expect(logger.info).toHaveBeenCalledTimes(1);
  const logged = logger.info.mock.calls[0];
  expect(logged).toEqual(['Socket disconnected', {
    timestampUtc: '2026-11-02T12:30:00.000Z',
    correlationId: 'correlation-synthetic-7',
    socketId: 'socket-synthetic-7',
    reason: 'transport close',
    connectionDurationMs: 250
  }]);
  const serialized = JSON.stringify(logged);
  for (const secret of ['AUTH_SECRET', 'TOKEN_SECRET', 'CAPABILITY_SECRET', 'PASSWORD_SECRET', 'USER_SECRET', 'person@example.invalid']) {
    expect(serialized).not.toContain(secret);
  }
});

test('replaces unrecognized disconnect text instead of logging it', () => {
  const socket = new EventEmitter();
  socket.id = 'socket-synthetic-8';
  const logger = { info: jest.fn() };
  attachSocketDisconnectDiagnostics(socket, logger, {
    correlationId: 'correlation-synthetic-8',
    connectedAtMonotonicNs: 0n,
    nowMonotonicNs: () => 1_000_000n,
    nowUtc: () => new Date('2026-11-02T12:30:01.000Z')
  });
  socket.emit('disconnect', 'password=DO_NOT_LOG');

  expect(logger.info.mock.calls[0][1].reason).toBe('other');
  expect(JSON.stringify(logger.info.mock.calls)).not.toContain('DO_NOT_LOG');
});
