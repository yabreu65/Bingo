/**
 * Cliente HTTP con Retry Automático y Exponential Backoff
 *
 * Este módulo proporciona una capa sobre fetch() con reintentos automáticos,
 * manejo de errores robusto, y extracción segura de respuestas de error.
 *
 * @module httpClient
 */

import { extractApiError, getSafeErrorMessage } from './errorUtils';
import { API_URL } from '../config/api';

/**
 * Configuración por defecto para reintentos
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,        // Número máximo de reintentos
  baseDelay: 1000,      // Delay base en ms (1 segundo)
  maxDelay: 10000,      // Delay máximo en ms (10 segundos)
  jitterFactor: 0.2,    // Factor de jitter (±20%)
};

/**
 * Códigos HTTP que son reintentables (errores temporales)
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests (Rate Limit)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Códigos HTTP que NO son reintentables (errores permanentes)
 */
const NON_RETRYABLE_STATUS_CODES = new Set([
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  409, // Conflict
  422, // Unprocessable Entity
]);

/**
 * Calcula el delay para el próximo reintento usando exponential backoff con jitter.
 * Formula: baseDelay * (2 ^ attempt) * (1 ± jitter)
 *
 * @param {number} attempt - Número de intento (0-indexed)
 * @param {number} baseDelay - Delay base en ms
 * @param {number} maxDelay - Delay máximo permitido en ms
 * @param {number} jitterFactor - Factor de jitter (0-1)
 * @returns {number} Delay en ms para el próximo reintento
 *
 * @example
 * calculateBackoff(0, 1000, 10000, 0.2) // → ~1000ms ± 20%
 * calculateBackoff(1, 1000, 10000, 0.2) // → ~2000ms ± 20%
 * calculateBackoff(2, 1000, 10000, 0.2) // → ~4000ms ± 20%
 */
function calculateBackoff(attempt, baseDelay, maxDelay, jitterFactor) {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);

  // Aplicar límite máximo
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Agregar jitter (variación aleatoria) para evitar thundering herd
  const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);
  const finalDelay = cappedDelay + jitter;

  return Math.max(0, Math.floor(finalDelay));
}

/**
 * Determina si un error HTTP es reintentable.
 *
 * @param {number|null} statusCode - Código de estado HTTP
 * @param {Error|null} error - Error de red si lo hay
 * @returns {boolean} true si el error es reintentable
 *
 * @example
 * isRetryableError(503, null) // → true (Service Unavailable)
 * isRetryableError(404, null) // → false (Not Found - error permanente)
 * isRetryableError(null, new TypeError('Failed to fetch')) // → true (error de red)
 */
function isRetryableError(statusCode, error) {
  // Errores de red son reintentables
  if (error && (
    error.name === 'TypeError' ||
    error.message.includes('fetch') ||
    error.message.includes('network') ||
    error.message.includes('Failed to fetch')
  )) {
    return true;
  }

  // Si no hay código de estado, no reintentar
  if (statusCode === null || statusCode === undefined) {
    return false;
  }

  // Verificar códigos HTTP reintentables
  return RETRYABLE_STATUS_CODES.has(statusCode);
}

/**
 * Duerme durante un tiempo especificado.
 *
 * @param {number} ms - Tiempo en milisegundos
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Realiza una petición fetch con reintentos automáticos y manejo de errores.
 *
 * @param {string} url - URL a la que hacer fetch (puede ser relativa o absoluta)
 * @param {object} [options={}] - Opciones de fetch (method, headers, body, etc.)
 * @param {object} [retryConfig={}] - Configuración de reintentos
 * @returns {Promise<{success: boolean, data: any, error: string|null, statusCode: number|null}>}
 *
 * @example
 * // Petición GET simple con retry automático
 * const result = await fetchWithRetry('/api/rooms/ABC123');
 * if (result.success) {
 *   console.log('Datos:', result.data);
 * } else {
 *   console.error('Error:', result.error);
 * }
 *
 * @example
 * // Petición POST con configuración custom de retry
 * const result = await fetchWithRetry('/api/rooms/create', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ roomName: 'Mi Sala' })
 * }, {
 *   maxRetries: 5,
 *   baseDelay: 2000
 * });
 */
