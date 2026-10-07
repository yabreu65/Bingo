/**
 * Utilidades de Manejo Seguro de Errores
 *
 * Este módulo proporciona funciones para convertir de forma segura
 * cualquier valor (objetos, errores, strings, etc.) en texto renderizable
 * en React, previniendo crashes del tipo "Objects are not valid as a React child".
 *
 * @module errorUtils
 */

/**
 * Extrae un mensaje de error user-friendly de cualquier tipo de valor.
 * Maneja de forma segura: objetos, Error instances, strings, números,
 * arrays, null, undefined, y referencias circulares.
 *
 * @param {any} error - El valor del error (puede ser string, objeto, Error, etc.)
 * @param {string} [fallback='Ha ocurrido un error'] - Mensaje por defecto si la extracción falla
 * @returns {string} Un string seguro para renderizar
 *
 * @example
 * // Extrae mensaje de objeto de error
 * getSafeErrorMessage({code: 'ERR', message: 'Error de conexión'})
 * // → 'Error de conexión'
 *
 * @example
 * // Maneja strings directamente
 * getSafeErrorMessage('Error simple')
 * // → 'Error simple'
 *
 * @example
 * // Maneja null/undefined con fallback
 * getSafeErrorMessage(null)
 * // → 'Ha ocurrido un error'
 */
export function getSafeErrorMessage(error, fallback = 'Ha ocurrido un error') {
  // Si es null o undefined, retornar fallback
  if (error == null) {
    return fallback;
  }

  // Si ya es un string, retornarlo directamente
  if (typeof error === 'string') {
    return error.trim() || fallback;
  }

  // Si es un número, convertirlo a string
  if (typeof error === 'number') {
    return String(error);
  }

  // Si es un boolean, convertirlo a string
  if (typeof error === 'boolean') {
    return String(error);
  }

  // Si es una instancia de Error, usar su mensaje
  if (error instanceof Error) {
    return error.message || fallback;
  }

  // Si es un objeto, intentar extraer el mensaje
  if (typeof error === 'object') {
    try {
      // Intentar extraer mensaje de diferentes formatos comunes

      // Formato: { message: 'texto' }
      if (error.message && typeof error.message === 'string') {
        return error.message.trim() || fallback;
      }

      // Formato: { error: 'texto' } o { error: { message: 'texto' } }
      if (error.error) {
        if (typeof error.error === 'string') {
          return error.error.trim() || fallback;
        }
        if (typeof error.error === 'object' && error.error.message) {
          return error.error.message.trim() || fallback;
        }
      }

      // Formato: { data: { message: 'texto' } }
      if (error.data && typeof error.data === 'object' && error.data.message) {
        return error.data.message.trim() || fallback;
      }

      // Si no se puede extraer un mensaje, intentar JSON.stringify
      // (con protección contra referencias circulares)
      const seen = new WeakSet();
      const jsonString = JSON.stringify(error, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        return value;
      });

      // Si el JSON es muy largo, retornar el fallback
      if (jsonString.length > 200) {
        return fallback;
      }

      return jsonString || fallback;
    } catch (e) {
      // Si falla JSON.stringify (referencias circulares no detectadas),
      // retornar fallback
      return fallback;
    }
  }

  // Para cualquier otro tipo, retornar fallback
  return fallback;
}

/**
 * Extrae un mensaje de error de una respuesta de API.
 * Maneja tanto el formato legacy ({error: 'string'}) como el
 * formato moderno ({success: false, error: {code, message}}).
 *
 * @param {any} responseData - Los datos de la respuesta de la API
 * @param {string} [fallback='Error en la operación'] - Mensaje por defecto
 * @returns {string} Mensaje de error seguro para mostrar al usuario
 *
 * @example
 * // Formato moderno
 * extractApiError({success: false, error: {code: 'ERR', message: 'Fallo'}})
 * // → 'Fallo'
 *
 * @example
 * // Formato legacy
 * extractApiError({error: 'Error al crear sala'})
 * // → 'Error al crear sala'
 *
 * @example
 * // Formato objeto anidado
 * extractApiError({error: {message: 'No autorizado'}})
 * // → 'No autorizado'
 */
export function extractApiError(responseData, fallback = 'Error en la operación') {
  if (!responseData) {
    return fallback;
  }

  // Si la respuesta tiene un campo 'error', extraer de ahí
  if (responseData.error !== undefined) {
    return getSafeErrorMessage(responseData.error, fallback);
  }

  // Si la respuesta tiene un campo 'message', usarlo
  if (responseData.message && typeof responseData.message === 'string') {
    return responseData.message.trim() || fallback;
  }

  // Si no se pudo extraer nada específico, usar getSafeErrorMessage
  return getSafeErrorMessage(responseData, fallback);
}

