const {
  resolveNetworkPolicy,
  createCorsOptions,
  isAllowedOrigin
} = require('../config/networkPolicy');

const base = {
  FRONTEND_URL: 'http://localhost:5173',
  ALLOWED_ORIGINS: '',
  LAN_ORIGINS: '',
  TRUST_PROXY_HOPS: '0'
};

describe('network access policy', () => {
  test('local mode allows only explicit local development origins', () => {
    const policy = resolveNetworkPolicy({ ...base, BINGO_ACCESS_MODE: 'local' });
    expect(isAllowedOrigin(policy, 'http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin(policy, 'http://192.168.1.40:5173')).toBe(false);
    expect(isAllowedOrigin(policy, 'https://attacker.example')).toBe(false);
  });

  test('LAN mode requires explicit private origins instead of a wildcard', () => {
    const policy = resolveNetworkPolicy({
      ...base,
      BINGO_ACCESS_MODE: 'lan',
      FRONTEND_URL: 'http://192.168.1.39:5173',
      LAN_ORIGINS: 'http://192.168.1.39:5173,http://192.168.1.40:5173'
    });
    expect(isAllowedOrigin(policy, 'http://192.168.1.40:5173')).toBe(true);
    expect(isAllowedOrigin(policy, 'http://192.168.1.41:5173')).toBe(false);
  });

  test('public mode requires HTTPS and respects the configured origin', () => {
    const policy = resolveNetworkPolicy({
      ...base,
      BINGO_ACCESS_MODE: 'public',
      FRONTEND_URL: 'https://bingo.example',
      ALLOWED_ORIGINS: 'https://bingo.example',
      TRUST_PROXY_HOPS: '1'
    });
    expect(policy.trustProxyHops).toBe(1);
    expect(isAllowedOrigin(policy, 'https://bingo.example')).toBe(true);
    expect(isAllowedOrigin(policy, 'https://evil.example')).toBe(false);
    expect(() => resolveNetworkPolicy({ ...base, BINGO_ACCESS_MODE: 'public' })).toThrow(/HTTPS/);
  });

  test('CORS rejects unauthorized browser origins but permits originless health clients', () => {
    const policy = resolveNetworkPolicy({ ...base, BINGO_ACCESS_MODE: 'local' });
    const cors = createCorsOptions(policy);
    const allowed = jest.fn();
    const rejected = jest.fn();
    cors.origin('http://localhost:5173', allowed);
    cors.origin('https://evil.example', rejected);
    cors.origin(undefined, allowed);
    expect(allowed).toHaveBeenCalledWith(null, true);
    expect(rejected.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
