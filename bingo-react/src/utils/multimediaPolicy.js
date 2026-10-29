export const EVENT_MODES = Object.freeze({
  LEGACY: 'LEGACY',
  LOCAL: 'LOCAL',
  REMOTE_PRESENTIAL: 'REMOTE_PRESENTIAL',
  DISTRIBUTED: 'DISTRIBUTED'
});

const DEFAULT_POLICIES = Object.freeze({
  LOCAL: Object.freeze({
    primarySurface: 'tv',
    playerPlayback: 'optional',
    allowExternalSources: false
  }),
  REMOTE_PRESENTIAL: Object.freeze({
    primarySurface: 'tv',
    playerPlayback: 'optional',
    allowExternalSources: false
  }),
  DISTRIBUTED: Object.freeze({
    primarySurface: 'both',
    playerPlayback: 'optional',
    allowExternalSources: false
  }),
  LEGACY: Object.freeze({
    primarySurface: 'both',
    playerPlayback: 'optional',
    allowExternalSources: true
  })
});

export const resolveMultimediaPolicy = (config = {}) => {
  const mode = Object.values(EVENT_MODES).includes(config?.eventMode)
    ? config.eventMode
    : EVENT_MODES.LEGACY;
  const explicitPolicy = config?.multimediaPolicy;
  const defaults = DEFAULT_POLICIES[mode] || DEFAULT_POLICIES.LEGACY;

  return {
    mode,
    legacy: mode === EVENT_MODES.LEGACY && !explicitPolicy,
    primarySurface: explicitPolicy?.primarySurface || defaults.primarySurface,
    playerPlayback: explicitPolicy?.playerPlayback || defaults.playerPlayback,
    allowExternalSources: typeof explicitPolicy?.allowExternalSources === 'boolean'
      ? explicitPolicy.allowExternalSources
      : defaults.allowExternalSources
  };
};

export const shouldRenderPlayerMedia = (policy) =>
  Boolean(policy) && policy.playerPlayback !== 'disabled';

export const shouldRenderTvMedia = (policy) =>
  Boolean(policy) && ['tv', 'both'].includes(policy.primarySurface);

export const shouldUseExternalSources = (policy) =>
  Boolean(policy?.allowExternalSources);

export const requiresPlayerConsent = (policy, isHost = false) =>
  policy?.playerPlayback === 'optional' && !policy.legacy && !isHost;
