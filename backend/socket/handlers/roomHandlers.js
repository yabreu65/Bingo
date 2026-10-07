const Room = require('../../models/Room');
const Player = require('../../models/Player');
const Game = require('../../models/Game');
const logger = require('../../config/logger');
const { isRoomHost, emitPermissionError } = require('../../middleware/socketAuthMiddleware');
const { clearAllRoomTimers } = require('../utils/roomTimer');

/**
 * Emite información de la sala a todos los conectados
 * @param {SocketIO} io
 * @param {string} roomCode
 */
async function broadcastRoomInfo(io, roomCode) {
  try {
    const room = await Room.findOne({ code: roomCode }).populate('players');
    if (room) {
      const connectedPlayers = room.players.filter(p => p.isConnected);
      const manualPlayersCount = (room.manualPlayers || []).length;
      const totalPlayers = connectedPlayers.length + manualPlayersCount;

      logger.info(`[${roomCode}] Broadcasting room info: ${connectedPlayers.length} digital + ${manualPlayersCount} manual = ${totalPlayers} total players`);

      io.to(roomCode).emit('room-info', {
        playerCount: totalPlayers, // Incluir jugadores digitales Y manuales
        gameState: room.gameState,
        manualPlayers: room.manualPlayers || []
      });
    }
  } catch (error) {
    logger.error(`Error broadcasting room info for ${roomCode}:`, error);
  }
}

/**
 * Handler para cuando un jugador se une a una sala
 */
