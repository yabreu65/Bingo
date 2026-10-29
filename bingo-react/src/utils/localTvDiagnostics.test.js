import { afterEach, describe, expect, it, vi } from 'vitest';
import { attemptMediaPlayback, checkLocalTvReadiness, readLoopbackPermission } from './localTvDiagnostics';

describe('local TV browser diagnostics', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('detects a denied loopback permission', async () => {
    vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue({ state: 'denied' }) } });
    expect(await readLoopbackPermission()).toBe('denied');
  });

  it('detects a granted loopback permission and reachable service', async () => {
    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
      getAutoplayPolicy: vi.fn().mockReturnValue('allowed-muted')
    });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, type: 'basic' }));

    await expect(checkLocalTvReadiness({ origin: 'http://127.0.0.1:8787' })).resolves.toMatchObject({
      secureContext: true,
      loopbackOrigin: true,
      permission: 'granted',
      service: 'available',
      allowed: true
    });
  });

  it('classifies autoplay denial without hiding the media error', async () => {
    const media = { play: vi.fn().mockRejectedValue(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) };
    await expect(attemptMediaPlayback(media)).resolves.toBe('autoplay-blocked');
  });
});
