import { describe, expect, it } from 'vitest';
import {
  EVENT_MODES,
  requiresPlayerConsent,
  resolveMultimediaPolicy,
  shouldRenderPlayerMedia,
  shouldRenderTvMedia,
  shouldUseExternalSources
} from './multimediaPolicy';

describe('multimedia policy resolution', () => {
  it('preserves legacy behavior when modality and policy are absent', () => {
    const policy = resolveMultimediaPolicy({});

    expect(policy).toMatchObject({
      mode: EVENT_MODES.LEGACY,
      legacy: true,
      primarySurface: 'both',
      playerPlayback: 'optional',
      allowExternalSources: true
    });
    expect(shouldRenderPlayerMedia(policy)).toBe(true);
    expect(shouldRenderTvMedia(policy)).toBe(true);
    expect(shouldUseExternalSources(policy)).toBe(true);
    expect(requiresPlayerConsent(policy, false)).toBe(false);
  });

  it.each(['LOCAL', 'REMOTE_PRESENTIAL'])('uses TV as the primary surface for %s', (eventMode) => {
    const policy = resolveMultimediaPolicy({ eventMode });

    expect(policy.primarySurface).toBe('tv');
    expect(policy.playerPlayback).toBe('optional');
    expect(shouldRenderTvMedia(policy)).toBe(true);
    expect(shouldRenderPlayerMedia(policy)).toBe(true);
    expect(shouldUseExternalSources(policy)).toBe(false);
    expect(requiresPlayerConsent(policy, false)).toBe(true);
  });

  it('allows distributed playback only when configured', () => {
    const policy = resolveMultimediaPolicy({
      eventMode: 'DISTRIBUTED',
      multimediaPolicy: {
        primarySurface: 'players',
        playerPlayback: 'required',
        allowExternalSources: true
      }
    });

    expect(policy).toMatchObject({
      mode: EVENT_MODES.DISTRIBUTED,
      primarySurface: 'players',
      playerPlayback: 'required',
      allowExternalSources: true
    });
    expect(shouldRenderTvMedia(policy)).toBe(false);
    expect(shouldRenderPlayerMedia(policy)).toBe(true);
    expect(shouldUseExternalSources(policy)).toBe(true);
    expect(requiresPlayerConsent(policy, false)).toBe(false);
  });

  it('does not mount player media when playback is disabled', () => {
    const policy = resolveMultimediaPolicy({
      eventMode: 'LOCAL',
      multimediaPolicy: {
        primarySurface: 'tv',
        playerPlayback: 'disabled',
        allowExternalSources: false
      }
    });

    expect(shouldRenderPlayerMedia(policy)).toBe(false);
    expect(shouldRenderTvMedia(policy)).toBe(true);
    expect(shouldUseExternalSources(policy)).toBe(false);
  });

  it('merges partial explicit policies over the mode defaults', () => {
    const policy = resolveMultimediaPolicy({
      eventMode: 'DISTRIBUTED',
      multimediaPolicy: { playerPlayback: 'disabled' }
    });

    expect(policy.primarySurface).toBe('both');
    expect(policy.playerPlayback).toBe('disabled');
    expect(policy.allowExternalSources).toBe(false);
  });
});
