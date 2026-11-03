const { sanitizeBody, sanitizeRequestUrl } = require('../middleware/requestLogger');
const { redactSensitiveText, sanitizeLogInfo, sanitizeLogValue } = require('../utils/redactSecrets');

describe('request log redaction', () => {
  test('redacts TV tokens and capabilities from URLs and bodies', () => {
    const url = sanitizeRequestUrl('/?tv=ROOM01&tvToken=secret-link&foo=bar');
    const body = sanitizeBody({ token: 'secret-session', hostCapability: 'host-secret', safe: 'value' });

    expect(url).toContain('tvToken=***REDACTED***');
    expect(url).not.toContain('secret-link');
    expect(body).toEqual({
      token: '***REDACTED***',
      hostCapability: '***REDACTED***',
      safe: 'value'
    });
  });

  test('recursively redacts secret aliases in nested objects and arrays', () => {
    const secrets = ['password-canary', 'refresh-canary', 'capability-canary', 'jwt-canary'];
    const body = sanitizeBody({
      password: secrets[0],
      profile: {
        refresh_token: secrets[1],
        sessions: [{ playerCapabilityHash: secrets[2] }, { JWT: secrets[3] }]
      },
      safe: 'visible'
    });

    expect(JSON.stringify(body)).not.toContain(secrets[0]);
    expect(JSON.stringify(body)).not.toContain(secrets[1]);
    expect(JSON.stringify(body)).not.toContain(secrets[2]);
    expect(JSON.stringify(body)).not.toContain(secrets[3]);
    expect(body.profile.sessions[0].playerCapabilityHash).toBe('***REDACTED***');
    expect(body.safe).toBe('visible');
  });

  test('redacts encoded and case-insensitive sensitive URL query keys', () => {
    const url = sanitizeRequestUrl(
      '/api/rooms/ROOMA1?%74oken=tv-link-canary&ACCESS_TOKEN=access-canary&safe=value'
    );

    expect(url).not.toContain('tv-link-canary');
    expect(url).not.toContain('access-canary');
    expect(url).toContain('safe=value');
  });

  test('redacts root-level Winston secret metadata as well as nested values', () => {
    const info = sanitizeLogInfo({ level: 'info', message: 'safe', password: 'ROOT_PASSWORD_CANARY', token: 'ROOT_TOKEN_CANARY', safe: 'visible' });
    expect(JSON.stringify(info)).not.toContain('ROOT_PASSWORD_CANARY');
    expect(JSON.stringify(info)).not.toContain('ROOT_TOKEN_CANARY');
    expect(info.safe).toBe('visible');
  });

  test('redacts arbitrary Winston message and nested metadata before formatting', () => {
    const info = sanitizeLogInfo({
      level: 'error',
      message: 'Failure password=LOG_MESSAGE_CANARY',
      metadata: { headers: [{ authorization: 'Bearer LOG_BEARER_CANARY' }] },
      stack: 'Error: token=LOG_STACK_CANARY'
    });

    expect(JSON.stringify(info)).not.toContain('LOG_MESSAGE_CANARY');
    expect(JSON.stringify(info)).not.toContain('LOG_BEARER_CANARY');
    expect(JSON.stringify(info)).not.toContain('LOG_STACK_CANARY');
  });

  test('redacts bearer/JWT text and secret-bearing Error metadata', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYW5hcnkifQ.signature';
    const message = redactSensitiveText(`Authorization: Bearer ${jwt} token=QUERY_TOKEN_CANARY`);
    const error = Object.assign(
      new Error('request failed password=ERROR_PASSWORD_CANARY'),
      { body: '{"token":"ERROR_BODY_CANARY"}', secret: 'ERROR_SECRET_CANARY' }
    );
    const safeError = sanitizeLogValue(error);

    expect(message).not.toContain(jwt);
    expect(message).not.toContain('QUERY_TOKEN_CANARY');
    expect(JSON.stringify(safeError)).not.toContain('ERROR_PASSWORD_CANARY');
    expect(JSON.stringify(safeError)).not.toContain('ERROR_BODY_CANARY');
    expect(JSON.stringify(safeError)).not.toContain('ERROR_SECRET_CANARY');
  });
});
