const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const { GAME_CONSTANTS } = require('../constants');
const logger = require('../config/logger');

/**
 * Servicio de limpieza automática de salas inactivas
 * Elimina salas que han estado inactivas por más de 6 horas
 */
class RoomCleanupService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Inicia el servicio de limpieza
   */
  start() {
    if (this.isRunning) {
      logger.warn('RoomCleanup service is already running');
      return;
    }

    logger.info('Starting RoomCleanup service...');
    logger.info(`Will check for inactive rooms every ${GAME_CONSTANTS.CLEANUP_CHECK_INTERVAL / 60000} minutes`);
    logger.info(`Rooms inactive for more than ${GAME_CONSTANTS.ROOM_INACTIVITY_TIMEOUT / 3600000} hours will be deleted`);

    // Ejecutar inmediatamente al iniciar
    this.cleanup();

    // Ejecutar periódicamente
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, GAME_CONSTANTS.CLEANUP_CHECK_INTERVAL);

    this.isRunning = true;
  }

  /**
   * Detiene el servicio de limpieza
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      logger.info('RoomCleanup service stopped');
    }
  }

  /**
   * Ejecuta la limpieza de salas inactivas
   */
  async cleanup() {
    try {
      const now = Date.now();
      const inactivityThreshold = now - GAME_CONSTANTS.ROOM_INACTIVITY_TIMEOUT;

      logger.debug('Running room cleanup check...');

      // Buscar salas inactivas
      const inactiveRooms = await Room.find({
        lastActivity: { $lt: new Date(inactivityThreshold) },
        isActive: true
      }).populate('players currentGame');

      if (inactiveRooms.length === 0) {
        logger.debug('No inactive rooms found');
        return;
      }

      logger.info(`Found ${inactiveRooms.length} inactive room(s) to clean up`);

      for (const room of inactiveRooms) {
        await this.deleteRoom(room);
      }

      logger.info(`Successfully cleaned up ${inactiveRooms.length} inactive room(s)`);
    } catch (error) {
      logger.error('Error during room cleanup:', error);
    }
  }

  /**
   * Elimina una sala y todos sus datos relacionados
   */
  async deleteRoom(room) {
    try {
      const roomCode = room.code;
      const roomId = room._id;

      logger.info(`Deleting inactive room: ${roomCode} (last activity: ${room.lastActivity})`);

      // 1. Eliminar el juego asociado si existe
      if (room.currentGame) {
        await Game.findByIdAndDelete(room.currentGame);
        logger.debug(`Deleted game for room ${roomCode}`);
      }

      // 2. Eliminar todos los jugadores
      const deletedPlayers = await Player.deleteMany({ room: roomId });
      logger.debug(`Deleted ${deletedPlayers.deletedCount} player(s) from room ${roomCode}`);

      // 3. Eliminar la sala
      await Room.findByIdAndDelete(roomId);
      logger.debug(`Deleted room ${roomCode}`);

      logger.info(`✓ Successfully deleted room ${roomCode}`);
    } catch (error) {
      logger.error(`Error deleting room ${room.code}:`, error);
    }
  }

  /**
   * Obtiene estadísticas de salas
   */
  async getStats() {
    try {
      const totalRooms = await Room.countDocuments({ isActive: true });
      const now = Date.now();
      const inactivityThreshold = now - GAME_CONSTANTS.ROOM_INACTIVITY_TIMEOUT;

      const inactiveRooms = await Room.countDocuments({
        lastActivity: { $lt: new Date(inactivityThreshold) },
        isActive: true
      });

      return {
        total: totalRooms,
        inactive: inactiveRooms,
        active: totalRooms - inactiveRooms
      };
    } catch (error) {
      logger.error('Error getting room stats:', error);
      return null;
    }
  }
}

// Exportar instancia única (singleton)
module.exports = new RoomCleanupService();
