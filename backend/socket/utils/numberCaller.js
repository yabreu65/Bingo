const { GAME_CONSTANTS } = require('../../constants');
const logger = require('../../config/logger');

/**
 * Selecciona un número aleatorio de los disponibles
 * @param {Array} availableNumbers - Lista de números disponibles
 * @returns {Object} - { number: number, index: index }
 */
function selectRandomNumber(availableNumbers) {
  if (!availableNumbers || availableNumbers.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * availableNumbers.length);
  const selectedNumber = availableNumbers[randomIndex];

  return {
    number: selectedNumber,
    index: randomIndex
  };
}

/**
 * Actualiza el estado del juego después de llamar un número
 * @param {Game} game - Documento de Game de Mongoose
 * @param {number} calledNumber - El número que fue llamado
 * @param {number} indexToRemove - Índice del número en availableNumbers
 * @returns {Game} - Game actualizado
 */
function updateGameAfterNumberCall(game, calledNumber, indexToRemove) {
  // Remover el número de availableNumbers
  game.availableNumbers = game.availableNumbers.filter((_, k) => k !== indexToRemove);

  // Agregar a calledNumbers
  game.calledNumbers.push(calledNumber);

  // Actualizar el número actual
  game.currentNumber = calledNumber;

  // Incrementar contador de números desde el último reto
  game.numbersSinceChallenge = (game.numbersSinceChallenge || 0) + 1;

  return game;
}

/**
 * Verifica si hay números disponibles
 * @param {Game} game - Documento de Game
 * @returns {boolean}
 */
function hasAvailableNumbers(game) {
  return !!(game &&
         game.availableNumbers &&
         Array.isArray(game.availableNumbers) &&
         game.availableNumbers.length > 0);
}

/**
 * Crea el objeto de datos para emitir al cliente cuando se llama un número
 * @param {number} number - El número llamado
 * @param {Array} calledNumbers - Lista de todos los números llamados
 * @returns {Object}
 */
function createNumberCalledData(number, calledNumbers) {
  return {
    number,
    calledNumbers
  };
}

/**
 * Verifica si se debe disparar un reto basado en la frecuencia
 * @param {number} numbersSinceChallenge - Números desde el último reto
 * @param {number} challengeFrequency - Frecuencia configurada (default 3)
 * @returns {boolean}
 */
function shouldTriggerChallenge(numbersSinceChallenge, challengeFrequency) {
  const freq = challengeFrequency || GAME_CONSTANTS.CHALLENGE_FREQUENCY;
  return (numbersSinceChallenge || 0) >= freq;
}

/**
 * Genera un array de números del 1 al MAX_NUMBER para iniciar un nuevo juego
 * @returns {Array<number>}
 */
function generateInitialNumbers() {
  const numbers = [];
  for (let i = GAME_CONSTANTS.MIN_NUMBER; i <= GAME_CONSTANTS.MAX_NUMBER; i++) {
    numbers.push(i);
  }
  return numbers;
}

/**
 * Valida que un número esté dentro del rango válido
 * @param {number} number
 * @returns {boolean}
 */
function isValidNumber(number) {
  return typeof number === 'number' &&
         number >= GAME_CONSTANTS.MIN_NUMBER &&
         number <= GAME_CONSTANTS.MAX_NUMBER;
}

/**
 * Obtiene las estadísticas del juego actual
 * @param {Game} game
 * @returns {Object}
 */
function getGameStats(game) {
  return {
    totalNumbers: GAME_CONSTANTS.MAX_NUMBER,
    calledCount: game.calledNumbers ? game.calledNumbers.length : 0,
    remainingCount: game.availableNumbers ? game.availableNumbers.length : 0,
    currentNumber: game.currentNumber,
    numbersSinceChallenge: game.numbersSinceChallenge || 0
  };
}

/**
 * Verifica si el juego ha terminado (no hay más números)
 * @param {Game} game
 * @returns {boolean}
 */
function isGameFinished(game) {
  return !hasAvailableNumbers(game);
}

/**
 * Lógica completa para llamar el siguiente número
 * Incluye selección, actualización y logging
 *
 * @param {Game} game - Documento de Game
 * @param {string} roomCode - Código de la sala
 * @returns {Object|null} - { number, calledNumbers, shouldChallenge } o null si no hay números
 */
async function callNextNumber(game, roomCode) {
  // Verificar que haya números disponibles
  if (!hasAvailableNumbers(game)) {
    logger.warn(`[${roomCode}] No more numbers available to call`);
    return null;
  }

  // Seleccionar número aleatorio
  const selected = selectRandomNumber(game.availableNumbers);
  if (!selected) {
    return null;
  }

  const { number, index } = selected;

  // Actualizar el juego
  updateGameAfterNumberCall(game, number, index);

  // Guardar el juego
  await game.save();

  logger.logGameEvent(roomCode, `Number called: ${number}`, {
    numbersSinceChallenge: game.numbersSinceChallenge,
    remainingNumbers: game.availableNumbers.length,
    totalCalled: game.calledNumbers.length
  });

  // Retornar datos para emitir
  return {
    number,
    calledNumbers: game.calledNumbers,
    shouldChallenge: shouldTriggerChallenge(
      game.numbersSinceChallenge,
      GAME_CONSTANTS.CHALLENGE_FREQUENCY
    ),
    stats: getGameStats(game)
  };
}

module.exports = {
  selectRandomNumber,
  updateGameAfterNumberCall,
  hasAvailableNumbers,
  createNumberCalledData,
  shouldTriggerChallenge,
  generateInitialNumbers,
  isValidNumber,
  getGameStats,
  isGameFinished,
  callNextNumber
};
