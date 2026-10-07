/**
 * Utilidades para Respuestas de Error Estandarizadas
 *
 * Este módulo proporciona funciones helper para crear respuestas de error
 * consistentes en toda la aplicación (HTTP routes y Socket.io).
 *
 * Formato estándar:
 * {
 *   success: false,
 *   error: {
 *     code: 'ERROR_CODE',
 *     message: 'Mensaje user-friendly',
 *     details: [...],      // Opcional, para errores de validación
 *     retryAfter: 45       // Opcional, para rate limiting (NÚMERO en segundos)
 *   }
 * }
 *
 * @module errorResponses
 */

/**
 * Crea una respuesta de éxito estandarizada.
 *
 * @param {any} data - Los datos a retornar
 * @returns {object} Respuesta de éxito: {success: true, data: ...}
 *
 * @example
 * res.json(successResponse({ room: roomData, players: [] }));
 * // → { success: true, data: { room: ..., players: [] } }
 */
function successResponse(data) {
  return {
    success: true,
    data: data
  };
}

/**
 * Crea una respuesta de error estandarizada.
 *
 * @param {string} code - Código de error (ej: 'VALIDATION_ERROR', 'NOT_FOUND')
 * @param {string} message - Mensaje user-friendly en español
 * @param {any} [details=null] - Detalles adicionales (ej: errores de validación por campo)
 * @param {number} [statusCode=400] - Código HTTP (no incluido en respuesta, solo para referencia)
 * @returns {object} Respuesta de error estandarizada
 *
 * @example
 * res.status(404).json(errorResponse('NOT_FOUND', 'Sala no encontrada', null, 404));
 * // → { success: false, error: { code: 'NOT_FOUND', message: 'Sala no encontrada' } }
 *
 * @example
 * res.status(500).json(errorResponse('INTERNAL_ERROR', 'Error interno del servidor', null, 500));
 */
function errorResponse(code, message, details = null, statusCode = 400) {
  const response = {
    success: false,
    error: {
      code: code,
      message: message
    }
  };

  // Agregar details solo si existen
  if (details !== null && details !== undefined) {
    response.error.details = details;
  }

  return response;
}

/**
 * Crea una respuesta de error de rate limiting con retryAfter.
 * IMPORTANTE: retryAfter debe ser un NÚMERO (segundos), no un string.
 *
 * @param {number} retryAfterSeconds - Segundos hasta que se puede reintentar (NÚMERO)
 * @returns {object} Respuesta de error de rate limit
 *
 * @example
 * res.status(429).json(rateLimitErrorResponse(45));
 * // → {
 * //   success: false,
 * //   error: {
 * //     code: 'RATE_LIMIT_EXCEEDED',
 * //     message: 'Demasiadas solicitudes. Intenta de nuevo más tarde',
 * //     retryAfter: 45
 * //   }
 * // }
 */
function rateLimitErrorResponse(retryAfterSeconds) {
  // Asegurar que retryAfter es un número
  const retryAfter = typeof retryAfterSeconds === 'number'
    ? Math.ceil(retryAfterSeconds)
    : parseInt(retryAfterSeconds, 10) || 60;

  return {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas solicitudes. Intenta de nuevo más tarde',
      retryAfter: retryAfter // NÚMERO, no string
    }
  };
}

/**
 * Crea una respuesta de error de validación con detalles por campo.
 *
 * @param {string} message - Mensaje general del error
 * @param {Array<{field: string, message: string}>} fieldErrors - Array de errores por campo
 * @returns {object} Respuesta de error de validación
 *
 * @example
 * res.status(400).json(validationErrorResponse(
 *   'Los datos enviados no son válidos',
 *   [
 *     { field: 'roomName', message: 'El nombre de sala es requerido' },
 *     { field: 'hostName', message: 'El nombre del host debe tener al menos 2 caracteres' }
 *   ]
 * ));
 */
function validationErrorResponse(message, fieldErrors) {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: message,
      details: fieldErrors
    }
  };
}

/**
 * Crea una respuesta de error "Not Found".
 *
 * @param {string} resource - El recurso que no se encontró (ej: 'Sala', 'Jugador', 'Cartón')
 * @returns {object} Respuesta de error 404
 *
 * @example
 * res.status(404).json(notFoundErrorResponse('Sala'));
 * // → {
 * //   success: false,
 * //   error: {
 * //     code: 'NOT_FOUND',
 * //     message: 'Sala no encontrada'
 * //   }
 * // }
 */
function notFoundErrorResponse(resource) {
  return {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `${resource} no ${resource.endsWith('a') ? 'encontrada' : 'encontrado'}`
    }
  };
}

/**
 * Crea una respuesta de error de autenticación.
 *
 * @param {string} [message='No autorizado'] - Mensaje de error
 * @returns {object} Respuesta de error 401
 *
 * @example
 * res.status(401).json(authenticationErrorResponse());
 * // → {
 * //   success: false,
 * //   error: {
 * //     code: 'UNAUTHORIZED',
 * //     message: 'No autorizado'
 * //   }
 * // }
 */
function authenticationErrorResponse(message = 'No autorizado') {
  return {
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: message
    }
  };
}

