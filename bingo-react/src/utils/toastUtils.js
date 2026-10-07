/**
 * Utilidades Seguras para Toast Notifications
 *
 * Este módulo proporciona wrappers seguros alrededor de react-hot-toast
 * que NUNCA causan crashes por intentar renderizar objetos.
 * Todos los valores se convierten automáticamente a strings antes de mostrarlos.
 *
 * @module toastUtils
 */

import toast from 'react-hot-toast';
import {
  getSafeErrorMessage,
  formatRateLimitError,
  isRateLimitError,
  toSafeString
} from './errorUtils';

/**
 * Muestra un toast de error de forma segura.
 * NUNCA crashea, siempre convierte el error a string antes de mostrarlo.
 *
 * @param {any} error - El error a mostrar (puede ser string, objeto, Error, etc.)
 * @param {string} [fallback='Ha ocurrido un error'] - Mensaje por defecto si no se puede extraer
 * @param {object} [options={}] - Opciones adicionales para react-hot-toast
 * @returns {string} El ID del toast creado
 *
 * @example
 * // Con string simple
 * showError('Error al crear sala')
 *
 * @example
 * // Con objeto de error (SEGURO, no crashea)
 * showError({code: 'ERR', message: 'Error de conexión'})
 * // Muestra: 'Error de conexión'
 *
 * @example
 * // Con fallback custom
 * showError(apiError, 'No se pudo completar la operación')
 *
 * @example
 * // Con opciones de duración
 * showError(error, 'Error', {duration: 5000})
 */
export function showError(error, fallback = 'Ha ocurrido un error', options = {}) {
  // Si es un error de rate limit, usar el formateador especial
  if (isRateLimitError(error)) {
    const message = formatRateLimitError(error);
    return toast.error(message, {
      duration: 5000,
      icon: '⏱️',
      ...options
    });
  }

  // Para errores normales, extraer mensaje seguro
  const safeMessage = getSafeErrorMessage(error, fallback);

  return toast.error(safeMessage, {
    duration: 4000,
    icon: '❌',
    ...options
  });
}

/**
 * Muestra un toast de éxito de forma segura.
 *
 * @param {any} message - El mensaje a mostrar
 * @param {string} [fallback='Operación exitosa'] - Mensaje por defecto
 * @param {object} [options={}] - Opciones adicionales para react-hot-toast
 * @returns {string} El ID del toast creado
 *
 * @example
 * showSuccess('Sala creada exitosamente')
 *
 * @example
 * // Con icono custom
 * showSuccess('¡Bingo!', 'Éxito', {icon: '🎉'})
 */
export function showSuccess(message, fallback = 'Operación exitosa', options = {}) {
  const safeMessage = toSafeString(message, fallback);

  return toast.success(safeMessage, {
    duration: 3000,
    icon: '✅',
    ...options
  });
}

/**
 * Muestra un toast informativo de forma segura.
 *
 * @param {any} message - El mensaje a mostrar
 * @param {string} [fallback='Información'] - Mensaje por defecto
 * @param {object} [options={}] - Opciones adicionales para react-hot-toast
 * @returns {string} El ID del toast creado
 *
 * @example
 * showInfo('El juego comenzará en breve')
 *
 * @example
 * showInfo('Esperando al anfitrión', 'Info', {duration: 2000})
 */
export function showInfo(message, fallback = 'Información', options = {}) {
  const safeMessage = toSafeString(message, fallback);

  return toast(safeMessage, {
    duration: 3000,
    icon: 'ℹ️',
    ...options
  });
}

/**
 * Muestra un toast de advertencia de forma segura.
 *
 * @param {any} message - El mensaje a mostrar
 * @param {string} [fallback='Advertencia'] - Mensaje por defecto
 * @param {object} [options={}] - Opciones adicionales para react-hot-toast
 * @returns {string} El ID del toast creado
 *
 * @example
 * showWarning('Conexión inestable')
 *
 * @example
 * showWarning('Quedan 2 minutos', 'Aviso', {duration: 4000})
 */
export function showWarning(message, fallback = 'Advertencia', options = {}) {
  const safeMessage = toSafeString(message, fallback);

  return toast(safeMessage, {
    duration: 4000,
    icon: '⚠️',
    ...options
  });
}

/**
 * Muestra un toast especial para errores de rate limit con countdown.
 * Incluye información sobre cuándo se puede reintentar.
 *
 * @param {any} error - El error de rate limit
 * @param {object} [options={}] - Opciones adicionales para react-hot-toast
 * @returns {string} El ID del toast creado
 *
 * @example
 * showRateLimitError({
 *   code: 'RATE_LIMIT_EXCEEDED',
 *   message: 'Demasiadas solicitudes',
 *   retryAfter: 45
 * })
 * // Muestra: "Demasiadas solicitudes. Intenta de nuevo en 45 segundos"
 */
export function showRateLimitError(error, options = {}) {
  const message = formatRateLimitError(error);

  return toast.error(message, {
    duration: 6000, // Mayor duración para rate limits
    icon: '⏱️',
    ...options
  });
}

/**
 * Muestra un toast de carga mientras se ejecuta una promesa.
 * Actualiza automáticamente a éxito o error según el resultado.
 *
 * @param {Promise} promise - La promesa a ejecutar
 * @param {object} messages - Mensajes para loading, success, error
 * @param {object} [options={}] - Opciones adicionales
 * @returns {Promise} La promesa original
 *
 * @example
 * await showLoadingToast(
 *   createRoomAPI(),
 *   {
 *     loading: 'Creando sala...',
 *     success: 'Sala creada exitosamente',
 *     error: 'Error al crear sala'
 *   }
 * )
 */
export function showLoadingToast(promise, messages, options = {}) {
  const { loading, success: successMsg, error: errorMsg } = messages;

  return toast.promise(
    promise,
    {
      loading: toSafeString(loading, 'Cargando...'),
      success: (data) => {
        // Si el resultado tiene un mensaje, usarlo
        if (data && typeof data === 'object' && data.message) {
          return toSafeString(data.message, successMsg);
        }
        return toSafeString(successMsg, 'Operación completada');
      },
      error: (err) => {
        // Extraer mensaje de error de forma segura
        return getSafeErrorMessage(err, errorMsg || 'Error en la operación');
      }
    },
    options
  );
}

/**
 * Cierra un toast específico por su ID.
 *
 * @param {string} toastId - El ID del toast a cerrar
 *
 * @example
 * const id = showInfo('Conectando...')
 * // Más tarde...
 * dismissToast(id)
 */
export function dismissToast(toastId) {
  toast.dismiss(toastId);
}

/**
 * Cierra todos los toasts activos.
 *
 * @example
 * dismissAllToasts()
 */
export function dismissAllToasts() {
  toast.dismiss();
}

/**
 * Muestra un toast personalizado con render function seguro.
 * Útil para toasts con botones o contenido interactivo.
 *
 * @param {Function} renderFunction - Función que retorna el JSX del toast
 * @param {object} [options={}] - Opciones adicionales
 * @returns {string} El ID del toast creado
 *
 * @example
 * showCustomToast((t) => (
 *   <div>
 *     <p>¿Estás seguro?</p>
 *     <button onClick={() => {
 *       handleConfirm()
 *       dismissToast(t.id)
 *     }}>
 *       Confirmar
 *     </button>
 *   </div>
 * ))
 */
export function showCustomToast(renderFunction, options = {}) {
  return toast.custom(renderFunction, options);
}

// Re-exportar el objeto toast original para casos avanzados
// NOTA: Usar con cuidado, preferir los wrappers seguros
export { toast as unsafeToast };
