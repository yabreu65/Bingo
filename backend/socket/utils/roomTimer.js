const { GAME_CONSTANTS } = require('../../constants');
const logger = require('../../config/logger');

/**
 * Global storage for room timers
 * Structure: {
 *   [roomCode]: {
 *     intId: intervalId,
 *     watchdogId: watchdogIntervalId,
 *     lastCall: timestamp,
 *     songId: currentSongId,
 *     lastType: lastChallengeType,
 *     lastGameIndex: lastGameTypeIndex
 *   }
 * }
 */
const roomTimers = globalThis.__ROOM_TIMERS__ || (globalThis.__ROOM_TIMERS__ = {});

/**
 * Obtiene los datos del timer de una sala
 * @param {string} roomCode
 * @returns {Object|null}
 */
function getRoomTimer(roomCode) {
  return roomTimers[roomCode] || null;
}

/**
 * Actualiza los datos del timer de una sala
 * @param {string} roomCode
 * @param {Object} data - Datos a actualizar
 */
function updateRoomTimer(roomCode, data) {
  roomTimers[roomCode] = {
    ...(roomTimers[roomCode] || {}),
    ...data
  };
}

/**
 * Elimina el timer de una sala
 * @param {string} roomCode
 */
function deleteRoomTimer(roomCode) {
  delete roomTimers[roomCode];
}

/**
 * Limpia el intervalo principal de una sala
 * @param {string} roomCode
 */
function clearRoomInterval(roomCode) {
  if (roomTimers[roomCode]?.intId) {
    clearInterval(roomTimers[roomCode].intId);
    logger.info(`[${roomCode}] Room interval cleared`);
    roomTimers[roomCode].intId = null;
  }
}

/**
 * Limpia el watchdog de una sala
 * @param {string} roomCode
 */
function clearRoomWatchdog(roomCode) {
  if (roomTimers[roomCode]?.watchdogId) {
    clearInterval(roomTimers[roomCode].watchdogId);
    logger.info(`[${roomCode}] Watchdog cleared`);
    roomTimers[roomCode].watchdogId = null;
  }
}

/**
 * Limpia todos los timers de una sala (intervalo + watchdog)
 * @param {string} roomCode
 */
function clearAllRoomTimers(roomCode) {
  clearRoomInterval(roomCode);
  clearRoomWatchdog(roomCode);
  deleteRoomTimer(roomCode);
  logger.info(`[${roomCode}] All timers cleared`);
}

/**
 * Registra el timestamp de la última llamada de número
 * @param {string} roomCode
 */
function recordNumberCall(roomCode) {
  updateRoomTimer(roomCode, { lastCall: Date.now() });
}

/**
 * Obtiene el siguiente ID de canción en rotación
 * @param {string} roomCode
 * @param {number} maxSongs - Número máximo de canciones (default: 72)
 * @returns {number}
 */
function getNextSongId(roomCode, maxSongs = 72) {
  const currentSongId = roomTimers[roomCode]?.songId || 1;
  const nextSongId = (currentSongId % maxSongs) + 1;
  updateRoomTimer(roomCode, { songId: nextSongId });
  return currentSongId; // Retornar el actual para reproducir ahora
}

/**
 * Obtiene el intervalo configurado para una sala en milisegundos
 * @param {Object} roomConfig - Configuración de la sala
 * @returns {number} - Intervalo en milisegundos
 */
function getIntervalMs(roomConfig) {
  const seconds = roomConfig?.timeBetweenNumbers || GAME_CONSTANTS.DEFAULT_INTERVAL;
  return seconds * 1000;
}

/**
 * Calcula el gap máximo permitido para el watchdog
 * @param {number} intervalSeconds - Intervalo configurado en segundos
 * @returns {number} - Gap máximo en milisegundos
 */
function getMaxGap(intervalSeconds) {
  const bufferSeconds = GAME_CONSTANTS.WATCHDOG_MAX_GAP_BUFFER || 5;
  return (intervalSeconds + bufferSeconds) * 1000;
}

/**
 * Verifica si el intervalo está atrasado (para watchdog)
 * @param {string} roomCode
 * @param {number} maxGapMs - Gap máximo permitido en milisegundos
 * @returns {boolean}
 */
function isIntervalStalled(roomCode, maxGapMs) {
  const lastCall = roomTimers[roomCode]?.lastCall || Date.now();
  const timeSinceLastCall = Date.now() - lastCall;
  return timeSinceLastCall > maxGapMs;
}

