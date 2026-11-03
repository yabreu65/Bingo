const DEFAULT_LOCAL_TV_MEDIA_ORIGIN = 'http://127.0.0.1:8787';
const MEDIA_ID_PATTERN = /^m_[0-9a-f]+$/;

const isLoopbackHostname = (hostname) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

const resolveLocalTvMediaOrigin = (configuredOrigin) => {
  try {
    const origin = new URL(configuredOrigin || DEFAULT_LOCAL_TV_MEDIA_ORIGIN);
    if (!['http:', 'https:'].includes(origin.protocol) || !isLoopbackHostname(origin.hostname)) {
      return DEFAULT_LOCAL_TV_MEDIA_ORIGIN;
    }
    return origin.origin;
  } catch {
    return DEFAULT_LOCAL_TV_MEDIA_ORIGIN;
  }
};

const LOCAL_TV_MEDIA_ORIGIN = resolveLocalTvMediaOrigin(import.meta.env.VITE_LOCAL_TV_MEDIA_ORIGIN);

const normalizeRelativeMediaPath = (relativePath) => {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new TypeError('A relative media path is required');
  }

  const portablePath = relativePath.replaceAll('\\', '/');
  if (portablePath.startsWith('/') || /^[A-Za-z]:\//.test(portablePath)) {
    throw new TypeError('Media paths must be relative');
  }
  const normalized = portablePath;
  const segments = normalized.split('/');
  if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new TypeError('Media paths must remain relative and cannot contain traversal segments');
  }
  return segments.join('/');
};

// The identifier is deterministic, portable and derived only from the
// normalized relative path. It does not expose a machine-specific directory.
export const mediaIdForPath = (relativePath) => {
  const normalized = normalizeRelativeMediaPath(relativePath).normalize('NFKC').toLowerCase();
  return `m_${Array.from(normalized)
    .map((character) => character.codePointAt(0).toString(16).padStart(6, '0'))
    .join('')}`;
};

export const resolveServerMediaUrl = (relativePath) => {
  const normalized = normalizeRelativeMediaPath(relativePath);
  return `/${normalized.split('/').map(encodeURIComponent).join('/')}`;
};

export const isLocalTvMediaPolicy = (policy) =>
  !import.meta.env.PROD && policy?.mode === 'REMOTE_PRESENTIAL' && policy?.tvMediaSource === 'LOCAL_TV';

export const resolveTvMediaUrl = (relativePath, policy) => {
  const normalized = normalizeRelativeMediaPath(relativePath);
  if (import.meta.env.PROD && policy?.tvMediaSource === 'LOCAL_TV') return null;
  if (!isLocalTvMediaPolicy(policy)) return resolveServerMediaUrl(normalized);
  return `${LOCAL_TV_MEDIA_ORIGIN.replace(/\/$/, '')}/media/${mediaIdForPath(normalized)}`;
};

export const isMediaIdentifier = (value) =>
  typeof value === 'string' && MEDIA_ID_PATTERN.test(value);

export { LOCAL_TV_MEDIA_ORIGIN, normalizeRelativeMediaPath };
