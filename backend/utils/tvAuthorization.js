const crypto = require('crypto');

const TV_AUTH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DEFAULT_LINK_TTL_SECONDS = 10 * 60;
const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60;
const temporaryTvSockets = new Map();
const temporaryTvSocketLocks = new Map();

const getPositiveTtlMs = (name, fallbackSeconds, minimumSeconds, maximumSeconds) => {
  const configured = Number.parseInt(process.env[name], 10);
  const seconds = Number.isInteger(configured) ? configured : fallbackSeconds;
  const bounded = Math.min(Math.max(seconds, minimumSeconds), maximumSeconds);
  return bounded * 1000;
};

const getTvAuthorizationLinkTtlMs = () => getPositiveTtlMs(
  'TV_AUTH_LINK_TTL_SECONDS',
  DEFAULT_LINK_TTL_SECONDS,
  60,
  15 * 60
);

const getTvAuthorizationSessionTtlMs = () => getPositiveTtlMs(
  'TV_AUTH_SESSION_TTL_SECONDS',
  DEFAULT_SESSION_TTL_SECONDS,
  5 * 60,
  7 * 24 * 60 * 60
);

const createTvAuthorizationToken = () => crypto.randomBytes(32).toString('base64url');

const isTvAuthorizationToken = (token) =>
  typeof token === 'string' && TV_AUTH_TOKEN_PATTERN.test(token);

const hashTvAuthorizationToken = (token, roomId) => {
  if (!isTvAuthorizationToken(token) || !roomId) {
    throw new TypeError('Invalid TV authorization token binding');
  }
  return crypto.createHash('sha256')
    .update(`${roomId.toString()}:${token}`)
    .digest('hex');
};

const clearTvAuthorization = (authorization, now = new Date()) => {
  authorization.linkTokenHash = undefined;
  authorization.linkExpiresAt = undefined;
  authorization.linkClaimedAt = undefined;
  authorization.sessionTokenHash = undefined;
  authorization.sessionExpiresAt = undefined;
  authorization.sessionLastSeenAt = undefined;
  authorization.revokedAt = now;
};

const sanitizeTvAuthorizationStatus = (authorization) => ({
  linkExpiresAt: authorization?.linkExpiresAt || null,
  linkClaimedAt: authorization?.linkClaimedAt || null,
  sessionExpiresAt: authorization?.sessionExpiresAt || null,
  sessionLastSeenAt: authorization?.sessionLastSeenAt || null,
  revokedAt: authorization?.revokedAt || null,
  connected: Boolean(authorization?.sessionExpiresAt &&
    new Date(authorization.sessionExpiresAt).getTime() > Date.now() &&
    !authorization?.revokedAt)
});

const withTemporaryTvSocketLock = async (roomCode, operation) => {
  const previous = temporaryTvSocketLocks.get(roomCode) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  temporaryTvSocketLocks.set(roomCode, chain);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (temporaryTvSocketLocks.get(roomCode) === chain) {
      temporaryTvSocketLocks.delete(roomCode);
    }
  }
};

const claimTemporaryTvSocket = (roomCode, socket) => withTemporaryTvSocketLock(roomCode, () => {
  const currentSocket = temporaryTvSockets.get(roomCode);
  if (currentSocket && currentSocket !== socket && currentSocket.connected !== false) return false;
  temporaryTvSockets.set(roomCode, socket);
  return true;
});

const releaseTemporaryTvSocket = (roomCode, socket) => {
  if (temporaryTvSockets.get(roomCode) === socket) temporaryTvSockets.delete(roomCode);
};

const revokeTemporaryTvSockets = (io, roomCode) => {
  if (!io?.sockets?.sockets) return;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.roomCode?.toUpperCase() !== roomCode.toUpperCase() ||
        socket.playerId !== 'tv-display' || socket.tvAuthorizationType !== 'temporary') continue;
    socket.tvAuthorized = false;
    socket.emit('tv-authorization-revoked', { roomCode });
    socket.disconnect(true);
  }
  temporaryTvSockets.delete(roomCode);
};

module.exports = {
  TV_AUTH_TOKEN_PATTERN,
  createTvAuthorizationToken,
  isTvAuthorizationToken,
  hashTvAuthorizationToken,
  getTvAuthorizationLinkTtlMs,
  getTvAuthorizationSessionTtlMs,
  clearTvAuthorization,
  sanitizeTvAuthorizationStatus,
  claimTemporaryTvSocket,
  releaseTemporaryTvSocket,
  revokeTemporaryTvSockets
};