/**
 * Inicializa el watchdog para una sala si no existe
 * El watchdog detecta si el intervalo se ha detenido y lo reinicia
 *
 * @param {string} roomCode
 * @param {Function} restartCallback - Función a llamar para reiniciar el intervalo
 * @param {Object} roomConfig - Configuración de la sala
 */
function ensureWatchdog(roomCode, restartCallback, roomConfig) {
  // Si ya hay un watchdog, no crear otro
  if (roomTimers[roomCode]?.watchdogId) {
    return;
  }

  const intervalSeconds = roomConfig?.timeBetweenNumbers || GAME_CONSTANTS.DEFAULT_INTERVAL;
  const maxGapMs = getMaxGap(intervalSeconds);

  const watchdogId = setInterval(() => {
    if (isIntervalStalled(roomCode, maxGapMs)) {
      logger.warn(`[${roomCode}] Watchdog detected stalled interval, restarting...`);
      clearRoomInterval(roomCode);
      if (restartCallback && typeof restartCallback === 'function') {
        restartCallback(roomCode);
      }
    }
  }, GAME_CONSTANTS.WATCHDOG_CHECK_INTERVAL || 1000);

  updateRoomTimer(roomCode, { watchdogId });
  logger.info(`[${roomCode}] Watchdog started`);
}

/**
 * Crea un intervalo para llamar números automáticamente
 *
 * @param {string} roomCode
 * @param {number} intervalMs - Intervalo en milisegundos
 * @param {Function} callback - Función a ejecutar en cada intervalo
 * @returns {NodeJS.Timer} - ID del intervalo
 */
function createRoomInterval(roomCode, intervalMs, callback) {
  // Limpiar intervalo existente si hay uno
  clearRoomInterval(roomCode);

  logger.info(`[${roomCode}] Creating interval: ${intervalMs / 1000}s`);

  // IMPORTANTE: Registrar el timestamp actual como "última llamada" para evitar que el watchdog
  // detecte el intervalo como stalled inmediatamente después de crearlo
  recordNumberCall(roomCode);
  logger.info(`[${roomCode}] Initial timestamp recorded to prevent watchdog false positive`);

  const intervalId = setInterval(async () => {
    try {
      await callback(roomCode);
    } catch (error) {
      logger.error(`[${roomCode}] Error in room interval:`, error);
    }
  }, intervalMs);

  updateRoomTimer(roomCode, { intId: intervalId });
  return intervalId;
}

/**
 * Obtiene estadísticas del timer de una sala
 * @param {string} roomCode
 * @returns {Object}
 */
function getTimerStats(roomCode) {
  const timer = roomTimers[roomCode];
  if (!timer) {
    return {
      exists: false,
      hasInterval: false,
      hasWatchdog: false
    };
  }

  const now = Date.now();
  const lastCall = timer.lastCall || now;
  const timeSinceLastCall = now - lastCall;

  return {
    exists: true,
    hasInterval: !!timer.intId,
    hasWatchdog: !!timer.watchdogId,
    lastCall: timer.lastCall,
    timeSinceLastCall,
    currentSongId: timer.songId,
    lastChallengeType: timer.lastType
  };
}

/**
 * Obtiene todos los códigos de salas que tienen timers activos
 * @returns {Array<string>}
 */
function getActiveRoomCodes() {
  return Object.keys(roomTimers);
}

/**
 * Limpia todos los timers de todas las salas
 * Útil para shutdown del servidor
 */
function clearAllTimers() {
  const roomCodes = getActiveRoomCodes();
  roomCodes.forEach(roomCode => {
    clearAllRoomTimers(roomCode);
  });
  logger.info(`Cleared timers for ${roomCodes.length} rooms`);
}

module.exports = {
  // State management
  getRoomTimer,
  updateRoomTimer,
  deleteRoomTimer,

  // Timer operations
  clearRoomInterval,
  clearRoomWatchdog,
  clearAllRoomTimers,
  clearAllTimers,

  // Number call tracking
  recordNumberCall,

  // Music management
  getNextSongId,

  // Configuration helpers
  getIntervalMs,
  getMaxGap,

  // Watchdog
  isIntervalStalled,
  ensureWatchdog,

  // Interval creation
  createRoomInterval,

  // Stats and monitoring
  getTimerStats,
  getActiveRoomCodes,

  // Direct access to timers (for backward compatibility)
  roomTimers
};