/**
 * Valida si un valor es seguro para renderizar en React.
 * Retorna true solo para: string, number, boolean, null, undefined.
 * Retorna false para: objetos, arrays, funciones, symbols.
 *
 * @param {any} value - El valor a validar
 * @returns {boolean} true si es seguro renderizar, false si no
 *
 * @example
 * isSafeToRender('texto') // → true
 * isSafeToRender(123) // → true
 * isSafeToRender({message: 'error'}) // → false
 * isSafeToRender([1, 2, 3]) // → false
 */
export function isSafeToRender(value) {
  const type = typeof value;

  // Tipos seguros para renderizar en React
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return true;
  }

  // null y undefined son seguros
  if (value === null || value === undefined) {
    return true;
  }

  // Todo lo demás (objetos, arrays, funciones, symbols) no es seguro
  return false;
}

/**
 * Convierte cualquier valor a un string seguro para renderizar.
 * Similar a getSafeErrorMessage pero más simple, útil para casos
 * donde no necesariamente es un error.
 *
 * @param {any} value - El valor a convertir
 * @param {string} [fallback=''] - Valor por defecto si la conversión falla
 * @returns {string} String seguro para renderizar
 *
 * @example
 * toSafeString('texto') // → 'texto'
 * toSafeString(123) // → '123'
 * toSafeString({a: 1}) // → '{"a":1}'
 * toSafeString(null) // → ''
 */
export function toSafeString(value, fallback = '') {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    try {
      const seen = new WeakSet();
      return JSON.stringify(value, (key, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) {
            return '[Circular]';
          }
          seen.add(val);
        }
        return val;
      });
    } catch (e) {
      return fallback;
    }
  }

  return fallback;
}

/**
 * Formatea errores de rate limit con información de reintentos.
 * Extrae el campo retryAfter y crea un mensaje user-friendly.
 *
 * @param {any} error - El error de rate limit
 * @returns {string} Mensaje formateado con tiempo de espera
 *
 * @example
 * formatRateLimitError({
 *   code: 'RATE_LIMIT_EXCEEDED',
 *   message: 'Demasiadas solicitudes',
 *   retryAfter: 45
 * })
 * // → 'Demasiadas solicitudes. Intenta de nuevo en 45 segundos'
 *
 * @example
 * formatRateLimitError({
 *   code: 'RATE_LIMIT_EXCEEDED',
 *   message: 'Demasiadas solicitudes',
 *   retryAfter: 120
 * })
 * // → 'Demasiadas solicitudes. Intenta de nuevo en 2 minutos'
 */
export function formatRateLimitError(error) {
  const baseMessage = getSafeErrorMessage(error, 'Demasiadas solicitudes');

  // Intentar extraer retryAfter
  let retryAfter = null;

  if (error && typeof error === 'object') {
    // Puede venir como número (segundos)
    if (typeof error.retryAfter === 'number') {
      retryAfter = error.retryAfter;
    }
    // O como string (parsear)
    else if (typeof error.retryAfter === 'string') {
      const parsed = parseInt(error.retryAfter, 10);
      if (!isNaN(parsed)) {
        retryAfter = parsed;
      }
    }
    // También puede estar en error.error.retryAfter
    else if (error.error && typeof error.error === 'object') {
      if (typeof error.error.retryAfter === 'number') {
        retryAfter = error.error.retryAfter;
      }
    }
  }

  // Si no hay retryAfter, retornar solo el mensaje base
  if (retryAfter === null || retryAfter <= 0) {
    return baseMessage;
  }

  // Formatear el tiempo de espera
  let timeString;
  if (retryAfter < 60) {
    timeString = `${retryAfter} segundo${retryAfter !== 1 ? 's' : ''}`;
  } else if (retryAfter < 3600) {
    const minutes = Math.ceil(retryAfter / 60);
    timeString = `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
  } else {
    const hours = Math.ceil(retryAfter / 3600);
    timeString = `${hours} hora${hours !== 1 ? 's' : ''}`;
  }

  return `${baseMessage}. Intenta de nuevo en ${timeString}`;
}

/**
 * Detecta si un error es de tipo rate limit.
 *
 * @param {any} error - El error a verificar
 * @returns {boolean} true si es un error de rate limit
 *
 * @example
 * isRateLimitError({code: 'RATE_LIMIT_EXCEEDED'}) // → true
 * isRateLimitError({retryAfter: 45}) // → true
 * isRateLimitError({code: 'NETWORK_ERROR'}) // → false
 */
export function isRateLimitError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  // Verificar código de error
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    return true;
  }

  // Verificar código anidado
  if (error.error && typeof error.error === 'object' && error.error.code === 'RATE_LIMIT_EXCEEDED') {
    return true;
  }

  // Verificar presencia de retryAfter
  if (error.retryAfter !== undefined) {
    return true;
  }

  if (error.error && typeof error.error === 'object' && error.error.retryAfter !== undefined) {
    return true;
  }

  return false;
}
