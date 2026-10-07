const Player = require('../models/Player');
const logger = require('../config/logger');
const { GAME_CONSTANTS, ERROR_MESSAGES } = require('../constants');

/**
 * Busca un jugador por ID
 * @param {string} playerId
 * @returns {Promise<Player|null>}
 */
async function findPlayerById(playerId) {
  try {
    return await Player.findById(playerId);
  } catch (error) {
    logger.error(`Error finding player ${playerId}:`, error);
    throw error;
  }
}

/**
 * Actualiza el estado de conexión de un jugador
 * @param {string} playerId
 * @param {boolean} isConnected
 * @param {string} socketId - ID del socket (opcional)
 * @returns {Promise<Player>}
 */
async function updatePlayerConnection(playerId, isConnected, socketId = null) {
  try {
    const updateData = { isConnected };

    if (socketId !== null) {
      updateData.socketId = socketId;
    }

    const player = await Player.findByIdAndUpdate(
      playerId,
      updateData,
      { new: true }
    );

    if (!player) {
      throw new Error(ERROR_MESSAGES.PLAYER_NOT_FOUND);
    }

    logger.info(`Player ${playerId} connection updated`, {
      isConnected,
      socketId
    });

    return player;
  } catch (error) {
    logger.error(`Error updating player connection ${playerId}:`, error);
    throw error;
  }
}

/**
 * Marca una celda del cartón de un jugador
 * @param {string} playerId
 * @param {number} row
 * @param {number} col
 * @returns {Promise<Player>}
 */
async function markCell(playerId, row, col) {
  try {
    const player = await findPlayerById(playerId);

    if (!player) {
      throw new Error(ERROR_MESSAGES.PLAYER_NOT_FOUND);
    }

    // Verificar que la celda es válida
    const cellValue = player.bingoCard?.matrix?.[row]?.[col];

    if (!cellValue || cellValue === 'BINGO') {
      throw new Error('Celda inválida');
    }

    // Verificar si ya está marcada
    const marked = Array.isArray(player.bingoCard.markedCells)
      ? player.bingoCard.markedCells
      : [];

    const alreadyMarked = marked.some((m) => {
      if (!m) return false;
      if (Array.isArray(m)) return m[0] === row && m[1] === col;
      return m.row === row && m.col === col;
    });

    if (alreadyMarked) {
      return player; // Ya está marcada, no hacer nada
    }

    // Marcar la celda
    marked.push({ row, col });
    player.bingoCard.markedCells = marked;
    player.stats.numbersMarked = (player.stats.numbersMarked || 0) + 1;

    await player.save();

    logger.info(`Cell marked for player ${playerId}`, { row, col, cellValue });

    return player;
  } catch (error) {
    logger.error(`Error marking cell for player ${playerId}:`, error);
    throw error;
  }
}

/**
 * Actualiza los puntos de un jugador
 * @param {string} playerId
 * @param {number} points - Puntos a agregar (puede ser negativo)
 * @returns {Promise<Player>}
 */
async function updatePlayerPoints(playerId, points) {
  try {
    const player = await findPlayerById(playerId);

    if (!player) {
      throw new Error(ERROR_MESSAGES.PLAYER_NOT_FOUND);
    }

    player.stats.points = (player.stats.points || 0) + points;

    // No permitir puntos negativos
    if (player.stats.points < 0) {
      player.stats.points = 0;
    }

    await player.save();

    logger.info(`Points updated for player ${playerId}`, {
      pointsAdded: points,
      newTotal: player.stats.points
    });

    return player;
  } catch (error) {
    logger.error(`Error updating points for player ${playerId}:`, error);
    throw error;
  }
}

/**
 * Incrementa las estadísticas de un jugador
 * @param {string} playerId
 * @param {Object} stats - Objeto con las estadísticas a incrementar
 * @returns {Promise<Player>}
 */
async function incrementPlayerStats(playerId, stats) {
  try {
    const player = await findPlayerById(playerId);

    if (!player) {
      throw new Error(ERROR_MESSAGES.PLAYER_NOT_FOUND);
    }

    // Incrementar cada estadística
    Object.keys(stats).forEach(key => {
      if (player.stats[key] !== undefined) {
        player.stats[key] = (player.stats[key] || 0) + stats[key];
      }
    });

    await player.save();

    logger.info(`Stats incremented for player ${playerId}`, stats);

    return player;
  } catch (error) {
    logger.error(`Error incrementing stats for player ${playerId}:`, error);
    throw error;
  }
}

/**
 * Obtiene las estadísticas de un jugador
 * @param {string} playerId
 * @returns {Promise<Object>}
 */
