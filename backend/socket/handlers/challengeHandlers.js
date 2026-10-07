const logger = require('../../config/logger');

/**
 * Handler para responder un challenge de trivia
 */
function handleChallengeAnswer(io, socket) {
  return async (data) => {
    try {
      const { roomCode, playerId, challengeId, answer } = data;

      io.to(roomCode).emit('challenge-result', {
        playerId,
        challengeId,
        result: { answer }
      });

      logger.info(`[${roomCode}] Challenge answer submitted`, {
        playerId,
        challengeId,
        answer
      });
    } catch (error) {
      logger.error('Error in challenge-answer:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para marcar un challenge como completado
 */
function handleChallengeComplete(io, socket) {
  return async (data) => {
    try {
      const { roomCode, playerId, challengeId, type } = data;

      io.to(roomCode).emit('challenge-result', {
        playerId,
        challengeId,
        result: { type, success: true }
      });

      logger.info(`[${roomCode}] Challenge completed`, {
        playerId,
        challengeId,
        type
      });
    } catch (error) {
      logger.error('Error in challenge-complete:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para completar un karaoke cuando el video termina
 */
function handleKaraokeVideoEnd(io, socket) {
  return async (data) => {
    try {
      const { roomCode } = data;
      const Room = require('../../models/Room');
      const Game = require('../../models/Game');
      const gameHandlers = require('./gameHandlers');

      logger.info(`[${roomCode}] Karaoke video ended, completing challenge early`);

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        logger.warn(`[${roomCode}] Room not found`);
        return;
      }

      const game = await Game.findById(room.currentGame);
      if (!game) {
        logger.warn(`[${roomCode}] Game not found`);
        return;
      }

      // Limpiar el challenge activo
      game.activeChallenge = null;
      await game.save();

      // Reanudar el juego
      room.gameState = 'playing';
      await room.save();

      // IMPORTANTE: Emitir challenge-complete PRIMERO para que el frontend
      // actualice el flag antes de recibir game-state-changed
      io.to(roomCode).emit('challenge-complete', { success: true });
      io.to(roomCode).emit('game-state-changed', { state: 'playing' });

      // Llamar el siguiente número inmediatamente
      await gameHandlers.immediateNextNumber(io, roomCode);

      // Reanudar el intervalo automático del juego
      await gameHandlers.scheduleRoomInterval(io, roomCode);

      // Asegurar el watchdog
      const { ensureWatchdog } = require('../utils/roomTimer');
      ensureWatchdog(roomCode, (rc) => gameHandlers.scheduleRoomInterval(io, rc), room.config);

      logger.info(`[${roomCode}] Karaoke challenge completed by video end, game resumed`);
    } catch (error) {
      logger.error('Error in karaoke-video-end:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para cuando un jugador responde una trivia
 */
function handleTriviaAnswered(io, socket) {
  return async (data) => {
    try {
      const { roomCode, playerId, answer, correct } = data;
      const Room = require('../../models/Room');
      const Game = require('../../models/Game');

      // IMPORTANTE: Convertir a números para asegurar comparación correcta
      const answerNum = Number(answer);
      const correctNum = Number(correct);
      const isCorrect = answerNum === correctNum;

      logger.info(`[${roomCode}] Trivia answered`, {
        playerId,
        answer,
        correct,
        answerNum,
        correctNum,
        isCorrect,
        answerType: typeof answer,
        correctType: typeof correct
      });

      // Crear el objeto de respuesta con valores numéricos
      const responseData = {
        playerId,
        answer: answerNum,
        correct: correctNum,
        isCorrect
      };

      logger.info(`[${roomCode}] Broadcasting trivia-answered:`, responseData);

      // Verificar quién está en la sala antes de emitir
      const roomSockets = await io.in(roomCode).fetchSockets();
      logger.info(`[${roomCode}] Sockets in room before emitting trivia-answered:`, roomSockets.length);
      roomSockets.forEach(s => {
        logger.info(`  - Socket ${s.id}: playerId=${s.playerId}`);
      });

      // Emitir a todos en la sala (incluyendo TV) la respuesta
      io.to(roomCode).emit('trivia-answered', responseData);
      logger.info(`[${roomCode}] ✅ trivia-answered emitted to room ${roomCode}`);

      // Esperar un momento antes de limpiar el challenge (para que el sonido se reproduzca)
      setTimeout(async () => {
        const room = await Room.findOne({ code: roomCode });
        if (!room) return;

        const game = await Game.findById(room.currentGame);
        if (!game) return;

        // Limpiar el challenge activo
        game.activeChallenge = null;
        await game.save();

        // Reanudar el juego
        room.gameState = 'playing';
        await room.save();

        // Emitir que el challenge se completó
        io.to(roomCode).emit('challenge-complete', { success: true });
        io.to(roomCode).emit('game-state-changed', { state: 'playing' });

        // Continuar con el siguiente número
        const gameHandlers = require('./gameHandlers');
        await gameHandlers.immediateNextNumber(io, roomCode);
        await gameHandlers.scheduleRoomInterval(io, roomCode);

        const { ensureWatchdog } = require('../utils/roomTimer');
        ensureWatchdog(roomCode, (rc) => gameHandlers.scheduleRoomInterval(io, rc), room.config);

        logger.info(`[${roomCode}] Trivia challenge completed, game resumed`);
      }, 3000); // Esperar 3 segundos para que el sonido se reproduzca
    } catch (error) {
      logger.error('Error in trivia-answered:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Registra todos los handlers de challenges
 * @param {SocketIO} io
 * @param {Socket} socket
 */
function registerChallengeHandlers(io, socket) {
  socket.on('challenge-answer', handleChallengeAnswer(io, socket));
  socket.on('challenge-complete', handleChallengeComplete(io, socket));
  socket.on('trivia-answered', handleTriviaAnswered(io, socket));
  socket.on('karaoke-video-end', handleKaraokeVideoEnd(io, socket));
}

module.exports = {
  registerChallengeHandlers,
  // Exports individuales para testing
  handleChallengeAnswer,
  handleChallengeComplete,
  handleKaraokeVideoEnd
};
