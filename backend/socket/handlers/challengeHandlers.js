const logger = require('../../config/logger');
const Room = require('../../models/Room');
const Player = require('../../models/Player');
const Game = require('../../models/Game');

const matchesBoundRoom = (socket, data) => {
  const requestedRoom = typeof data?.roomCode === 'string' ? data.roomCode.toUpperCase() : '';
  return !!socket.roomCode && requestedRoom === socket.roomCode.toUpperCase();
};

async function findBoundPlayer(socket, data) {
  if (!matchesBoundRoom(socket, data) || !socket.playerId || socket.playerId === 'tv-display' ||
      data?.playerId?.toString() !== socket.playerId.toString()) return null;
  const room = await Room.findOne({ code: socket.roomCode });
  if (!room) return null;
  const player = await Player.findOne({
    _id: socket.playerId,
    room: room._id,
    socketId: socket.id,
    isConnected: true
  });
  return player ? { room, player, playerId: player._id } : null;
}

async function findTriviaActor(socket, data) {
  if (socket.playerId !== 'tv-display') return findBoundPlayer(socket, data);
  if (socket.tvAuthorized !== true || !matchesBoundRoom(socket, data) || !data?.playerId) return null;
  const room = await Room.findOne({ code: socket.roomCode });
  const manualPlayer = room?.manualPlayers?.find((player) => player.playerId === data.playerId);
  return manualPlayer ? { room, playerId: manualPlayer.playerId, manualPlayer } : null;
}

async function findActiveChallengeActor(socket, data) {
  const actor = await findBoundPlayer(socket, data);
  if (!actor) return null;

  const game = await Game.findById(actor.room.currentGame);
  const activeChallenge = game?.activeChallenge;
  const challengePlayerId = activeChallenge?.player?._id || activeChallenge?.player;
  if (!activeChallenge || !challengePlayerId ||
      challengePlayerId.toString() !== actor.playerId.toString() ||
      (data?.type && data.type !== activeChallenge.type)) return null;

  return { ...actor, activeChallenge };
}

/**
 * Handler para responder un challenge de trivia
 */
function handleChallengeAnswer(io, socket) {
  return async (data) => {
    try {
      if ((data?.challengeId !== undefined &&
           (typeof data.challengeId !== 'string' || data.challengeId.length > 200)) ||
          (data.answer !== undefined && typeof data.answer !== 'string' && !Number.isInteger(data.answer))) {
        return socket.emit('error', { message: 'Datos de respuesta inválidos' });
      }
      const actor = await findActiveChallengeActor(socket, data);
      if (!actor) return socket.emit('error', { message: 'No tienes permisos para responder este challenge' });
      const { challengeId, answer } = data;
      const roomCode = actor.room.code;
      const playerId = actor.playerId;

      io.to(roomCode).emit('challenge-result', {
        playerId,
        challengeId,
        result: { answer }
      });

      logger.info(`[${roomCode}] Challenge answer submitted`, { playerId, challengeId });
    } catch (error) {
      logger.error('Error in challenge-answer:', error);
      socket.emit('error', { message: 'No se pudo registrar la respuesta del challenge' });
    }
  };
}

/**
 * Handler para marcar un challenge como completado
 */
function handleChallengeComplete(io, socket) {
  return async (data) => {
    try {
      if ((data?.challengeId !== undefined &&
           (typeof data.challengeId !== 'string' || data.challengeId.length > 200)) ||
          typeof data?.type !== 'string') {
        return socket.emit('error', { message: 'Datos de challenge inválidos' });
      }
      const actor = await findActiveChallengeActor(socket, data);
      if (!actor) return socket.emit('error', { message: 'No tienes permisos para completar este challenge' });
      const { challengeId, type } = data;
      const roomCode = actor.room.code;
      const playerId = actor.playerId;

      io.to(roomCode).emit('challenge-result', {
        playerId,
        challengeId,
        result: { type, success: true }
      });

      logger.info(`[${roomCode}] Challenge completed`, { playerId, challengeId, type });
    } catch (error) {
      logger.error('Error in challenge-complete:', error);
      socket.emit('error', { message: 'No se pudo completar el challenge' });
    }
  };
}

/**
 * Handler para completar un karaoke cuando el video termina
 */
