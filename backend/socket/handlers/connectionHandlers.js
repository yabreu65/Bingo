const Room = require('../../models/Room');
const Game = require('../../models/Game');
const Player = require('../../models/Player');
const logger = require('../../config/logger');

/**
 * Handler para ping/pong (heartbeat)
 */
function handlePing(io, socket) {
  return (data) => {
    // Responder con pong
    socket.emit('pong', { timestamp: Date.now(), clientTimestamp: data?.timestamp });
  };
}

/**
 * Handler para verificar si el jugador sigue en la sala
 */
function handleVerifyRoom(io, socket) {
  return async (data, callback) => {
    try {
      const { roomCode, playerId } = data;

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return callback({ success: false, error: 'Sala no encontrada' });
      }

      const isInRoom = room.players.some(p => p.toString() === playerId);
      if (!isInRoom) {
        return callback({ success: false, error: 'Jugador no está en la sala' });
      }

      callback({ success: true, inRoom: true });
    } catch (error) {
      logger.error('Error verifying room:', error);
      callback({ success: false, error: error.message });
    }
  };
}

/**
 * Handler para sincronizar el estado del juego después de reconexión
 */
function handleSyncGameState(io, socket) {
  return async (data, callback) => {
    try {
      const { roomCode, playerId } = data;

      logger.info(`[${roomCode}] Syncing game state for player ${playerId}`);

      const room = await Room.findOne({ code: roomCode }).populate('players');
      if (!room) {
        return callback({ success: false, error: 'Sala no encontrada' });
      }

      const player = await Player.findById(playerId);
      if (!player) {
        return callback({ success: false, error: 'Jugador no encontrado' });
      }

      const game = room.currentGame ? await Game.findById(room.currentGame) : null;

      // Preparar datos de sincronización
      const syncData = {
        roomCode: room.code,
        gameState: room.gameState,
        currentNumber: game?.currentNumber || null,
        calledNumbers: game?.calledNumbers || [],
        playerData: {
          playerId: player._id,
          playerName: player.name,
          bingoCard: player.bingoCard,
          markedCells: player.markedCells || []
        }
      };

      // Si hay un challenge activo
      if (game?.activeChallenge) {
        syncData.activeChallenge = game.activeChallenge;
      }

      // Si hay tie-break activo
      if (game?.tieBreakActive) {
        syncData.tieBreak = {
          active: true,
          status: game.tieBreakStatus,
          candidates: game.tieCandidates,
          currentPerformer: game.tieBreakCurrentPerformer
        };
      }

      logger.info(`[${roomCode}] Game state synced successfully for ${player.name}`);

      callback({
        success: true,
        data: syncData
      });

      // Emitir evento al cliente para que actualice su estado
      socket.emit('game-state-update', syncData);

    } catch (error) {
      logger.error('Error syncing game state:', error);
      callback({ success: false, error: error.message });
    }
  };
}

/**
 * Handler para sincronizar el estado completo del dashboard (organizador)
 */
function handleSyncDashboard(io, socket) {
  return async (data, callback) => {
    try {
      const { roomCode } = data;

      logger.info(`[${roomCode}] Syncing dashboard state`);

      const room = await Room.findOne({ code: roomCode }).populate('players');
      if (!room) {
        return callback({ success: false, error: 'Sala no encontrada' });
      }

      const game = room.currentGame ? await Game.findById(room.currentGame) : null;

      // Preparar datos de sincronización del dashboard
      const syncData = {
        room: room,
        gameState: room.gameState,
        currentNumber: game?.currentNumber || null,
        calledNumbers: game?.calledNumbers || [],
        gameStarted: !!room.currentGame // El juego ha comenzado si hay un currentGame
      };

      // Si hay un challenge activo
      if (game?.activeChallenge) {
        syncData.activeChallenge = game.activeChallenge;
      }

      // Si hay tie-break activo
      if (game?.tieBreakActive) {
        syncData.tieBreak = {
          active: true,
          status: game.tieBreakStatus,
          candidates: game.tieCandidates,
          currentPerformer: game.tieBreakCurrentPerformer
        };
      }

      logger.info(`[${roomCode}] Dashboard state synced successfully`);

      callback({
        success: true,
        data: syncData
      });

    } catch (error) {
      logger.error('Error syncing dashboard state:', error);
      callback({ success: false, error: error.message });
    }
  };
}

/**
 * Registra todos los handlers de conexión
 */
function registerConnectionHandlers(io, socket) {
  socket.on('ping', handlePing(io, socket));
  socket.on('verify-room', handleVerifyRoom(io, socket));
  socket.on('sync-game-state', handleSyncGameState(io, socket));
  socket.on('sync-dashboard', handleSyncDashboard(io, socket));
}

module.exports = {
  registerConnectionHandlers,
  handlePing,
  handleVerifyRoom,
  handleSyncGameState,
  handleSyncDashboard
};
