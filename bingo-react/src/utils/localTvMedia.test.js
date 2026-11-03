import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveMultimediaPolicy, shouldRenderTvMedia, shouldUseExternalSources } from './multimediaPolicy';
import {
  isLocalTvMediaPolicy,
  isMediaIdentifier,
  mediaIdForPath,
  normalizeRelativeMediaPath,
  resolveTvMediaUrl
} from './localTvMedia';

afterEach(() => vi.unstubAllEnvs());

describe('local TV media resolution', () => {
  it('blocks uncertified LOCAL_TV in production without a SERVER fallback', () => {
    vi.stubEnv('PROD', true);
    const policy = { mode: 'REMOTE_PRESENTIAL', tvMediaSource: 'LOCAL_TV' };
    expect(isLocalTvMediaPolicy(policy)).toBe(false);
    expect(resolveTvMediaUrl('music/ci-video.mp4', policy)).toBeNull();
    const effective = resolveMultimediaPolicy({ eventMode: 'REMOTE_PRESENTIAL', multimediaPolicy: { tvMediaSource: 'LOCAL_TV', allowExternalSources: true } });
    expect(effective.tvMediaSource).toBe('LOCAL_TV');
    expect(effective.mediaBlocked).toBe(true);
    expect(shouldRenderTvMedia(effective)).toBe(false);
    expect(shouldUseExternalSources(effective)).toBe(false);
  });
  it('creates a stable identifier from a relative path only', () => {
    const first = mediaIdForPath('music/ci-video.mp4');
    expect(first).toBe(mediaIdForPath('music/ci-video.mp4'));
    expect(first).toMatch(/^m_[0-9a-f]+$/);
    expect(isMediaIdentifier(first)).toBe(true);
    expect(first).not.toContain('/');
  });

  it('resolves LOCAL_TV only for remote-presential events', () => {
    const policy = { mode: 'REMOTE_PRESENTIAL', tvMediaSource: 'LOCAL_TV' };
    expect(isLocalTvMediaPolicy(policy)).toBe(true);
    expect(resolveTvMediaUrl('music/ci-video.mp4', policy)).toMatch(
      /^http:\/\/127\.0\.0\.1:8787\/media\/m_[0-9a-f]+$/
    );
    expect(resolveTvMediaUrl('music/ci-video.mp4', { mode: 'LOCAL', tvMediaSource: 'LOCAL_TV' }))
      .toBe('/music/ci-video.mp4');
  });

  it('keeps SERVER and legacy media relative to the application origin', () => {
    expect(resolveTvMediaUrl('music/karaoke/ci-karaoke.mp4', { mode: 'REMOTE_PRESENTIAL', tvMediaSource: 'SERVER' }))
      .toBe('/music/karaoke/ci-karaoke.mp4');
    expect(resolveTvMediaUrl('sounds/aplauso.mp3', { mode: 'LEGACY' }))
      .toBe('/sounds/aplauso.mp3');
  });

  it('rejects absolute and traversal paths', () => {
    expect(() => normalizeRelativeMediaPath('/etc/passwd')).toThrow();
    expect(() => normalizeRelativeMediaPath('../private.mp4')).toThrow();
    expect(() => normalizeRelativeMediaPath('music/../private.mp4')).toThrow();
  });
});
