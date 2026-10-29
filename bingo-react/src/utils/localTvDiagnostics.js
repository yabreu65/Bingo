import { LOCAL_TV_MEDIA_ORIGIN } from './localTvMedia';

const LOOPBACK_PERMISSION_NAMES = ['loopback-network', 'local-network-access'];

const isLoopbackOrigin = (value) => {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
};

export const readLoopbackPermission = async () => {
  if (!globalThis.navigator?.permissions?.query) return 'unsupported';

  for (const name of LOOPBACK_PERMISSION_NAMES) {
    try {
      const permission = await globalThis.navigator.permissions.query({ name });
      if (permission?.state === 'denied') return 'denied';
      if (permission?.state === 'granted') return 'granted';
      if (permission?.state === 'prompt') return 'prompt';
    } catch {
      // Permission names are not implemented consistently across browsers.
    }
  }
  return 'unsupported';
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
  try {
    const response = await fetch(healthUrl, { cache: 'no-store', mode: 'cors' });
    return response.ok ? 'available' : 'unavailable';
  } catch {
    // A loopback media element can work without readable CORS headers. A
    // no-cors probe still tells us whether the browser can reach the service.
    try {
      const response = await fetch(healthUrl, { cache: 'no-store', mode: 'no-cors' });
      return response.type === 'opaque' ? 'reachable-opaque' : 'unavailable';
    } catch {
      return 'blocked-or-offline';
    }
  }
};

export const checkLocalTvReadiness = async ({
  origin = LOCAL_TV_MEDIA_ORIGIN,
  mediaElement
} = {}) => {
  const permission = await readLoopbackPermission();
  const secureContext = globalThis.isSecureContext === true;
  const loopbackOrigin = isLoopbackOrigin(origin);
  const service = await probeHealth(origin);
  const autoplay = readAutoplayPolicy(mediaElement);

  return {
    origin,
    loopbackOrigin,
    secureContext,
    permission,
    service,
    autoplay,
    allowed: loopbackOrigin && secureContext && permission !== 'denied' &&
      ['available', 'reachable-opaque'].includes(service)
  };
};

export const LOCAL_TV_PERMISSION_NAMES = LOOPBACK_PERMISSION_NAMES;