export async function fetchWithRetry(url, options = {}, retryConfig = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  const { maxRetries, baseDelay, maxDelay, jitterFactor } = config;

  // Construir URL completa si es relativa
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;

  // Preparar headers por defecto
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const fetchOptions = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  let lastError = null;
  let lastStatusCode = null;

  // Intentar la petición hasta maxRetries + 1 veces (intento inicial + reintentos)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Log del intento (solo en desarrollo)
      if (import.meta.env.DEV && attempt > 0) {
        console.log(`🔄 Reintento ${attempt}/${maxRetries} para ${url}`);
      }

      // Realizar la petición
      const response = await fetch(fullUrl, fetchOptions);
      lastStatusCode = response.status;

      // Intentar parsear la respuesta JSON
      let data;
      try {
        data = await response.json();
      } catch {
        // Si no es JSON válido, usar texto
        const text = await response.text();
        data = { message: text };
      }

      // Verificar si la respuesta fue exitosa
      if (response.ok) {
        return {
          success: true,
          data: data,
          error: null,
          statusCode: response.status,
        };
      }

      // Respuesta no exitosa (4xx, 5xx)
      // Verificar si es reintentable
      if (!isRetryableError(response.status, null)) {
        // Error no reintentable, retornar inmediatamente
        return {
          success: false,
          data: null,
          error: extractApiError(data, 'Error en la operación'),
          statusCode: response.status,
        };
      }

      // Error reintentable, guardar y continuar al siguiente intento
      lastError = new Error(extractApiError(data, 'Error del servidor'));
      lastStatusCode = response.status;

      // Si quedan reintentos, esperar antes del siguiente intento
      if (attempt < maxRetries) {
        const delay = calculateBackoff(attempt, baseDelay, maxDelay, jitterFactor);
        if (import.meta.env.DEV) {
          console.log(`⏳ Esperando ${delay}ms antes del reintento...`);
        }
        await sleep(delay);
      }

    } catch (error) {
      // Error de red o error al hacer fetch
      lastError = error;
      lastStatusCode = null;

      // Verificar si es reintentable
      if (!isRetryableError(null, error)) {
        // Error no reintentable, retornar inmediatamente
        return {
          success: false,
          data: null,
          error: getSafeErrorMessage(error, 'Error de conexión'),
          statusCode: null,
        };
      }

      // Error reintentable, continuar al siguiente intento
      if (attempt < maxRetries) {
        const delay = calculateBackoff(attempt, baseDelay, maxDelay, jitterFactor);
        if (import.meta.env.DEV) {
          console.log(`⏳ Error de red, esperando ${delay}ms antes del reintento...`);
        }
        await sleep(delay);
      }
    }
  }

  // Todos los reintentos fallaron
  return {
    success: false,
    data: null,
    error: getSafeErrorMessage(lastError, 'Error después de múltiples reintentos'),
    statusCode: lastStatusCode,
  };
}

/**
 * Helper para peticiones GET con retry automático.
 *
 * @param {string} url - URL del endpoint
 * @param {object} [retryConfig={}] - Configuración de reintentos
 * @returns {Promise<{success: boolean, data: any, error: string|null}>}
 *
 * @example
 * const {success, data, error} = await httpGet('/api/rooms/ABC123');
 */
export async function httpGet(url, retryConfig = {}) {
  return fetchWithRetry(url, { method: 'GET' }, retryConfig);
}

/**
 * Helper para peticiones POST con retry automático.
 *
 * @param {string} url - URL del endpoint
 * @param {object} body - Cuerpo de la petición (se convertirá a JSON)
 * @param {object} [retryConfig={}] - Configuración de reintentos
 * @returns {Promise<{success: boolean, data: any, error: string|null}>}
 *
 * @example
 * const {success, data, error} = await httpPost('/api/rooms/create', {
 *   roomName: 'Mi Sala',
 *   hostName: 'Juan'
 * });
 */
export async function httpPost(url, body, retryConfig = {}) {
  return fetchWithRetry(
    url,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    retryConfig
  );
}

/**
 * Helper para peticiones PATCH con retry automático.
 *
 * @param {string} url - URL del endpoint
 * @param {object} body - Cuerpo de la petición (se convertirá a JSON)
 * @param {object} [retryConfig={}] - Configuración de reintentos
 * @returns {Promise<{success: boolean, data: any, error: string|null}>}
 *
 * @example
 * const {success, data, error} = await httpPatch('/api/rooms/ABC123/config', {
 *   config: { timeBetweenNumbers: 10 }
 * });
 */
export async function httpPatch(url, body, retryConfig = {}) {
  return fetchWithRetry(
    url,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    retryConfig
  );
}

/**
 * Helper para peticiones DELETE con retry automático.
 *
 * @param {string} url - URL del endpoint
 * @param {object} [retryConfig={}] - Configuración de reintentos
 * @returns {Promise<{success: boolean, data: any, error: string|null}>}
 *
 * @example
 * const {success, data, error} = await httpDelete('/api/rooms/ABC123');
 */
export async function httpDelete(url, retryConfig = {}) {
  return fetchWithRetry(url, { method: 'DELETE' }, retryConfig);
}

/**
 * Helper para peticiones PUT con retry automático.
 *
 * @param {string} url - URL del endpoint
 * @param {object} body - Cuerpo de la petición (se convertirá a JSON)
 * @param {object} [retryConfig={}] - Configuración de reintentos
 * @returns {Promise<{success: boolean, data: any, error: string|null}>}
 *
 * @example
 * const {success, data, error} = await httpPut('/api/players/123', {
 *   name: 'Nuevo Nombre'
 * });
 */
export async function httpPut(url, body, retryConfig = {}) {
  return fetchWithRetry(
    url,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
    retryConfig
  );
}

/**
 * Configuración de retry para diferentes escenarios
 */
export const RetryProfiles = {
  /**
   * Sin reintentos - falla inmediatamente
   */
  NONE: { maxRetries: 0 },

  /**
   * Reintentos rápidos para operaciones críticas
   */
  FAST: { maxRetries: 2, baseDelay: 500, maxDelay: 2000 },

  /**
   * Reintentos estándar (por defecto)
   */
  STANDARD: DEFAULT_RETRY_CONFIG,

  /**
   * Reintentos agresivos para operaciones importantes
   */
  AGGRESSIVE: { maxRetries: 5, baseDelay: 1000, maxDelay: 15000 },

  /**
   * Reintentos para rate limiting (delays más largos)
   */
  RATE_LIMIT: { maxRetries: 3, baseDelay: 2000, maxDelay: 30000 },
};
