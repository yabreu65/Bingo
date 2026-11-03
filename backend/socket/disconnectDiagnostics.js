const { randomUUID } = require('crypto');

const SAFE_DISCONNECT_REASONS = new Set([
  'io server disconnect',
  'io client disconnect',
  'server namespace disconnect',
  'client namespace disconnect',
  'ping timeout',
  'transport close',
  'transport error'
]);

function safeDisconnectReason(reason) {
  return typeof reason === 'string' && SAFE_DISCONNECT_REASONS.has(reason) ? reason : 'other';
}

function safeIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : 'unknown';
}

function attachSocketDisconnectDiagnostics(socket, logger, options = {}) {
  const correlationId = safeIdentifier(options.correlationId || randomUUID());
  const connectedAtMonotonicNs = options.connectedAtMonotonicNs ?? process.hrtime.bigint();
  const nowMonotonicNs = options.nowMonotonicNs || (() => process.hrtime.bigint());
  const nowUtc = options.nowUtc || (() => new Date());

  socket.on('disconnect', reason => {
    const elapsedNs = nowMonotonicNs() - connectedAtMonotonicNs;
    const record = {
      timestampUtc: nowUtc().toISOString(),
      correlationId,
      socketId: safeIdentifier(socket.id),
      reason: safeDisconnectReason(reason),
      connectionDurationMs: Math.max(0, Math.round(Number(elapsedNs) / 1e6 * 1_000) / 1_000)
    };
    logger.info('Socket disconnected', record);
  });

  return correlationId;
}

module.exports = { attachSocketDisconnectDiagnostics };