/**
 * Crea una respuesta de error de autorización (forbidden).
 *
 * @param {string} [message='Acceso denegado'] - Mensaje de error
 * @returns {object} Respuesta de error 403
 *
 * @example
 * res.status(403).json(authorizationErrorResponse('No tienes permiso para realizar esta acción'));
 */
function authorizationErrorResponse(message = 'Acceso denegado') {
  return {
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: message
    }
  };
}

/**
 * Crea una respuesta de error de conflicto.
 * Útil para casos como "el recurso ya existe" o "estado inválido".
 *
 * @param {string} message - Mensaje de error
 * @returns {object} Respuesta de error 409
 *
 * @example
 * res.status(409).json(conflictErrorResponse('Ya existe una sala con ese código'));
 */
function conflictErrorResponse(message) {
  return {
    success: false,
    error: {
      code: 'CONFLICT',
      message: message
    }
  };
}

/**
 * Crea una respuesta de error interno del servidor.
 *
 * @param {string} [message='Error interno del servidor'] - Mensaje de error
 * @param {any} [details=null] - Detalles del error (solo en desarrollo)
 * @returns {object} Respuesta de error 500
 *
 * @example
 * res.status(500).json(internalErrorResponse());
 */
function internalErrorResponse(message = 'Error interno del servidor', details = null) {
  const response = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: message
    }
  };

  // Solo incluir detalles en desarrollo
  if (details && process.env.NODE_ENV === 'development') {
    response.error.details = details;
  }

  return response;
}

// ============================================
// Socket.io Response Helpers
// ============================================

/**
 * Crea una respuesta de error para Socket.io callbacks.
 * Usa el mismo formato que HTTP para consistencia.
 *
 * @param {string} code - Código de error
 * @param {string} message - Mensaje user-friendly
 * @param {any} [details=null] - Detalles adicionales
 * @returns {object} Respuesta de error para socket callback
 *
 * @example
 * // En un socket handler:
 * socket.on('join-room', async (data, callback) => {
 *   if (!room) {
 *     return callback(socketErrorResponse('ROOM_NOT_FOUND', 'La sala no existe'));
 *   }
 *   callback(socketSuccessResponse({ room, players }));
 * });
 */
function socketErrorResponse(code, message, details = null) {
  return errorResponse(code, message, details);
}

/**
 * Crea una respuesta de éxito para Socket.io callbacks.
 *
 * @param {any} data - Los datos a retornar
 * @returns {object} Respuesta de éxito para socket callback
 *
 * @example
 * callback(socketSuccessResponse({ room: roomData, players: playersData }));
 */
function socketSuccessResponse(data) {
  return successResponse(data);
}

/**
 * Emite un evento de error a través de socket.
 * Útil para errores que no son parte de un callback.
 *
 * @param {object} socket - Socket.io socket instance
 * @param {string} code - Código de error
 * @param {string} message - Mensaje de error
 * @param {any} [details=null] - Detalles adicionales
 *
 * @example
 * // En lugar de:
 * socket.emit('error', { message: 'Error' });
 *
 * // Usar:
 * emitSocketError(socket, 'GAME_ERROR', 'No se puede iniciar el juego');
 */
function emitSocketError(socket, code, message, details = null) {
  socket.emit('error', errorResponse(code, message, details));
}

/**
 * Emite un evento de error a toda una sala.
 *
 * @param {object} io - Socket.io server instance
 * @param {string} roomCode - Código de la sala
 * @param {string} code - Código de error
 * @param {string} message - Mensaje de error
 * @param {any} [details=null] - Detalles adicionales
 *
 * @example
 * emitRoomError(io, 'ABC123', 'GAME_ERROR', 'El juego ha sido cancelado');
 */
function emitRoomError(io, roomCode, code, message, details = null) {
  io.to(roomCode).emit('error', errorResponse(code, message, details));
}

// ============================================
// Error Code Constants
// ============================================

/**
 * Códigos de error estándar de la aplicación.
 * Usar estos códigos para consistencia.
 */
const ErrorCodes = {
  // Errores de validación
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Errores de autenticación/autorización
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Errores de recursos
  NOT_FOUND: 'NOT_FOUND',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  CARD_NOT_FOUND: 'CARD_NOT_FOUND',

  // Errores de estado
  CONFLICT: 'CONFLICT',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  GAME_NOT_STARTED: 'GAME_NOT_STARTED',
  ROOM_FULL: 'ROOM_FULL',
  INVALID_GAME_STATE: 'INVALID_GAME_STATE',

  // Errores de rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // Errores del servidor
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',

  // Errores de red/conexión
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  TIMEOUT: 'TIMEOUT',
};

// ============================================
// Exports
// ============================================

module.exports = {
  // HTTP Response Helpers
  successResponse,
  errorResponse,
  rateLimitErrorResponse,
  validationErrorResponse,
  notFoundErrorResponse,
  authenticationErrorResponse,
  authorizationErrorResponse,
  conflictErrorResponse,
  internalErrorResponse,

  // Socket.io Response Helpers
  socketErrorResponse,
  socketSuccessResponse,
  emitSocketError,
  emitRoomError,

  // Error Codes
  ErrorCodes,
};
