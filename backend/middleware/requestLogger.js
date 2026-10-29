const logger = require('../config/logger');

const sanitizeRequestUrl = (requestUrl) => {
  if (typeof requestUrl !== 'string') return requestUrl;
  try {
    const url = new URL(requestUrl, 'http://request.invalid');
    ['token', 'tvToken', 'tvSessionToken', 'hostCapability', 'playerCapability', 'authorization'].forEach((key) => {
      if (url.searchParams.has(key)) url.searchParams.set(key, '***REDACTED***');
    });
    return `${url.pathname}${url.search}`;
  } catch {
    return requestUrl.replace(/(token|tvToken|tvSessionToken|hostCapability|playerCapability|authorization)=[^&\s]+/gi, '$1=***REDACTED***');
  }
};

/**
 * Middleware para logging de requests HTTP
 * Registra todas las peticiones con detalles importantes
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Capturar la función original res.end
  const originalEnd = res.end;

  // Sobrescribir res.end para logear cuando termine la respuesta
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const sanitizedUrl = sanitizeRequestUrl(req.originalUrl);

    // Determinar nivel de log basado en status code
    let logLevel = 'info';
    if (statusCode >= 500) {
      logLevel = 'error';
    } else if (statusCode >= 400) {
      logLevel = 'warn';
    }

    // Log del request
    logger[logLevel](`${req.method} ${sanitizedUrl}`, {
      method: req.method,
      url: sanitizedUrl,
      status: statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      userId: req.user?.userId,
      body: req.method !== 'GET' && process.env.NODE_ENV !== 'production'
        ? sanitizeBody(req.body)
        : undefined
    });

    // Llamar a la función original
    originalEnd.apply(res, args);
  };

  next();
};

/**
 * Sanitiza el body del request para no logear información sensible
 */
function sanitizeBody(body) {
  if (!body) return undefined;

  const sanitized = { ...body };
  const sensitiveFields = [
    'password', 'token', 'refreshToken', 'secret', 'tvToken', 'tvSessionToken',
    'hostCapability', 'playerCapability', 'authorization'
  ];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  });

  return sanitized;
}

module.exports = requestLogger;
module.exports.sanitizeBody = sanitizeBody;
module.exports.sanitizeRequestUrl = sanitizeRequestUrl;
