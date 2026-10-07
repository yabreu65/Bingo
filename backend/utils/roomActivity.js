const Room = require('../models/Room');
const logger = require('../config/logger');

/**
 * Actualiza el timestamp de última actividad de una sala
 * @param {string} roomCode - Código de la sala
 */
async function updateRoomActivity(roomCode) {
  try {
    await Room.findOneAndUpdate(
      { code: roomCode.toUpperCase() },
      { lastActivity: new Date() },
      { new: true }
    );
    logger.debug(`Updated activity for room ${roomCode}`);
  } catch (error) {
    logger.error(`Error updating room activity for ${roomCode}:`, error);
  }
}

/**
 * Actualiza el timestamp de última actividad de una sala por ID
 * @param {ObjectId} roomId - ID de la sala
 */
async function updateRoomActivityById(roomId) {
  try {
    await Room.findByIdAndUpdate(
      roomId,
      { lastActivity: new Date() },
      { new: true }
    );
    logger.debug(`Updated activity for room ID ${roomId}`);
  } catch (error) {
    logger.error(`Error updating room activity for ID ${roomId}:`, error);
  }
}

module.exports = {
  updateRoomActivity,
  updateRoomActivityById
};
