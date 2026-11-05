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
    tvMediaSource: 'SERVER',
    playerPlayback: 'optional',
    allowExternalSources: false
  }),
  REMOTE_PRESENTIAL: Object.freeze({
    primarySurface: 'tv',
    tvMediaSource: 'SERVER',
    playerPlayback: 'optional',
    allowExternalSources: false
  }),
  DISTRIBUTED: Object.freeze({
    primarySurface: 'both',
    tvMediaSource: 'SERVER',
    playerPlayback: 'optional',
    allowExternalSources: false
  })
});

const clonePolicy = (policy) => ({
  primarySurface: policy.primarySurface,
  tvMediaSource: policy.tvMediaSource,
  playerPlayback: policy.playerPlayback,
  allowExternalSources: policy.allowExternalSources
});

const resolveEventMode = (config = {}) => {
  const mode = config?.eventMode;
  return Object.values(EVENT_MODES).includes(mode) ? mode : EVENT_MODES.LEGACY;
};

const resolveMultimediaPolicy = (config = {}) => {
  const mode = resolveEventMode(config);
  const defaults = DEFAULT_MULTIMEDIA_POLICIES[mode];
  if (!defaults && !config?.multimediaPolicy) return null;
  const policy = { ...(defaults ? clonePolicy(defaults) : {}), ...(config.multimediaPolicy || {}) };
  if (mode !== EVENT_MODES.REMOTE_PRESENTIAL) policy.tvMediaSource = 'SERVER';
  return policy;
};

const normalizeNewRoomConfig = (config = {}) => {
  // Player capacity counts participants, not the organizer host; keep the
  // historical schema fallback consistent for new rooms and older documents.
  const normalized = { ...config, maxPlayers: config.maxPlayers ?? 50 };

  // New rooms default to full card as the ONLY winning mode.
  // Preserve explicitly selected modes and existing legacy single-mode rooms.
  if (config.gameMode === undefined && config.gameModes === undefined) {
    normalized.gameMode = 'full';
    normalized.gameModes = ['full'];
  }

  const eventMode = SELECTABLE_EVENT_MODES.includes(config.eventMode)
    ? config.eventMode
    : EVENT_MODES.LOCAL;

  normalized.eventMode = eventMode;
  normalized.multimediaPolicy = {
    ...clonePolicy(DEFAULT_MULTIMEDIA_POLICIES[eventMode]),
    ...(config.multimediaPolicy || {})
  };
  if (eventMode !== EVENT_MODES.REMOTE_PRESENTIAL) {
    normalized.multimediaPolicy.tvMediaSource = 'SERVER';
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
