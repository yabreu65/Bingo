const NETWORK_MODES = Object.freeze(['local', 'lan', 'public']);

const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5500'
];

const splitOrigins = (value) => String(value || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => {
    if (origin === '*') throw new Error('Wildcard origins are not allowed');
    try {
      return new URL(origin).origin;
    } catch {
      throw new Error(`Invalid origin: ${origin}`);
    }
  });

const normalizeOrigin = (value) => splitOrigins(value)[0];

const resolveNetworkPolicy = (source = process.env) => {
  const mode = source.BINGO_ACCESS_MODE || 'local';
  if (!NETWORK_MODES.includes(mode)) {
    throw new Error(`Unsupported BINGO_ACCESS_MODE: ${mode}`);
  }

  const frontendOrigin = normalizeOrigin(source.FRONTEND_URL);
  if (!frontendOrigin) throw new Error('FRONTEND_URL must be a valid origin');

  const configuredOrigins = splitOrigins(source.ALLOWED_ORIGINS);
  const lanOrigins = splitOrigins(source.LAN_ORIGINS);
  const allowedOrigins = new Set([frontendOrigin, ...configuredOrigins]);

  if (mode === 'local') {
    DEFAULT_LOCAL_ORIGINS.forEach((origin) => allowedOrigins.add(origin));
  }

  if (mode === 'lan') {
    DEFAULT_LOCAL_ORIGINS.forEach((origin) => allowedOrigins.add(origin));
    lanOrigins.forEach((origin) => allowedOrigins.add(origin));
  }

  if (mode === 'public' && new URL(frontendOrigin).protocol !== 'https:') {
    throw new Error('BINGO_ACCESS_MODE=public requires an HTTPS FRONTEND_URL');
  }

  if (mode === 'public' && [...allowedOrigins].some(origin => new URL(origin).protocol !== 'https:')) {
    throw new Error('BINGO_ACCESS_MODE=public requires HTTPS for every allowed origin');
  }

  const rawHops = String(source.TRUST_PROXY_HOPS ?? '0');
  const trustProxyHops = Number(rawHops);
  if (!/^\d+$/.test(rawHops) || !Number.isSafeInteger(trustProxyHops)) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer');
  }

  return {
    mode,
    frontendOrigin,
    allowedOrigins: [...allowedOrigins],
    trustProxyHops
  };
};

const isAllowedOrigin = (policy, origin) => !origin || policy.allowedOrigins.includes(origin);

const createCorsOptions = (policy) => ({
  origin: (origin, callback) => {
    if (isAllowedOrigin(policy, origin)) return callback(null, true);
    return callback(new Error('Not allowed by origin policy'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
});

module.exports = {
  NETWORK_MODES,
  DEFAULT_LOCAL_ORIGINS,
  splitOrigins,
  resolveNetworkPolicy,
  isAllowedOrigin,
  createCorsOptions
};
