const logger = require('../config/logger');

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

    // Determinar nivel de log basado en status code
    let logLevel = 'info';
    if (statusCode >= 500) {
      logLevel = 'error';
    } else if (statusCode >= 400) {
      logLevel = 'warn';
    }

    // Log del request
    logger[logLevel](`${req.method} ${req.originalUrl}`, {
      method: req.method,
      url: req.originalUrl,
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
  const sensitiveFields = ['password', 'token', 'refreshToken', 'secret'];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  });

  return sanitized;
}

module.exports = requestLogger;