async function getPlayerStats(playerId) {
  try {
    const player = await findPlayerById(playerId);

    if (!player) {
      throw new Error(ERROR_MESSAGES.PLAYER_NOT_FOUND);
    }

    return {
      playerId: player._id,
      name: player.name,
      stats: player.stats,
      isHost: player.isHost,
      isConnected: player.isConnected,
      cardNumber: player.cardNumber,
      markedCells: player.bingoCard?.markedCells?.length || 0
    };
  } catch (error) {
    logger.error(`Error getting stats for player ${playerId}:`, error);
    throw error;
  }
}

/**
 * Verifica si un jugador tiene un cartón válido
 * @param {string} playerId
 * @returns {Promise<boolean>}
 */
async function hasValidCard(playerId) {
  try {
    const player = await findPlayerById(playerId);

    if (!player) {
      return false;
    }

    return (
      player.cardNumber != null &&
      player.cardNumber > 0 &&
      Array.isArray(player.bingoCard?.matrix) &&
      player.bingoCard.matrix.length > 0
    );
  } catch (error) {
    logger.error(`Error checking valid card for player ${playerId}:`, error);
    return false;
  }
}

/**
 * Obtiene todos los jugadores de una lista de IDs
 * @param {Array<string>} playerIds
 * @returns {Promise<Array<Player>>}
 */
async function findPlayersByIds(playerIds) {
  try {
    return await Player.find({ _id: { $in: playerIds } });
  } catch (error) {
    logger.error('Error finding players by IDs:', error);
    throw error;
  }
}

/**
 * Desconecta a todos los jugadores
 * @returns {Promise<number>} - Número de jugadores desconectados
 */
async function disconnectAllPlayers() {
  try {
    const result = await Player.updateMany(
      {},
      {
        $set: {
          isConnected: false,
          socketId: null
        }
      }
    );

    logger.info(`All players disconnected: ${result.modifiedCount}`);

    return result.modifiedCount;
  } catch (error) {
    logger.error('Error disconnecting all players:', error);
    throw error;
  }
}

/**
 * Elimina jugadores por IDs
 * @param {Array<string>} playerIds
 * @returns {Promise<number>} - Número de jugadores eliminados
 */
async function deletePlayers(playerIds) {
  try {
    const result = await Player.deleteMany({ _id: { $in: playerIds } });

    logger.info(`Players deleted: ${result.deletedCount}`);

    return result.deletedCount;
  } catch (error) {
    logger.error('Error deleting players:', error);
    throw error;
  }
}

/**
 * Verifica si un jugador está conectado
 * @param {string} playerId
 * @returns {Promise<boolean>}
 */
async function isPlayerConnected(playerId) {
  try {
    const player = await findPlayerById(playerId);
    return player ? player.isConnected : false;
  } catch (error) {
    logger.error(`Error checking if player is connected ${playerId}:`, error);
    return false;
  }
}

/**
 * Obtiene información básica del jugador
 * @param {string} playerId
 * @returns {Promise<Object>}
 */
async function getPlayerInfo(playerId) {
  try {
    const player = await findPlayerById(playerId);

    if (!player) {
      throw new Error(ERROR_MESSAGES.PLAYER_NOT_FOUND);
    }

    return {
      id: player._id,
      name: player.name,
      isHost: player.isHost,
      isConnected: player.isConnected,
      cardNumber: player.cardNumber,
      socketId: player.socketId
    };
  } catch (error) {
    logger.error(`Error getting player info ${playerId}:`, error);
    throw error;
  }
}

/**
 * Reinicia el cartón de un jugador (limpia celdas marcadas)
 * @param {string} playerId
 * @returns {Promise<Player>}
 */
async function resetPlayerCard(playerId) {
  try {
    const player = await findPlayerById(playerId);

    if (!player) {
      throw new Error(ERROR_MESSAGES.PLAYER_NOT_FOUND);
    }

    if (player.bingoCard) {
      player.bingoCard.markedCells = [];
    }

    await player.save();

    logger.info(`Card reset for player ${playerId}`);

    return player;
  } catch (error) {
    logger.error(`Error resetting card for player ${playerId}:`, error);
    throw error;
  }
}

module.exports = {
  findPlayerById,
  updatePlayerConnection,
  markCell,
  updatePlayerPoints,
  incrementPlayerStats,
  getPlayerStats,
  hasValidCard,
  findPlayersByIds,
  disconnectAllPlayers,
  deletePlayers,
  isPlayerConnected,
  getPlayerInfo,
  resetPlayerCard
};
