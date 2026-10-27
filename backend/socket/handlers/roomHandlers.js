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
      const { roomCode, playerId, hostCapability } = data;
      const requestedRoomCode = typeof roomCode === 'string' ? roomCode.toUpperCase() : '';
      const boundRoomCode = typeof socket.roomCode === 'string' ? socket.roomCode.toUpperCase() : '';
      if ((socket.roomCode && boundRoomCode !== requestedRoomCode) ||
          (socket.playerId && socket.playerId !== playerId)) {
        if (callback) callback({ success: false, error: 'Socket ya está vinculado a otro jugador o sala' });
        return;
      }

      const room = await Room.findOne({ code: roomCode }).populate('players');
      if (!room) {
        if (callback) callback({ success: false, error: 'Sala no encontrada' });
        return;
      }

      if (playerId !== 'tv-display') {
        const player = await Player.findById(playerId);
        const playerRoomId = player?.room?._id || player?.room;
        if (!player || playerRoomId?.toString() !== room._id.toString()) {
          if (callback) callback({ success: false, error: 'Jugador no pertenece a la sala' });
          return;
        }

        const previousSocketId = player.socketId;
        const previousSocket = previousSocketId && previousSocketId !== socket.id
          ? io.sockets?.sockets?.get(previousSocketId)
          : null;
        let authorizedHostReclaim = false;

        if (player.isHost && previousSocketId !== socket.id) {
          authorizedHostReclaim = await isRoomHost({ user: null }, room, hostCapability);
          const previousSocketMatchesPlayer = previousSocket &&
            previousSocket.roomCode?.toUpperCase() === room.code.toUpperCase() &&
            previousSocket.playerId?.toString() === player._id.toString();
          if (!authorizedHostReclaim || (previousSocket && !previousSocketMatchesPlayer)) {
            if (callback) callback({ success: false, error: 'Jugador ya conectado' });
            return;
          }
        }

        if (previousSocket && !authorizedHostReclaim) {
          if (callback) callback({ success: false, error: 'Jugador ya conectado' });
          return;
        }

        const socketOwnershipFilter = previousSocketId
          ? { socketId: previousSocketId }
          : { $or: [{ socketId: { $exists: false } }, { socketId: null }] };
        const claimFilter = { _id: player._id, room: room._id, ...socketOwnershipFilter };
        if (authorizedHostReclaim) claimFilter.isHost = true;
        const claimedPlayer = await Player.findOneAndUpdate(
          claimFilter,
          { $set: { socketId: socket.id, isConnected: true } },
          { new: true }
        );
        if (!claimedPlayer) {
          if (callback) callback({ success: false, error: 'Jugador ya conectado' });
          return;
        }

        if (authorizedHostReclaim && previousSocket) previousSocket.disconnect(true);
      }

      socket.join(room.code);
      socket.roomCode = room.code;
      socket.playerId = playerId;

      io.to(room.code).emit('player-joined', {
        playerId,
        players: room.players
      });

      await broadcastRoomInfo(io, room.code);

      logger.logRoomEvent(room.code, playerId === 'tv-display' ? 'TV Display joined' : 'Player joined', {
        playerId,
        socketId: socket.id
      });

      if (callback) {
        callback({ success: true, roomCode: room.code, playerId });
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
      const requestedRoomCode = typeof data?.roomCode === 'string' ? data.roomCode.toUpperCase() : '';
      const roomCode = socket.roomCode;
      if (!roomCode || requestedRoomCode !== roomCode.toUpperCase()) {
        socket.emit('error', { message: 'No tienes permisos para dejar esta sala' });
        return;
      }

      const room = await Room.findOne({ code: roomCode }).populate('players');
      if (!room) {
        socket.emit('error', { message: 'Sala no encontrada' });
        return;
      }

      const playerId = socket.playerId;
      if (playerId && playerId !== 'tv-display') {
        const releasedPlayer = await Player.findOneAndUpdate(
          { _id: playerId, room: room._id, socketId: socket.id },
          { $set: { isConnected: false, socketId: null } },
          { new: true }
        );
        if (!releasedPlayer) {
          socket.emit('error', { message: 'No tienes permisos para dejar esta sala' });
          return;
        }
      }

      socket.leave(roomCode);
      socket.roomCode = undefined;
      socket.playerId = undefined;

      const updatedRoom = await Room.findOne({ code: roomCode }).populate('players');
      io.to(roomCode).emit('player-left', {
        playerId,
        players: updatedRoom ? updatedRoom.players : []
      });

      await broadcastRoomInfo(io, roomCode);

      logger.logRoomEvent(roomCode, 'Player left', {
        playerId
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
        const hasPermission = await isRoomHost(socket, room, data?.hostCapability);
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
      const hasPermission = await isRoomHost(socket, room, data?.hostCapability);
      if (!hasPermission) {
        logger.warn(`[${roomCode}] Unauthorized kick-player attempt by socket ${socket.id}`);
        return emitPermissionError(socket);
      }

      const player = await Player.findById(playerId);

      if (player) {
        const playerRoomId = player.room?._id || player.room;
        if (playerRoomId?.toString() !== room._id.toString()) {
          return emitPermissionError(socket);
        }

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
      if (!socket.playerId || socket.playerId === 'tv-display' || !socket.roomCode) return;

      const room = await Room.findOne({ code: socket.roomCode }).populate('players');
      const player = await Player.findById(socket.playerId);
      const playerRoomId = player?.room?._id || player?.room;
      if (!room || !player || playerRoomId?.toString() !== room._id.toString() || player.socketId !== socket.id) {
        return;
      }

      const disconnectedPlayer = await Player.findOneAndUpdate(
        { _id: player._id, room: room._id, socketId: socket.id },
        { $set: { isConnected: false, socketId: null } },
        { new: true }
      );
      if (!disconnectedPlayer) return;

      // Challenges finish through their existing timeout; a disconnect must not alter game state or timers.
      const updatedRoom = await Room.findOne({ code: room.code }).populate('players');
      io.to(room.code).emit('player-left', {
        playerId: socket.playerId,
        players: updatedRoom ? updatedRoom.players : []
      });
      await broadcastRoomInfo(io, room.code);

      logger.logSocketEvent(socket.id, 'Player disconnected', {
        playerId: socket.playerId,
        roomCode: room.code
      });
      // DON'T clear the interval when a player disconnects!
      // The interval should only be cleared when the room is explicitly closed.
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
