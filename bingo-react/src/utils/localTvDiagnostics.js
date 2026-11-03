import { LOCAL_TV_MEDIA_ORIGIN } from './localTvMedia';

// Chromium exposes the granular permission for loopback requests. The former
// `local-network-access` alias is intentionally not queried: older Chromium
// versions could fail while parsing that legacy name.
const LOOPBACK_PERMISSION_NAMES = ['loopback-network'];

const isLoopbackOrigin = (value) => {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
};

const publicOriginRequiresPermission = () => {
  const currentOrigin = globalThis.location?.origin;
  return globalThis.location?.protocol === 'https:' && !isLoopbackOrigin(currentOrigin);
};

export const isLoopbackBrowserOrigin = () => isLoopbackOrigin(globalThis.location?.origin);

export const readLoopbackPermission = async () => {
  if (!globalThis.navigator?.permissions?.query) return 'prompt';

  try {
    const permission = await globalThis.navigator.permissions.query({
      name: LOOPBACK_PERMISSION_NAMES[0]
    });
    return ['denied', 'granted', 'prompt'].includes(permission?.state)
      ? permission.state
      : 'prompt';
  } catch {
    // Unknown permission names must remain actionable: the first probe will
    // be attempted only from the explicit user action in the TV UI.
    return 'prompt';
  }
};

const readAutoplayPolicy = (mediaElement) => {
  if (typeof globalThis.navigator?.getAutoplayPolicy !== 'function') return 'unsupported';
  try {
    return globalThis.navigator.getAutoplayPolicy(mediaElement || 'mediaelement');
  } catch {
    return 'unsupported';
  }
};

export const attemptMediaPlayback = async (mediaElement) => {
  if (!mediaElement || typeof mediaElement.play !== 'function') return 'unavailable';
  try {
    const result = mediaElement.play();
    if (result?.then) await result;
    return 'playing';
  } catch (error) {
    if (error?.name === 'NotAllowedError') return 'autoplay-blocked';
    if (error?.name === 'NotSupportedError') return 'unsupported';
    return 'unavailable';
  }
};

const probeHealth = async (origin) => {
  const healthUrl = `${origin.replace(/\/$/, '')}/health`;
  const requestOptions = {
    cache: 'no-store',
    mode: 'cors',
    targetAddressSpace: 'loopback'
  };
  try {
    const response = await fetch(healthUrl, requestOptions);
    return response.ok ? 'available' : 'unavailable';
  } catch {
    // A loopback media element can work without readable CORS headers. A
    // no-cors probe still tells us whether the browser can reach the service.
    try {
      const response = await fetch(healthUrl, {
        ...requestOptions,
        mode: 'no-cors'
      });
      return response.type === 'opaque' ? 'reachable-opaque' : 'unavailable';
    } catch {
      return 'blocked-or-offline';
    }
  }
};

export const checkLocalTvReadiness = async ({
  origin = LOCAL_TV_MEDIA_ORIGIN,
  mediaElement,
  requestService = false
} = {}) => {
  const permission = await readLoopbackPermission();
  const secureContext = globalThis.isSecureContext === true;
  const loopbackOrigin = isLoopbackOrigin(origin);
  const autoplay = readAutoplayPolicy(mediaElement);

  if (!loopbackOrigin) {
    return { origin, loopbackOrigin, secureContext, permission, service: 'invalid-origin', autoplay, allowed: false };
  }
  if (permission === 'denied') {
    return { origin, loopbackOrigin, secureContext, permission, service: 'permission-denied', autoplay, allowed: false };
  }
  if (!requestService && permission !== 'granted' && publicOriginRequiresPermission()) {
    return { origin, loopbackOrigin, secureContext, permission, service: 'permission-required', autoplay, allowed: false };
  }

  const service = await probeHealth(origin);
  const permissionAfterProbe = await readLoopbackPermission();

  return {
    origin,
    loopbackOrigin,
    secureContext,
    permission: permissionAfterProbe,
    service,
    autoplay,
    allowed: loopbackOrigin && secureContext && permissionAfterProbe !== 'denied' &&
      ['available', 'reachable-opaque'].includes(service)
  };
};

export const LOCAL_TV_PERMISSION_NAMES = LOOPBACK_PERMISSION_NAMES;
