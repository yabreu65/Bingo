const EVENT_MODES = Object.freeze({
  LEGACY: 'LEGACY',
  LOCAL: 'LOCAL',
  REMOTE_PRESENTIAL: 'REMOTE_PRESENTIAL',
  DISTRIBUTED: 'DISTRIBUTED'
});

const SELECTABLE_EVENT_MODES = Object.freeze([
  EVENT_MODES.LOCAL,
  EVENT_MODES.REMOTE_PRESENTIAL,
  EVENT_MODES.DISTRIBUTED
]);

const DEFAULT_MULTIMEDIA_POLICIES = Object.freeze({
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
  })
});

const clonePolicy = (policy) => ({
  primarySurface: policy.primarySurface,
  playerPlayback: policy.playerPlayback,
  allowExternalSources: policy.allowExternalSources
});

const resolveEventMode = (config = {}) => {
  const mode = config?.eventMode;
  return Object.values(EVENT_MODES).includes(mode) ? mode : EVENT_MODES.LEGACY;
};

const resolveMultimediaPolicy = (config = {}) => {
  if (config?.multimediaPolicy) return { ...config.multimediaPolicy };
  const mode = resolveEventMode(config);
  return DEFAULT_MULTIMEDIA_POLICIES[mode]
    ? clonePolicy(DEFAULT_MULTIMEDIA_POLICIES[mode])
    : null;
};

const normalizeNewRoomConfig = (config = {}) => {
  const normalized = { ...config };
  const eventMode = SELECTABLE_EVENT_MODES.includes(config.eventMode)
    ? config.eventMode
    : EVENT_MODES.LOCAL;

  normalized.eventMode = eventMode;
  if (!config.multimediaPolicy) {
    normalized.multimediaPolicy = clonePolicy(DEFAULT_MULTIMEDIA_POLICIES[eventMode]);
  }

  return normalized;
};

module.exports = {
  EVENT_MODES,
  SELECTABLE_EVENT_MODES,
  DEFAULT_MULTIMEDIA_POLICIES,
  resolveEventMode,
  resolveMultimediaPolicy,
  normalizeNewRoomConfig
};
