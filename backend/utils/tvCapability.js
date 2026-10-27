const crypto = require('crypto');

const TV_CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

const createTvCapability = () => crypto.randomBytes(32).toString('base64url');

const isTvCapability = (capability) =>
  typeof capability === 'string' && TV_CAPABILITY_PATTERN.test(capability);

const createTvCapabilityHash = (capability, roomId) => {
  if (!isTvCapability(capability) || !roomId) {
    throw new TypeError('Invalid TV capability binding');
  }
  return crypto.createHash('sha256')
    .update(`${roomId.toString()}:${capability}`)
    .digest('hex');
};

const matchesTvCapability = (capability, capabilityHash, roomId) => {
  if (!isTvCapability(capability) || typeof capabilityHash !== 'string' ||
      !HASH_PATTERN.test(capabilityHash) || !roomId) {
    return false;
  }

  const supplied = Buffer.from(createTvCapabilityHash(capability, roomId), 'hex');
  const expected = Buffer.from(capabilityHash, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};

module.exports = {
  createTvCapability,
  createTvCapabilityHash,
  isTvCapability,
  matchesTvCapability
};
