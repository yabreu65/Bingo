const Room = require('../../models/Room');
const Player = require('../../models/Player');
const Game = require('../../models/Game');
const logger = require('../../config/logger');

/**
 * Handler para marcar una celda del cartón
 */
function handleMarkCell(io, socket) {
  return async (data) => {
    try {
      const roomCode = socket.roomCode;
      const playerId = socket.playerId;
      const requestedRoomCode = typeof data?.roomCode === 'string' ? data.roomCode.toUpperCase() : '';
      if (!roomCode || !playerId || playerId === 'tv-display' ||
          requestedRoomCode !== roomCode.toUpperCase() ||
          data?.playerId?.toString() !== playerId.toString()) {
        return socket.emit('error', { message: 'No tienes permisos para marcar esta celda' });
      }
      const { row, col } = data;
      if (!Number.isInteger(row) || row < 0 || row > 4 || !Number.isInteger(col) || col < 0 || col > 4) {
        return socket.emit('error', { message: 'Celda inválida' });
      }

      const room = await Room.findOne({ code: roomCode });
      if (!room) return socket.emit('error', { message: 'Sala no encontrada' });
      const ownerFilter = {
        _id: playerId,
        room: room._id,
        socketId: socket.id,
        isConnected: true
      };
      const player = await Player.findOne(ownerFilter);
      if (!player) return socket.emit('error', { message: 'No tienes permisos para marcar esta celda' });

      const cellValue = player.bingoCard?.matrix?.[row]?.[col];
      if (!cellValue || cellValue === 'BINGO') {
        return socket.emit('error', { message: 'Celda inválida' });
      }

      const game = room.currentGame ? await Game.findById(room.currentGame) : null;
      if (game && Array.isArray(game.calledNumbers) && !game.calledNumbers.includes(cellValue)) {
        return socket.emit('error', { message: 'Número no ha sido cantado' });
      }

      const marked = Array.isArray(player.bingoCard.markedCells) ? player.bingoCard.markedCells : [];
      const alreadyMarked = marked.some((m) => {
        if (!m) return false;
        if (Array.isArray(m)) return m[0] === row && m[1] === col;
        return m.row === row && m.col === col;
      });

      if (!alreadyMarked) {
        const updatedPlayer = await Player.findOneAndUpdate(
          ownerFilter,
          {
            $set: {
              'bingoCard.markedCells': [...marked, { row, col }],
              'stats.numbersMarked': (player.stats?.numbersMarked || 0) + 1
            }
          },
          { new: true }
        );
        if (!updatedPlayer) {
          return socket.emit('error', { message: 'No tienes permisos para marcar esta celda' });
        }

        io.to(roomCode).emit('cell-marked', { playerId, row, col });
        logger.info(`[${roomCode}] Cell marked - Player: ${player.name}, Position: [${row},${col}], Value: ${cellValue}, Total marked: ${marked.length + 1}/25`);
      }
    } catch (error) {
      logger.error('Error in mark-cell:', error);
      socket.emit('error', { message: 'No se pudo marcar la celda' });
    }
  };
}

/**
 * Handler para actualizar puntos de un jugador
 */
function handleUpdatePoints(io, socket) {
  return async (data) => {
    try {
      const roomCode = socket.roomCode;
      const playerId = socket.playerId;
      const requestedRoomCode = typeof data?.roomCode === 'string' ? data.roomCode.toUpperCase() : '';
      const points = data?.points;
      if (!roomCode || !playerId || playerId === 'tv-display' ||
          requestedRoomCode !== roomCode.toUpperCase() ||
          data?.playerId?.toString() !== playerId.toString() ||
          !Number.isInteger(points) || points < -1000 || points > 1000) {
        return socket.emit('error', { message: 'No tienes permisos para actualizar estos puntos' });
      }

      const room = await Room.findOne({ code: roomCode });
      if (!room) return socket.emit('error', { message: 'Sala no encontrada' });
      const player = await Player.findOneAndUpdate(
        { _id: playerId, room: room._id, socketId: socket.id, isConnected: true },
        { $inc: { 'stats.points': points } },
        { new: true }
      );
      if (!player) return socket.emit('error', { message: 'No tienes permisos para actualizar estos puntos' });

      io.to(roomCode).emit('points-updated', {
        playerId,
        newPoints: player.stats.points
      });
      logger.info(`[${roomCode}] Points updated`, {
        playerId,
        pointsAdded: points,
        newTotal: player.stats.points
      });
    } catch (error) {
      logger.error('Error in update-points:', error);
      socket.emit('error', { message: 'No se pudieron actualizar los puntos' });
    }
  };
}

/**
 * Registra todos los handlers de jugador
 * @param {SocketIO} io
 * @param {Socket} socket
 */
function registerPlayerHandlers(io, socket) {
  socket.on('mark-cell', handleMarkCell(io, socket));
  socket.on('update-points', handleUpdatePoints(io, socket));
}

module.exports = {
  registerPlayerHandlers,
  // Exports individuales para testing
  handleMarkCell,
  handleUpdatePoints
};
