const logger = require('../config/logger');
const { sanitizeBody, sanitizeRequestUrl } = require('../utils/redactSecrets');

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

module.exports = requestLogger;
module.exports.sanitizeBody = sanitizeBody;
module.exports.sanitizeRequestUrl = sanitizeRequestUrl;
