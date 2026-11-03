import { afterEach, describe, expect, it, vi } from 'vitest';
import { attemptMediaPlayback, checkLocalTvReadiness, readLoopbackPermission } from './localTvDiagnostics';

describe('local TV browser diagnostics', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('detects a denied loopback permission', async () => {
    vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue({ state: 'denied' }) } });
    expect(await readLoopbackPermission()).toBe('denied');
  });

  it('does not probe the loopback service while permission is still pending', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) } });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('location', { origin: 'https://public.example', protocol: 'https:' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkLocalTvReadiness({ origin: 'http://127.0.0.1:8787' })).resolves.toMatchObject({
      permission: 'prompt',
      service: 'permission-required',
      allowed: false
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8787/health', expect.objectContaining({
      targetAddressSpace: 'loopback'
    }));
  });

  it('starts the permission-triggering probe only when explicitly requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, type: 'basic' });
    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) }
    });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('location', { origin: 'https://public.example', protocol: 'https:' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkLocalTvReadiness({
      origin: 'http://127.0.0.1:8787',
      requestService: true
    })).resolves.toMatchObject({
      service: 'available',
      allowed: true
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8787/health', expect.objectContaining({
      targetAddressSpace: 'loopback'
    }));
  });

  it('classifies autoplay denial without hiding the media error', async () => {
    const media = { play: vi.fn().mockRejectedValue(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) };
    await expect(attemptMediaPlayback(media)).resolves.toBe('autoplay-blocked');
  });
});
