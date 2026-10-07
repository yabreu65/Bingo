const Game = require('../models/Game');
const Room = require('../models/Room');
const logger = require('../config/logger');
const { GAME_CONSTANTS, ERROR_MESSAGES } = require('../constants');
const { generateInitialNumbers, getGameStats, isGameFinished } = require('../socket/utils/numberCaller');

/**
 * Crea un nuevo juego para una sala
 * @param {string} roomId - ID de la sala
 * @returns {Promise<Game>}
 */
async function createGame(roomId) {
  try {
    const game = new Game({
      room: roomId,
      startTime: new Date(),
      availableNumbers: generateInitialNumbers(),
      calledNumbers: [],
      currentNumber: null,
      numbersSinceChallenge: 0,
      usedPlayers: []
    });

    await game.save();

    logger.info(`Game created with ID: ${game._id} for room: ${roomId}`);

    return game;
  } catch (error) {
    logger.error('Error creating game:', error);
    throw error;
  }
}

/**
 * Busca un juego por ID
 * @param {string} gameId
 * @returns {Promise<Game|null>}
 */
async function findGameById(gameId) {
  try {
    return await Game.findById(gameId);
  } catch (error) {
    logger.error(`Error finding game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Obtiene el juego actual de una sala
 * @param {string} roomCode
 * @returns {Promise<Game|null>}
 */
async function getCurrentGame(roomCode) {
  try {
    const room = await Room.findOne({ code: roomCode });

    if (!room || !room.currentGame) {
      return null;
    }

    return await findGameById(room.currentGame);
  } catch (error) {
    logger.error(`Error getting current game for room ${roomCode}:`, error);
    throw error;
  }
}

/**
 * Reinicia un juego existente
 * @param {string} gameId
 * @returns {Promise<Game>}
 */
async function resetGame(gameId) {
  try {
    const game = await findGameById(gameId);

    if (!game) {
      throw new Error(ERROR_MESSAGES.GAME_NOT_FOUND);
    }

    game.calledNumbers = [];
    game.currentNumber = null;
    game.availableNumbers = generateInitialNumbers();
    game.numbersSinceChallenge = 0;
    game.activeChallenge = null;
    game.usedPlayers = [];

    await game.save();

    logger.info(`Game ${gameId} reset`);

    return game;
  } catch (error) {
    logger.error(`Error resetting game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Actualiza el número actual del juego
 * @param {string} gameId
 * @param {number} number
 * @returns {Promise<Game>}
 */
async function updateCurrentNumber(gameId, number) {
  try {
    const game = await findGameById(gameId);

    if (!game) {
      throw new Error(ERROR_MESSAGES.GAME_NOT_FOUND);
    }

    game.currentNumber = number;
    game.calledNumbers.push(number);
    game.availableNumbers = game.availableNumbers.filter(n => n !== number);
    game.numbersSinceChallenge = (game.numbersSinceChallenge || 0) + 1;

    await game.save();

    return game;
  } catch (error) {
    logger.error(`Error updating current number for game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Establece un challenge activo en el juego
 * @param {string} gameId
 * @param {Object} challengeData
 * @returns {Promise<Game>}
 */
async function setActiveChallenge(gameId, challengeData) {
  try {
    const game = await findGameById(gameId);

    if (!game) {
      throw new Error(ERROR_MESSAGES.GAME_NOT_FOUND);
    }

    game.activeChallenge = {
      ...challengeData,
      startTime: new Date()
    };
    game.numbersSinceChallenge = 0;

    await game.save();

    logger.info(`Challenge set for game ${gameId}`, { type: challengeData.type });

    return game;
  } catch (error) {
    logger.error(`Error setting active challenge for game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Limpia el challenge activo del juego
 * @param {string} gameId
 * @returns {Promise<Game>}
 */
async function clearActiveChallenge(gameId) {
  try {
    const game = await findGameById(gameId);

    if (!game) {
      throw new Error(ERROR_MESSAGES.GAME_NOT_FOUND);
    }

    game.activeChallenge = null;
    await game.save();

    logger.info(`Challenge cleared for game ${gameId}`);

    return game;
  } catch (error) {
    logger.error(`Error clearing active challenge for game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Agrega un jugador a la lista de usados en challenges
 * @param {string} gameId
 * @param {string} playerId
 * @returns {Promise<Game>}
 */
async function addUsedPlayer(gameId, playerId) {
  try {
    const game = await findGameById(gameId);

    if (!game) {
      throw new Error(ERROR_MESSAGES.GAME_NOT_FOUND);
    }

    if (!game.usedPlayers) {
      game.usedPlayers = [];
    }

    if (!game.usedPlayers.includes(playerId)) {
      game.usedPlayers.push(playerId);
      await game.save();
    }

    return game;
  } catch (error) {
    logger.error(`Error adding used player for game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Reinicia la lista de jugadores usados en challenges
 * @param {string} gameId
 * @returns {Promise<Game>}
 */
async function resetUsedPlayers(gameId) {
  try {
    const game = await findGameById(gameId);

    if (!game) {
      throw new Error(ERROR_MESSAGES.GAME_NOT_FOUND);
    }

    game.usedPlayers = [];
    await game.save();

    logger.info(`Used players reset for game ${gameId}`);

    return game;
  } catch (error) {
    logger.error(`Error resetting used players for game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Verifica si un número ya fue cantado
 * @param {string} gameId
 * @param {number} number
 * @returns {Promise<boolean>}
 */
async function isNumberCalled(gameId, number) {
  try {
    const game = await findGameById(gameId);

    if (!game) {
      return false;
    }

    return game.calledNumbers.includes(number);
  } catch (error) {
    logger.error(`Error checking if number is called for game ${gameId}:`, error);
    return false;
  }
}

/**
 * Obtiene las estadísticas completas de un juego
 * @param {string} gameId
 * @returns {Promise<Object>}
 */
async function getFullGameStats(gameId) {
  try {
    const game = await findGameById(gameId);

    if (!game) {
      throw new Error(ERROR_MESSAGES.GAME_NOT_FOUND);
    }

    const stats = getGameStats(game);

    return {
      ...stats,
      gameId: game._id,
      roomId: game.room,
      startTime: game.startTime,
      endTime: game.endTime,
      isFinished: isGameFinished(game),
      hasActiveChallenge: !!game.activeChallenge,
      activeChallenge: game.activeChallenge,
      usedPlayersCount: game.usedPlayers ? game.usedPlayers.length : 0
    };
  } catch (error) {
    logger.error(`Error getting game stats for ${gameId}:`, error);
    throw error;
  }
}

/**
 * Finaliza un juego
 * @param {string} gameId
 * @param {Object} winnerData - Información del ganador
 * @returns {Promise<Game>}
 */
async function finishGame(gameId, winnerData = null) {
  try {
    const game = await findGameById(gameId);

    if (!game) {
      throw new Error(ERROR_MESSAGES.GAME_NOT_FOUND);
    }

    game.endTime = new Date();
    game.winner = winnerData;

    await game.save();

    logger.info(`Game ${gameId} finished`, { winner: winnerData });

    return game;
  } catch (error) {
    logger.error(`Error finishing game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Elimina un juego
 * @param {string} gameId
 * @returns {Promise<boolean>}
 */
async function deleteGame(gameId) {
  try {
    await Game.findByIdAndDelete(gameId);
    logger.info(`Game ${gameId} deleted`);
    return true;
  } catch (error) {
    logger.error(`Error deleting game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Verifica si el juego debe disparar un challenge
 * @param {string} gameId
 * @param {number} challengeFrequency
 * @returns {Promise<boolean>}
 */
async function shouldTriggerChallenge(gameId, challengeFrequency) {
  try {
    const game = await findGameById(gameId);

    if (!game) {
      return false;
    }

    const freq = challengeFrequency || GAME_CONSTANTS.CHALLENGE_FREQUENCY;
    return (game.numbersSinceChallenge || 0) >= freq;
  } catch (error) {
    logger.error(`Error checking if should trigger challenge for game ${gameId}:`, error);
    return false;
  }
}

module.exports = {
  createGame,
  findGameById,
  getCurrentGame,
  resetGame,
  updateCurrentNumber,
  setActiveChallenge,
  clearActiveChallenge,
  addUsedPlayer,
  resetUsedPlayers,
  isNumberCalled,
  getFullGameStats,
  finishGame,
  deleteGame,
  shouldTriggerChallenge
};
