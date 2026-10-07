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
      const { roomCode, playerId, row, col } = data;

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }

      const game = room.currentGame ? await Game.findById(room.currentGame) : null;
      const player = await Player.findById(playerId);

      if (!player) {
        return socket.emit('error', { message: 'Jugador no encontrado' });
      }

      // Obtener número en la celda seleccionada
      const cellValue = player.bingoCard?.matrix?.[row]?.[col];

      if (!cellValue || cellValue === 'BINGO') {
        return socket.emit('error', { message: 'Celda inválida' });
      }

      // Validar contra números cantados si hay juego activo
      if (game && Array.isArray(game.calledNumbers) && !game.calledNumbers.includes(cellValue)) {
        return socket.emit('error', { message: 'Número no ha sido cantado' });
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

      if (!alreadyMarked) {
        marked.push({ row, col });
        player.bingoCard.markedCells = marked;
        player.stats.numbersMarked = (player.stats.numbersMarked || 0) + 1;
        await player.save();

        io.to(roomCode).emit('cell-marked', { playerId, row, col });

        logger.info(`[${roomCode}] Cell marked - Player: ${player.name}, Position: [${row},${col}], Value: ${cellValue}, Total marked: ${marked.length}/25`);
      }
    } catch (error) {
      logger.error('Error in mark-cell:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para actualizar puntos de un jugador
 */
function handleUpdatePoints(io, socket) {
  return async (data) => {
    try {
      const { roomCode, playerId, points } = data;

      const player = await Player.findById(playerId);

      if (!player) {
        return socket.emit('error', { message: 'Jugador no encontrado' });
      }

      player.stats.points += points;
      await player.save();

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
      socket.emit('error', { message: error.message });
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