function handleJoinRoom(io, socket) {
  return async (data, callback) => {
    try {
      const { roomCode, playerId } = data;

      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.playerId = playerId;

      // Solo actualizar el jugador si no es tv-display
      if (playerId !== 'tv-display') {
        await Player.findByIdAndUpdate(playerId, {
          socketId: socket.id,
          isConnected: true
        });
      }

      const room = await Room.findOne({ code: roomCode }).populate('players');
      io.to(roomCode).emit('player-joined', {
        playerId,
        players: room.players
      });

      await broadcastRoomInfo(io, roomCode);

      logger.logRoomEvent(roomCode, playerId === 'tv-display' ? 'TV Display joined' : 'Player joined', {
        playerId,
        socketId: socket.id
      });

      // Confirmar al cliente que se unió exitosamente
      if (callback) {
        callback({ success: true, roomCode, playerId });
      }
    } catch (error) {
      logger.error('Error in join-room:', error);
      socket.emit('error', { message: error.message });
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  };
}

/**
 * Handler para cuando un jugador deja una sala
 */
function handleLeaveRoom(io, socket) {
  return async (data) => {
    try {
      const { roomCode } = data;

      socket.leave(roomCode);

      if (socket.playerId) {
        await Player.findByIdAndUpdate(socket.playerId, { isConnected: false });
      }

      const room = await Room.findOne({ code: roomCode }).populate('players');
      io.to(roomCode).emit('player-left', {
        playerId: socket.playerId,
        players: room ? room.players : []
      });

      await broadcastRoomInfo(io, roomCode);

      logger.logRoomEvent(roomCode, 'Player left', {
        playerId: socket.playerId
      });
    } catch (error) {
      logger.error('Error in leave-room:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para cerrar una sala (solo host)
 */
function handleCloseRoom(io, socket) {
  return async (data) => {
    try {
      const { roomCode } = data;

      const room = await Room.findOne({ code: roomCode }).populate('players');

      if (room) {
        // Verificar permisos de host
        const hasPermission = await isRoomHost(socket, room);
        if (!hasPermission) {
          logger.warn(`[${roomCode}] Unauthorized close-room attempt by socket ${socket.id}`);
          return emitPermissionError(socket);
        }

        // Notificar a todos que la sala se cerró
        io.to(roomCode).emit('room-closed', {
          roomCode,
          message: 'La sala ha sido cerrada por el anfitrión'
        });

        // Desconectar todos los jugadores
        for (const player of room.players) {
          if (player.socketId) {
            const playerSocket = io.sockets.sockets.get(player.socketId);
            if (playerSocket) {
              playerSocket.leave(roomCode);
            }
          }
          await Player.findByIdAndUpdate(player._id, { isConnected: false });
        }

        // Eliminar juego asociado
        if (room.currentGame) {
          await Game.findByIdAndDelete(room.currentGame);
        }

        // Eliminar jugadores
        await Player.deleteMany({ _id: { $in: room.players } });

        // Limpiar timers
        clearAllRoomTimers(roomCode);

        // Eliminar sala
        await Room.findByIdAndDelete(room._id);

        logger.logRoomEvent(roomCode, 'Room closed and deleted');
      }
    } catch (error) {
      logger.error('Error closing room:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para eliminar todas las salas (solo admin)
 */
function handleDeleteAllRooms(io, socket) {
  return async () => {
    try {
      // Solo admins pueden eliminar todas las salas
      if (!socket.user || socket.user.role !== 'admin') {
        logger.warn(`Unauthorized delete-all-rooms attempt by socket ${socket.id}`);
        return emitPermissionError(socket);
      }

      // Limpiar todos los timers
      const Room = require('../../models/Room');
      const rooms = await Room.find({});
      rooms.forEach(room => {
        clearAllRoomTimers(room.code);
      });

      await Room.deleteMany({});
      await Game.deleteMany({});
      await Player.updateMany({}, { $set: { isConnected: false, socketId: null } });

      io.emit('rooms-cleared');

      logger.info('All rooms deleted by admin', {
        userId: socket.user.userId
      });
    } catch (error) {
      logger.error('Error deleting all rooms:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para expulsar un jugador (solo host)
 */
function handleKickPlayer(io, socket) {
  return async (data) => {
    try {
      const { roomCode, playerId } = data;

      // Verificar permisos de host
      const room = await Room.findOne({ code: roomCode });
      const hasPermission = await isRoomHost(socket, room);
      if (!hasPermission) {
        logger.warn(`[${roomCode}] Unauthorized kick-player attempt by socket ${socket.id}`);
        return emitPermissionError(socket);
      }

      const player = await Player.findById(playerId);

      if (player) {
        player.isConnected = false;
        await player.save();

        // Notificar al jugador expulsado
        if (player.socketId) {
          io.to(player.socketId).emit('kicked-from-room');
        }

        // Notificar a la sala
        const updatedRoom = await Room.findOne({ code: roomCode }).populate('players');
        io.to(roomCode).emit('player-left', {
          playerId,
          players: updatedRoom.players
        });

        logger.logRoomEvent(roomCode, 'Player kicked', {
          playerId,
          playerName: player.name
        });
      }
    } catch (error) {
      logger.error('Error kicking player:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para cuando un socket se desconecta
 */
function handleDisconnect(io, socket) {
  return async () => {
    try {
      // Skip if playerId is 'tv-display' or other special non-ObjectId values
      if (socket.playerId && socket.playerId !== 'tv-display') {
        await Player.findByIdAndUpdate(socket.playerId, {
          isConnected: false,
          socketId: null
        });

        if (socket.roomCode) {
          const room = await Room.findOne({ code: socket.roomCode }).populate('players');

          // IMPORTANTE: Si el jugador que se desconectó tenía un challenge activo, cancelarlo
          if (room && room.currentGame) {
            const Game = require('../../models/Game');
            const game = await Game.findById(room.currentGame);

            if (game?.activeChallenge && game.activeChallenge.player?.toString() === socket.playerId) {
              logger.warn(`[${socket.roomCode}] ⚠️ Player with active challenge disconnected, auto-canceling challenge`);

              // Limpiar el challenge
              game.activeChallenge = null;
              await game.save();

              // Reanudar el juego
              room.gameState = 'playing';
              await room.save();

              // Emitir eventos
              io.to(socket.roomCode).emit('challenge-complete', { success: false, reason: 'Player disconnected' });
              io.to(socket.roomCode).emit('game-state-changed', { state: 'playing' });

              // Continuar con el siguiente número
              const gameHandlers = require('./gameHandlers');
              await gameHandlers.immediateNextNumber(io, socket.roomCode);
              await gameHandlers.scheduleRoomInterval(io, socket.roomCode);

              const { ensureWatchdog } = require('../utils/roomTimer');
              ensureWatchdog(socket.roomCode, (rc) => gameHandlers.scheduleRoomInterval(io, rc), room.config);

              logger.info(`[${socket.roomCode}] ✅ Challenge auto-canceled, game resumed`);
            }
          }

          io.to(socket.roomCode).emit('player-left', {
            playerId: socket.playerId,
            players: room ? room.players : []
          });
          await broadcastRoomInfo(io, socket.roomCode);
        }

        logger.logSocketEvent(socket.id, 'Player disconnected', {
          playerId: socket.playerId,
          roomCode: socket.roomCode
        });
      }
      // DON'T clear the interval when a player disconnects!
      // The interval should only be cleared when the room is explicitly closed
      // The watchdog will handle restarting stalled intervals
    } catch (error) {
      logger.error(`Error on disconnect for socket ${socket.id}:`, error);
    }
  };
}

/**
 * Registra todos los handlers de sala
 * @param {SocketIO} io
 * @param {Socket} socket
 */
function registerRoomHandlers(io, socket) {
  socket.on('join-room', handleJoinRoom(io, socket));
  socket.on('leave-room', handleLeaveRoom(io, socket));
  socket.on('close-room', handleCloseRoom(io, socket));
  socket.on('delete-all-rooms', handleDeleteAllRooms(io, socket));
  socket.on('kick-player', handleKickPlayer(io, socket));
  socket.on('disconnect', handleDisconnect(io, socket));
}

module.exports = {
  registerRoomHandlers,
  broadcastRoomInfo,
  // Exports individuales para testing
  handleJoinRoom,
  handleLeaveRoom,
  handleCloseRoom,
  handleDeleteAllRooms,
  handleKickPlayer,
  handleDisconnect
};
