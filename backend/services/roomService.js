const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const logger = require('../config/logger');
const { GAME_CONSTANTS, ERROR_MESSAGES } = require('../constants');

/**
 * Busca una sala por código
 * @param {string} roomCode
 * @param {boolean} populate - Si debe popular los players
 * @returns {Promise<Room|null>}
 */
async function findRoomByCode(roomCode, populate = false) {
  try {
    let query = Room.findOne({ code: roomCode });

    if (populate) {
      query = query.populate('players');
    }

    return await query;
  } catch (error) {
    logger.error(`Error finding room ${roomCode}:`, error);
    throw error;
  }
}

/**
 * Obtiene todas las salas activas
 * @returns {Promise<Array<Room>>}
 */
async function getAllRooms() {
  try {
    return await Room.find({}).populate('players');
  } catch (error) {
    logger.error('Error getting all rooms:', error);
    throw error;
  }
}

/**
 * Verifica si un jugador es el host de la sala
 * @param {string} playerId
 * @param {Room} room
 * @returns {Promise<boolean>}
 */
async function isPlayerHost(playerId, room) {
  try {
    if (!playerId || !room) return false;

    const player = await Player.findById(playerId);
    return player && player.isHost;
  } catch (error) {
    logger.error('Error checking if player is host:', error);
    return false;
  }
}

/**
 * Obtiene los jugadores conectados de una sala
 * @param {Room} room
 * @returns {Array<Player>}
 */
function getConnectedPlayers(room) {
  if (!room || !room.players) return [];
  return room.players.filter(p => p.isConnected);
}

/**
 * Obtiene estadísticas de una sala
 * @param {string} roomCode
 * @returns {Promise<Object>}
 */
async function getRoomStats(roomCode) {
  try {
    const room = await findRoomByCode(roomCode, true);

    if (!room) {
      return {
        exists: false,
        playerCount: 0,
        gameState: null
      };
    }

    const connectedPlayers = getConnectedPlayers(room);

    return {
      exists: true,
      code: room.code,
      playerCount: connectedPlayers.length,
      totalPlayers: room.players.length,
      gameState: room.gameState,
      hostName: room.hostName,
      config: room.config,
      hasActiveGame: !!room.currentGame
    };
  } catch (error) {
    logger.error(`Error getting room stats for ${roomCode}:`, error);
    throw error;
  }
}

/**
 * Valida si la sala puede aceptar más jugadores
 * @param {Room} room
 * @returns {boolean}
 */
function canAcceptMorePlayers(room) {
  if (!room) return false;

  const connectedPlayers = getConnectedPlayers(room);
  const maxPlayers = room.config?.maxPlayers || GAME_CONSTANTS.MAX_PLAYERS;

  return connectedPlayers.length < maxPlayers;
}

/**
 * Actualiza el estado del juego en una sala
 * @param {string} roomCode
 * @param {string} newState
 * @returns {Promise<Room>}
 */
async function updateRoomGameState(roomCode, newState) {
  try {
    const room = await findRoomByCode(roomCode);

    if (!room) {
      throw new Error(ERROR_MESSAGES.ROOM_NOT_FOUND);
    }

    room.gameState = newState;
    await room.save();

    logger.logRoomEvent(roomCode, `Game state changed to: ${newState}`);

    return room;
  } catch (error) {
    logger.error(`Error updating room game state for ${roomCode}:`, error);
    throw error;
  }
}

/**
 * Elimina una sala y todos sus datos relacionados
 * @param {string} roomCode
 * @returns {Promise<boolean>}
 */
async function deleteRoom(roomCode) {
  try {
    const room = await findRoomByCode(roomCode, true);

    if (!room) {
      logger.warn(`Attempted to delete non-existent room: ${roomCode}`);
      return false;
    }

    // Eliminar juego asociado
    if (room.currentGame) {
      await Game.findByIdAndDelete(room.currentGame);
    }

    // Eliminar jugadores
    if (room.players && room.players.length > 0) {
      await Player.deleteMany({ _id: { $in: room.players } });
    }

    // Eliminar sala
    await Room.findByIdAndDelete(room._id);

    logger.logRoomEvent(roomCode, 'Room deleted');

    return true;
  } catch (error) {
    logger.error(`Error deleting room ${roomCode}:`, error);
    throw error;
  }
}

/**
 * Elimina todas las salas
 * @returns {Promise<number>} - Número de salas eliminadas
 */
async function deleteAllRooms() {
  try {
    const rooms = await getAllRooms();
    const roomCount = rooms.length;

    // Eliminar todos los juegos
    await Game.deleteMany({});

    // Desconectar todos los jugadores (no eliminarlos para preservar cuentas)
    await Player.updateMany({}, {
      $set: {
        isConnected: false,
        socketId: null
      }
    });

    // Eliminar todas las salas
    await Room.deleteMany({});

    logger.info(`All ${roomCount} rooms deleted`);

    return roomCount;
  } catch (error) {
    logger.error('Error deleting all rooms:', error);
    throw error;
  }
}

/**
 * Actualiza la configuración de una sala
 * @param {string} roomCode
 * @param {Object} newConfig
 * @returns {Promise<Room>}
 */
async function updateRoomConfig(roomCode, newConfig) {
  try {
    const room = await findRoomByCode(roomCode);

    if (!room) {
      throw new Error(ERROR_MESSAGES.ROOM_NOT_FOUND);
    }

    room.config = {
      ...room.config,
      ...newConfig
    };

    await room.save();

    logger.logRoomEvent(roomCode, 'Room config updated', { newConfig });

    return room;
  } catch (error) {
    logger.error(`Error updating room config for ${roomCode}:`, error);
    throw error;
  }
}

/**
 * Obtiene la configuración de una sala
 * @param {string} roomCode
 * @returns {Promise<Object>}
 */
async function getRoomConfig(roomCode) {
  try {
    const room = await findRoomByCode(roomCode);

    if (!room) {
      throw new Error(ERROR_MESSAGES.ROOM_NOT_FOUND);
    }

    return room.config || {};
  } catch (error) {
    logger.error(`Error getting room config for ${roomCode}:`, error);
    throw error;
  }
}

/**
 * Verifica si una sala existe
 * @param {string} roomCode
 * @returns {Promise<boolean>}
 */
async function roomExists(roomCode) {
  try {
    const room = await Room.findOne({ code: roomCode });
    return !!room;
  } catch (error) {
    logger.error(`Error checking if room exists: ${roomCode}:`, error);
    return false;
  }
}

/**
 * Obtiene información resumida de la sala para broadcast
 * @param {string} roomCode
 * @returns {Promise<Object>}
 */
async function getRoomBroadcastInfo(roomCode) {
  try {
    const room = await findRoomByCode(roomCode, true);

    if (!room) return null;

    const connectedPlayers = getConnectedPlayers(room);

    return {
      playerCount: connectedPlayers.length,
      gameState: room.gameState,
      config: {
        timeBetweenNumbers: room.config?.timeBetweenNumbers,
        challengeFrequency: room.config?.challengeFrequency
      }
    };
  } catch (error) {
    logger.error(`Error getting room broadcast info for ${roomCode}:`, error);
    return null;
  }
}

module.exports = {
  findRoomByCode,
  getAllRooms,
  isPlayerHost,
  getConnectedPlayers,
  getRoomStats,
  canAcceptMorePlayers,
  updateRoomGameState,
  deleteRoom,
  deleteAllRooms,
  updateRoomConfig,
  getRoomConfig,
  roomExists,
  getRoomBroadcastInfo
};
