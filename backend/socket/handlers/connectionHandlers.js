const Room = require('../../models/Room');
const Game = require('../../models/Game');
const Player = require('../../models/Player');
const logger = require('../../config/logger');
const { isRoomHost } = require('../../middleware/socketAuthMiddleware');
const { stripGuestCapabilityHashes, stripTriviaAnswers, stripPrivatePlayerData } = require('../../utils/publicData');

const socketMatchesIdentity = (socket, data) => {
  const requestedRoom = typeof data?.roomCode === 'string' ? data.roomCode.toUpperCase() : '';
  return !!socket.roomCode && !!socket.playerId &&
    socket.playerId !== 'tv-display' &&
    requestedRoom === socket.roomCode.toUpperCase() &&
    data?.playerId?.toString() === socket.playerId.toString();
};
const failCallback = (callback, message) => {
  if (typeof callback === 'function') callback({ success: false, error: message });
};

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
      if (!socketMatchesIdentity(socket, data)) {
        return failCallback(callback, 'No tienes permisos para verificar esta sala');
      }

      const room = await Room.findOne({ code: socket.roomCode });
      if (!room) return failCallback(callback, 'Sala no encontrada');

      const isInRoom = room.players.some((roomPlayer) => {
        const listedId = roomPlayer?._id || roomPlayer;
        return listedId?.toString() === socket.playerId.toString();
      });
      const owner = isInRoom ? await Player.findOne({
        _id: socket.playerId,
        room: room._id,
        socketId: socket.id,
        isConnected: true
      }) : null;
      if (!owner) return failCallback(callback, 'Jugador no está conectado a esta sala');

      return callback({ success: true, inRoom: true });
    } catch (error) {
      logger.error('Error verifying room:', error);
      return failCallback(callback, 'No se pudo verificar la sala');
    }
  };
}

/**
 * Handler para sincronizar el estado del juego después de reconexión
 */
function handleSyncGameState(io, socket) {
  return async (data, callback) => {
    try {
      if (!socketMatchesIdentity(socket, data)) {
        return failCallback(callback, 'No tienes permisos para sincronizar este jugador');
      }
      const roomCode = socket.roomCode;
      const playerId = socket.playerId;
      logger.info(`[${roomCode}] Syncing game state for player ${playerId}`);

      const room = await Room.findOne({ code: roomCode }).populate('players');
      if (!room) return failCallback(callback, 'Sala no encontrada');

      const isListedInRoom = room.players.some((roomPlayer) => {
        const listedId = roomPlayer?._id || roomPlayer;
        return listedId?.toString() === playerId.toString();
      });
      const player = isListedInRoom ? await Player.findOne({
        _id: playerId,
        room: room._id,
        socketId: socket.id,
        isConnected: true
      }) : null;
      if (!player) return failCallback(callback, 'Jugador no conectado a esta sala');

      const game = room.currentGame ? await Game.findById(room.currentGame) : null;

      // Preparar datos de sincronización
      const syncData = {
        roomCode: room.code,
        gameMode: room.config?.gameMode || game?.gameMode || 'full',
        gameState: room.gameState,
        currentNumber: game?.currentNumber || null,
        calledNumbers: game?.calledNumbers || [],
        playerData: {
          playerId: player._id,
          playerName: player.name,
          bingoCard: player.bingoCard,
          markedCells: player.bingoCard?.markedCells || []
        }
      };

      // Si hay un challenge activo, no enviar la respuesta correcta al cliente jugador.
      if (game?.activeChallenge) {
        syncData.activeChallenge = stripTriviaAnswers(game.activeChallenge);
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
      return failCallback(callback, 'No se pudo sincronizar el estado del juego');
    }
  };
}

/**
 * Handler para sincronizar el estado completo del dashboard (organizador)
 */
function handleSyncDashboard(io, socket) {
  return async (data, callback) => {
    try {
      const roomCode = socket.roomCode;
      const requestedRoom = typeof data?.roomCode === 'string' ? data.roomCode.toUpperCase() : '';
      if (!roomCode || !socket.playerId || requestedRoom !== roomCode.toUpperCase()) {
        return failCallback(callback, 'No tienes permisos para sincronizar este dashboard');
      }

      logger.info(`[${roomCode}] Syncing dashboard state`);

      const room = await Room.findOne({ code: roomCode })
        .select('+hostCapabilityHash')
        .populate('players');
      if (!room) return failCallback(callback, 'Sala no encontrada');

      const roomHostId = room.host?._id || room.host;
      if (roomHostId?.toString() !== socket.playerId.toString() ||
          !(await isRoomHost(socket, room, data?.hostCapability))) {
        return failCallback(callback, 'No tienes permisos para sincronizar este dashboard');
      }
      const hostPlayer = await Player.findOne({
        _id: socket.playerId,
        room: room._id,
        isHost: true,
        socketId: socket.id,
        isConnected: true
      });
      if (!hostPlayer) return failCallback(callback, 'Anfitrión no conectado a esta sala');

      const game = room.currentGame ? await Game.findById(room.currentGame) : null;

      // Preparar datos de sincronización del dashboard
      const syncData = {
        room: stripPrivatePlayerData(stripGuestCapabilityHashes(room)),
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
      return failCallback(callback, 'No se pudo sincronizar el dashboard');
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
