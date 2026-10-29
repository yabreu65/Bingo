const { sanitizeBody, sanitizeRequestUrl } = require('../middleware/requestLogger');

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
});
