const REDACTED = '***REDACTED***';
const MAX_DEPTH = 8;
const MAX_ENTRIES = 100;
const SENSITIVE_KEY_PARTS = [
  'password', 'passwd', 'pwd', 'token', 'jwt', 'secret', 'capability',
  'credential', 'authorization', 'cookie', 'apikey', 'privatekey'
];
const SENSITIVE_ASSIGNMENT = /(["']?)([a-z0-9_.-]*?(?:password|passwd|pwd|token|jwt|secret|capability|credential|authorization|cookie|api[_-]?key|private[_-]?key|session(?:token|id|key|secret)?)[a-z0-9_.-]*?)\1(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}\]]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const OPAQUE_CAPABILITY = /\b[A-Za-z0-9_-]{43}\b/g;

function isSensitiveKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part)) ||
    /^(?:session|sessionid|sessiontoken|sessionkey|sessionsecret)$/.test(normalized);
}

function redactSensitiveText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(BEARER_TOKEN, `Bearer ${REDACTED}`)
    .replace(SENSITIVE_ASSIGNMENT, (match, quote, key, separator) =>
      isSensitiveKey(key) ? `${quote}${key}${quote}${separator}${REDACTED}` : match)
    .replace(JWT, REDACTED)
    .replace(OPAQUE_CAPABILITY, REDACTED);
}

function sanitizeLogValue(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === 'string') return redactSensitiveText(value);
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[MaxDepth]';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    const sanitizedError = {
      name: redactSensitiveText(value.name),
      message: redactSensitiveText(value.message),
      stack: redactSensitiveText(value.stack)
    };
    for (const key of Object.keys(value).slice(0, MAX_ENTRIES)) {
      if (key === 'name' || key === 'message' || key === 'stack') continue;
      sanitizedError[key] = isSensitiveKey(key)
        ? REDACTED
        : sanitizeLogValue(value[key], seen, depth + 1);
    }
    return sanitizedError;
  }

  if (Array.isArray(value)) {
    const sanitized = value.slice(0, MAX_ENTRIES).map((entry) => sanitizeLogValue(entry, seen, depth + 1));
    if (value.length > MAX_ENTRIES) sanitized.push(`[${value.length - MAX_ENTRIES} items omitted]`);
    return sanitized;
  }

  const sanitized = {};
  const entries = Object.entries(value).slice(0, MAX_ENTRIES);
  for (const [key, entry] of entries) {
    sanitized[key] = isSensitiveKey(key)
      ? REDACTED
      : sanitizeLogValue(entry, seen, depth + 1);
  }
  if (Object.keys(value).length > MAX_ENTRIES) sanitized._omittedEntries = Object.keys(value).length - MAX_ENTRIES;
  return sanitized;
}

function sanitizeBody(body) {
  if (body === undefined || body === null) return undefined;
  return sanitizeLogValue(body);
}

function sanitizeLogInfo(info) {
  for (const key of Object.keys(info)) {
    info[key] = isSensitiveKey(key) ? REDACTED
      : key === 'message' && typeof info[key] === 'string'
        ? redactSensitiveText(info[key])
        : sanitizeLogValue(info[key]);
  }
  return info;
}

function sanitizeRequestUrl(requestUrl) {
  if (typeof requestUrl !== 'string') return requestUrl;

  try {
    const url = new URL(requestUrl, 'http://request.invalid');
    const sanitizedPath = url.pathname.split('/').map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // Keep malformed path bytes opaque; text redaction below remains active.
      }
      return /^[A-Za-z0-9_-]{43}$/.test(decoded) ? REDACTED : redactSensitiveText(segment);
    }).join('/');
    const sanitizedSearch = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      sanitizedSearch.append(key, isSensitiveKey(key) ? REDACTED : redactSensitiveText(value));
    }
    const query = sanitizedSearch.toString();
    return redactSensitiveText(`${sanitizedPath}${query ? `?${query}` : ''}`);
  } catch {
    return redactSensitiveText(requestUrl);
  }
}

module.exports = {
  REDACTED,
  isSensitiveKey,
  redactSensitiveText,
  sanitizeBody,
  sanitizeLogInfo,
  sanitizeLogValue,
  sanitizeRequestUrl
};
