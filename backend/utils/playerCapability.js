const crypto = require('crypto');

const PLAYER_CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

const createPlayerCapability = () => crypto.randomBytes(32).toString('base64url');

const isPlayerCapability = (capability) =>
  typeof capability === 'string' && PLAYER_CAPABILITY_PATTERN.test(capability);

const createPlayerCapabilityHash = (capability, roomId, playerId) => {
  if (!isPlayerCapability(capability) || !roomId || !playerId) {
    throw new TypeError('Invalid player capability binding');
  }
  return crypto.createHash('sha256')
    .update(`${roomId.toString()}:${playerId.toString()}:${capability}`)
    .digest('hex');
};

const matchesPlayerCapability = (capability, capabilityHash, roomId, playerId) => {
  if (!isPlayerCapability(capability) || typeof capabilityHash !== 'string' ||
      !HASH_PATTERN.test(capabilityHash) || !roomId || !playerId) {
    return false;
  }

  const supplied = Buffer.from(createPlayerCapabilityHash(capability, roomId, playerId), 'hex');
  const expected = Buffer.from(capabilityHash, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};

module.exports = {
  createPlayerCapability,
  createPlayerCapabilityHash,
  isPlayerCapability,
  matchesPlayerCapability
};