function handleKaraokeVideoEnd(io, socket) {
  return async (data) => {
    try {
      const roomCode = typeof data?.roomCode === 'string' ? data.roomCode.toUpperCase() : '';
      if (socket.playerId !== 'tv-display' || socket.tvAuthorized !== true || !matchesBoundRoom(socket, data)) {
        return socket.emit('error', { message: 'Solo la pantalla de TV vinculada puede finalizar el karaoke' });
      }
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
      if (game.activeChallenge?.type !== 'karaoke') {
        return socket.emit('error', { message: 'No hay un karaoke activo' });
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
      io.to(roomCode).emit('challenge-completed', { success: true });
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
      socket.emit('error', { message: 'No se pudo completar el karaoke' });
    }
  };
}

/**
 * Handler para cuando un jugador responde una trivia
 */
function handleTriviaAnswered(io, socket) {
  return async (data) => {
    try {
      const actor = await findTriviaActor(socket, data);
      if (!actor) return socket.emit('error', { message: 'No tienes permisos para responder esta trivia' });
      const { answer } = data || {};
      const roomCode = actor.room.code;
      const playerId = actor.playerId;
      const game = await Game.findById(actor.room.currentGame);
      const activeChallenge = game?.activeChallenge;
      const challengePlayerId = activeChallenge?.player?._id || activeChallenge?.player;
      if (!activeChallenge || activeChallenge.type !== 'trivia' || !challengePlayerId ||
          challengePlayerId.toString() !== playerId.toString()) {
        return socket.emit('error', { message: 'No tienes permisos para responder esta trivia' });
      }

      const answerNum = Number(answer);
      const correctNum = Number(activeChallenge.data?.correct);
      const options = activeChallenge.data?.options;
      if (!Array.isArray(options) || !Number.isInteger(answerNum) ||
          answerNum < 0 || answerNum >= options.length ||
          !Number.isInteger(correctNum) || correctNum < 0 || correctNum >= options.length) {
        return socket.emit('error', { message: 'Respuesta de trivia inválida' });
      }
      const isCorrect = answerNum === correctNum;
      const challengeStartedAt = activeChallenge.startTime?.getTime?.() ?? null;

      logger.info(`[${roomCode}] Trivia answered`, {
        playerId,
        answerNum,
        isCorrect
      });

      // Crear el objeto de respuesta con valores numéricos
      const publicResponseData = {
        playerId,
        answer: answerNum,
        isCorrect
      };

      logger.info(`[${roomCode}] Broadcasting trivia result`);

      // Verificar quién está en la sala antes de emitir
      const roomSockets = await io.in(roomCode).fetchSockets();
      logger.info(`[${roomCode}] Sockets in room before emitting trivia-answered:`, roomSockets.length);
      roomSockets.forEach(s => {
        logger.info(`  - Socket ${s.id}: playerId=${s.playerId}`);
      });

      // Emitir a todos en la sala (incluyendo TV) la respuesta
      io.to(roomCode).emit('trivia-answered', publicResponseData);
      io.to(roomCode).emit('trivia-result-public', publicResponseData);
      socket.emit('trivia-result', {
        ...publicResponseData,
        correct: correctNum
      });
      logger.info(`[${roomCode}] ✅ trivia-answered emitted to room ${roomCode}`);

      // Esperar un momento antes de limpiar el challenge (para que el sonido se reproduzca)
      setTimeout(async () => {
        try {
          const currentActor = await findTriviaActor(socket, { roomCode, playerId });
          if (!currentActor) return;
          const room = currentActor.room;

          const currentGame = await Game.findById(room.currentGame);
          if (!currentGame) return;
          const currentChallengePlayerId = currentGame.activeChallenge?.player?._id ||
            currentGame.activeChallenge?.player;
          const currentChallengeStartedAt = currentGame.activeChallenge?.startTime?.getTime?.() ?? null;
          if (currentGame.activeChallenge?.type !== 'trivia' || !currentChallengePlayerId ||
              currentChallengePlayerId.toString() !== playerId.toString() ||
              (challengeStartedAt !== null && currentChallengeStartedAt !== challengeStartedAt)) return;

          // Limpiar solo el challenge cuya respuesta acaba de aceptarse.
          currentGame.activeChallenge = null;
          await currentGame.save();

          // Reanudar el juego
          room.gameState = 'playing';
          await room.save();

          // Emitir que el challenge se completó
          io.to(roomCode).emit('challenge-complete', { success: true });
          io.to(roomCode).emit('challenge-completed', { success: true });
          io.to(roomCode).emit('game-state-changed', { state: 'playing' });

          // Continuar con el siguiente número
          const gameHandlers = require('./gameHandlers');
          await gameHandlers.immediateNextNumber(io, roomCode);
          await gameHandlers.scheduleRoomInterval(io, roomCode);

          const { ensureWatchdog } = require('../utils/roomTimer');
          ensureWatchdog(roomCode, (rc) => gameHandlers.scheduleRoomInterval(io, rc), room.config);

          logger.info(`[${roomCode}] Trivia challenge completed, game resumed`);
        } catch (error) {
          logger.error('Error completing trivia challenge asynchronously:', error);
        }
      }, 3000); // Esperar 3 segundos para que el sonido se reproduzca
    } catch (error) {
      logger.error('Error in trivia-answered:', error);
      socket.emit('error', { message: 'No se pudo registrar la respuesta de trivia' });
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
