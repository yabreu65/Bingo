const logger = require('../config/logger');
const { AppError } = require('../utils/errors');
const {
  redactSensitiveText,
  sanitizeBody,
  sanitizeLogValue,
  sanitizeRequestUrl
} = require('../utils/redactSecrets');

/**
 * Middleware centralizado de manejo de errores
 * Debe ser el último middleware en la cadena
 */
const errorHandler = (err, req, res, next) => {
  const safeError = err instanceof Error
    ? sanitizeLogValue(err)
    : { name: 'Error', message: redactSensitiveText(String(err)) };

  logger.logError(safeError, {
    method: req.method,
    url: sanitizeRequestUrl(req.originalUrl),
    ip: req.ip,
    userId: req.user?.userId,
    body: sanitizeBody(req.body)
  });

  if (err.isOperational) {
    return res.status(err.statusCode).json(sanitizeLogValue(err.toJSON()));
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'JSON malformado' }
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud es demasiado grande' }
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Error de validación',
        details: Object.values(err.errors || {}).map((error) => ({
          field: redactSensitiveText(error.path),
          message: redactSensitiveText(error.message)
        }))
      }
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'ID inválido' }
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'registro';
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: `Ya existe un registro con ese ${redactSensitiveText(field)}`
      }
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token inválido' }
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'El token ha expirado' }
    });
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: { code: 'FILE_UPLOAD_ERROR', message: 'No se pudo procesar el archivo' }
    });
  }

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Error interno del servidor'
    }
  });
};

/**
 * Middleware para manejar rutas no encontradas (404)
 * Debe colocarse antes del errorHandler pero después de todas las rutas
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Ruta ${req.method} ${sanitizeRequestUrl(req.originalUrl)} no encontrada`
    }
  });
};

/**
 * Wrapper para async route handlers
 * Captura errores de promesas y los pasa al error handler
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
