/**
 * Base class for custom application errors
 */
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguish operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: this.stack })
      }
    };
  }
}

/**
 * Validation Error - 400
 * For input validation failures
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
        ...(process.env.NODE_ENV !== 'production' && { stack: this.stack })
      }
    };
  }
}

/**
 * Authentication Error - 401
 * For authentication failures
 */
class AuthenticationError extends AppError {
  constructor(message = 'No autorizado') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization Error - 403
 * For permission/authorization failures
 */
class AuthorizationError extends AppError {
  constructor(message = 'No tienes permisos para realizar esta acción') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not Found Error - 404
 * For resource not found errors
 */
class NotFoundError extends AppError {
  constructor(resource = 'Recurso', identifier = null) {
    const message = identifier
      ? `${resource} con identificador "${identifier}" no encontrado`
      : `${resource} no encontrado`;
    super(message, 404, 'NOT_FOUND');
    this.resource = resource;
    this.identifier = identifier;
  }
}

/**
 * Conflict Error - 409
 * For conflicts like duplicate entries
 */
class ConflictError extends AppError {
  constructor(message = 'El recurso ya existe') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Rate Limit Error - 429
 * For rate limiting failures
 */
class RateLimitError extends AppError {
  constructor(message = 'Demasiadas peticiones. Por favor intenta más tarde', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.retryAfter && { retryAfter: this.retryAfter }),
        ...(process.env.NODE_ENV !== 'production' && { stack: this.stack })
      }
    };
  }
}

/**
 * Internal Server Error - 500
 * For unexpected errors
 */
class InternalServerError extends AppError {
  constructor(message = 'Error interno del servidor') {
    super(message, 500, 'INTERNAL_SERVER_ERROR');
  }
}

/**
 * Bad Request Error - 400
 * For general bad request errors
 */
class BadRequestError extends AppError {
  constructor(message = 'Petición inválida') {
    super(message, 400, 'BAD_REQUEST');
  }
}

/**
 * Service Unavailable Error - 503
 * For external service failures
 */
class ServiceUnavailableError extends AppError {
  constructor(service = 'Servicio', message = null) {
    const errorMessage = message || `${service} no disponible temporalmente`;
    super(errorMessage, 503, 'SERVICE_UNAVAILABLE');
    this.service = service;
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
  BadRequestError,
  ServiceUnavailableError
};
