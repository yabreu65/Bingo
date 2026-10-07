const logger = require('../config/logger');
const { GAME_CONSTANTS, CHALLENGE_POOLS } = require('../constants');
const {
  getNextChallengeType,
  selectRandomChallenge,
  selectEligiblePlayers,
  selectRandomPlayer,
  createChallengeData
} = require('../socket/utils/challengeSelector');

/**
 * Prepara un challenge completo para un juego
 * @param {Array} players - Lista de jugadores en la sala
 * @param {Array} usedPlayers - IDs de jugadores que ya participaron
 * @param {string} lastChallengeType - Último tipo de challenge usado
 * @param {Object} roomConfig - Configuración de la sala
 * @returns {Object|null} - Datos del challenge o null si no hay jugadores elegibles
 */
function prepareChallengeForGame(players, usedPlayers, lastChallengeType, roomConfig = {}) {
  try {
    // Seleccionar jugadores elegibles
    const eligiblePlayers = selectEligiblePlayers(players, usedPlayers);

    logger.info(`Eligible players for challenge: ${eligiblePlayers.length}`);

    // Si no hay jugadores elegibles, retornar null
    if (eligiblePlayers.length === 0) {
      logger.info('No eligible players for challenge');
      return null;
    }

    // Seleccionar jugador aleatorio
    const selectedPlayer = selectRandomPlayer(eligiblePlayers);

    if (!selectedPlayer) {
      logger.warn('Failed to select player for challenge');
      return null;
    }

    // Obtener el siguiente tipo de challenge
    const challengeType = getNextChallengeType(lastChallengeType);

    logger.info(`Next challenge type: ${challengeType}`);

    // Seleccionar un challenge del pool
    const challenge = selectRandomChallenge(challengeType);

    if (!challenge) {
      logger.warn(`No challenge available for type: ${challengeType}`);
      return null;
    }

    // Crear los datos del challenge
    const challengeData = createChallengeData(challengeType, selectedPlayer, challenge);

    return {
      ...challengeData,
      selectedPlayerId: selectedPlayer._id,
      challengeType
    };
  } catch (error) {
    logger.error('Error preparing challenge for game:', error);
    return null;
  }
}

/**
 * Valida una respuesta de challenge de trivia
 * @param {string} answer - Respuesta del jugador
 * @param {string} correctAnswer - Respuesta correcta (opcional)
 * @returns {Object}
 */
function validateTriviaAnswer(answer, correctAnswer = null) {
  // Por ahora, todas las respuestas de trivia son validadas por el host
  // En el futuro se puede agregar validación automática
  return {
    isValid: true,
    answer,
    needsManualValidation: true
  };
}

/**
 * Obtiene las estadísticas de challenges para un juego
 * @param {Object} game - Documento del juego
 * @returns {Object}
 */
function getChallengeStats(game) {
  return {
    hasActiveChallenge: !!game.activeChallenge,
    numbersSinceChallenge: game.numbersSinceChallenge || 0,
    usedPlayersCount: game.usedPlayers ? game.usedPlayers.length : 0,
    activeChallenge: game.activeChallenge
      ? {
          type: game.activeChallenge.type,
          playerId: game.activeChallenge.player,
          text: game.activeChallenge.text,
          startTime: game.activeChallenge.startTime
        }
      : null
  };
}

/**
 * Calcula el tiempo restante de un challenge
 * @param {Date} startTime - Tiempo de inicio del challenge
 * @param {number} duration - Duración en segundos (default: 30)
 * @returns {number} - Segundos restantes (0 si ya expiró)
 */
function calculateRemainingTime(startTime, duration = GAME_CONSTANTS.CHALLENGE_DURATION) {
  if (!startTime) return 0;

  const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
  const remaining = duration - elapsed;

  return Math.max(0, remaining);
}

/**
 * Verifica si un challenge ha expirado
 * @param {Date} startTime
 * @param {number} duration
 * @returns {boolean}
 */
function isChallengeExpired(startTime, duration = GAME_CONSTANTS.CHALLENGE_DURATION) {
  return calculateRemainingTime(startTime, duration) === 0;
}

/**
 * Obtiene los tipos de challenges habilitados según la configuración
 * @param {Object} roomConfig
 * @returns {Array<string>}
 */
function getEnabledChallengeTypes(roomConfig = {}) {
  const enabledTypes = roomConfig.enabledChallengeTypes || {};
  const allTypes = Object.values(GAME_CONSTANTS.CHALLENGE_TYPES);

  // Si no hay configuración, todos están habilitados
  if (Object.keys(enabledTypes).length === 0) {
    return allTypes;
  }

  // Filtrar solo los habilitados
  return allTypes.filter(type => enabledTypes[type] !== false);
}

/**
 * Verifica si un tipo de challenge está disponible
 * @param {string} challengeType
 * @returns {boolean}
 */
function isChallengeTypeAvailable(challengeType) {
  const pool = CHALLENGE_POOLS[challengeType];
  return pool && Array.isArray(pool) && pool.length > 0;
}

/**
 * Obtiene el número de challenges disponibles por tipo
 * @returns {Object}
 */
function getAvailableChallengesCounts() {
  const counts = {};

  Object.keys(CHALLENGE_POOLS).forEach(type => {
    const pool = CHALLENGE_POOLS[type];
    counts[type] = pool ? pool.length : 0;
  });

  return counts;
}

/**
 * Calcula los puntos a otorgar por completar un challenge
 * @param {string} challengeType
 * @param {boolean} completed
 * @returns {number}
 */
function calculateChallengePoints(challengeType, completed) {
  if (!completed) return 0;

  if (challengeType === GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA) {
    return GAME_CONSTANTS.POINTS.TRIVIA_CORRECT;
  }

  if (challengeType === GAME_CONSTANTS.CHALLENGE_TYPES.KARAOKE) {
    return GAME_CONSTANTS.POINTS.KARAOKE_COMPLETED;
  }

  return GAME_CONSTANTS.POINTS.CHALLENGE_COMPLETED;
}

/**
 * Formatea los datos de un challenge para enviar al cliente
 * @param {Object} challenge
 * @returns {Object}
 */
function formatChallengeForClient(challenge) {
  return {
    type: challenge.type,
    player: {
      id: challenge.player?.id || challenge.player,
      name: challenge.player?.name
    },
    text: challenge.text,
    deezerId: challenge.deezerId,
    duration: challenge.duration || GAME_CONSTANTS.CHALLENGE_DURATION,
    startTime: challenge.startTime
  };
}

module.exports = {
  prepareChallengeForGame,
  validateTriviaAnswer,
  getChallengeStats,
  calculateRemainingTime,
  isChallengeExpired,
  getEnabledChallengeTypes,
  isChallengeTypeAvailable,
  getAvailableChallengesCounts,
  calculateChallengePoints,
  formatChallengeForClient
};
