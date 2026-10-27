const logger = require('../../config/logger');
const Room = require('../../models/Room');
const Player = require('../../models/Player');
const Game = require('../../models/Game');
const { getChallengePoints } = require('../../utils/challengeRules');

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
  const participantIds = Array.isArray(activeChallenge?.participants)
    ? activeChallenge.participants.map(participant => participant.playerId?.toString())
    : [];
  const isParticipant = activeChallenge?.type === 'group'
    ? participantIds.includes(actor.playerId.toString())
    : challengePlayerId?.toString() === actor.playerId.toString();
  if (!activeChallenge || (!challengePlayerId && !isParticipant) || !isParticipant ||
      (data?.type && data.type !== activeChallenge.type)) return null;

  return { ...actor, game, activeChallenge };
}

async function finishChallenge(io, actor, { result, pointsPlayerIds = [], broadcastResult = true }) {
  const { room, game, activeChallenge } = actor;
  const roomCode = room.code;
  const challengeId = activeChallenge.id;
  const gameHandlers = require('./gameHandlers');

  activeChallenge.status = 'completed';
  activeChallenge.completedAt = new Date();
  activeChallenge.result = result;
  activeChallenge.pointsAwarded = true;
  game.gameEvents = Array.isArray(game.gameEvents) ? game.gameEvents : [];
  game.gameEvents.push({
    type: 'challenge_completed',
    player: activeChallenge.player,
    data: {
      challengeId,
      challengeType: activeChallenge.type,
      result,
      responses: activeChallenge.responses || []
    },
    timestamp: new Date()
  });
  game.activeChallenge = null;
  if (typeof game.save === 'function') await game.save();

  const uniquePlayerIds = [...new Set(pointsPlayerIds.map(playerId => playerId?.toString()).filter(Boolean))];
  for (const playerId of uniquePlayerIds) {
    if (typeof Player.findOneAndUpdate !== 'function') continue;
    await Player.findOneAndUpdate(
      { _id: playerId, room: room._id },
      { $inc: { 'stats.points': result.points || 0, 'stats.challengesCompleted': 1 } }
    );
  }

  if (typeof gameHandlers.clearChallengeTimer === 'function') {
    gameHandlers.clearChallengeTimer(roomCode);
  }
  room.gameState = 'playing';
  if (typeof room.save === 'function') await room.save();

  if (broadcastResult) {
    io.to(roomCode).emit('challenge-result', {
      playerId: activeChallenge.player,
      challengeId,
      result
    });
  }
  io.to(roomCode).emit('challenge-complete', { success: true, result });
  io.to(roomCode).emit('challenge-completed', { success: true, result });
  io.to(roomCode).emit('game-state-changed', { state: 'playing' });

  await gameHandlers.immediateNextNumber(io, roomCode);
  await gameHandlers.scheduleRoomInterval(io, roomCode);
  const { ensureWatchdog } = require('../utils/roomTimer');
  ensureWatchdog(roomCode, (rc) => gameHandlers.scheduleRoomInterval(io, rc), room.config);
}

async function appendGroupResponse(actor, response) {
  const challengeId = actor.activeChallenge.id;
  const playerId = response.playerId;

  if (actor.game._id && typeof Game.findOneAndUpdate === 'function') {
    const updatedGame = await Game.findOneAndUpdate(
      {
        _id: actor.game._id,
        'activeChallenge.id': challengeId,
        'activeChallenge.type': 'group',
        'activeChallenge.responses.playerId': { $ne: playerId }
      },
      { $push: { 'activeChallenge.responses': response } },
      { new: true }
    );

    return updatedGame
      ? { ...actor, game: updatedGame, activeChallenge: updatedGame.activeChallenge }
      : null;
  }

  const responses = Array.isArray(actor.activeChallenge.responses)
    ? actor.activeChallenge.responses
    : [];
  if (responses.some(existing => existing.playerId?.toString() === playerId.toString())) {
    return null;
  }

  actor.activeChallenge.responses = [...responses, response];
  await actor.game.save();
  return actor;
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

      if (challengeId && actor.activeChallenge.id && challengeId !== actor.activeChallenge.id) {
        return socket.emit('error', { message: 'El desafío ya no está activo' });
      }

      if (actor.activeChallenge.type === 'riddle') {
        if (typeof answer !== 'string' || answer.trim().length === 0 || answer.length > 200) {
          return socket.emit('error', { message: 'La respuesta de la adivinanza es inválida' });
        }
        const responses = Array.isArray(actor.activeChallenge.responses)
          ? actor.activeChallenge.responses
          : [];
        if (responses.some(response => response.playerId?.toString() === playerId.toString())) {
          return socket.emit('error', { message: 'Ya respondiste este desafío' });
        }
        const { evaluateRiddleAnswer } = require('../../utils/challengeRules');
        const isCorrect = evaluateRiddleAnswer(answer, actor.activeChallenge.data?.answers);
        const points = getChallengePoints('riddle', { success: isCorrect, configuredPoints: actor.activeChallenge.points });
        actor.activeChallenge.responses = [
          ...responses,
          { playerId, answer, success: isCorrect, points, submittedAt: new Date() }
        ];
        actor.activeChallenge.status = 'evaluating';
        actor.activeChallenge.result = { answer, success: isCorrect, points };
        socket.emit('challenge-result', {
          playerId,
          challengeId,
          result: { answer, success: isCorrect, points }
        });
        io.to(roomCode).emit('challenge-result-public', {
          playerId,
          challengeId,
          result: { answer }
        });
        await finishChallenge(io, actor, {
          result: { answer, success: isCorrect, points },
          pointsPlayerIds: [playerId],
          broadcastResult: false
        });
        return;
      }

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

      if (actor.activeChallenge.type === 'group') {
        const points = getChallengePoints(type, { success: true, configuredPoints: actor.activeChallenge.points });
        const groupActor = await appendGroupResponse(actor, {
          playerId,
          success: true,
          points,
          submittedAt: new Date()
        });
        if (!groupActor) {
          return socket.emit('error', { message: 'Ya respondiste este desafío o ya finalizó' });
        }

        const participantIds = (Array.isArray(groupActor.activeChallenge.participants)
          ? groupActor.activeChallenge.participants
          : [])
          .map(participant => participant.playerId?.toString())
          .filter(Boolean);
        const responseIds = new Set((groupActor.activeChallenge.responses || [])
          .map(response => response.playerId?.toString()));
        const allParticipantsCompleted = participantIds.length > 0 &&
          participantIds.every(participantId => responseIds.has(participantId));

        if (!allParticipantsCompleted) {
          socket.emit('challenge-result', {
            playerId,
            challengeId,
            result: { type, success: true, points }
          });
          return;
        }

        await finishChallenge(io, groupActor, {
          result: { type, success: true, points },
          pointsPlayerIds: groupActor.activeChallenge.responses.map(response => response.playerId)
        });
        logger.info(`[${roomCode}] Group challenge completed`, { playerId, challengeId, type });
        return;
      }

      const points = getChallengePoints(type, { success: true, configuredPoints: actor.activeChallenge.points });
      const responses = Array.isArray(actor.activeChallenge.responses)
        ? actor.activeChallenge.responses
        : [];
      if (responses.some(response => response.playerId?.toString() === playerId.toString())) {
        return socket.emit('error', { message: 'Ya completaste este desafío' });
      }
      actor.activeChallenge.responses = [
        ...responses,
        { playerId, success: true, points, submittedAt: new Date() }
      ];

      const participantIds = actor.activeChallenge.type === 'group'
        ? (Array.isArray(actor.activeChallenge.participants) ? actor.activeChallenge.participants : [])
          .map(participant => participant.playerId?.toString()).filter(Boolean)
        : [playerId.toString()];
      const responseIds = new Set(actor.activeChallenge.responses.map(response => response.playerId?.toString()));
      const allParticipantsCompleted = participantIds.every(participantId => responseIds.has(participantId));
      if (!allParticipantsCompleted) {
        await actor.game.save();
        socket.emit('challenge-result', { playerId, challengeId, result: { type, success: true, points } });
        return;
      }

      await finishChallenge(io, actor, {
        result: { type, success: true, points },
        pointsPlayerIds: actor.activeChallenge.type === 'group'
          ? actor.activeChallenge.responses.map(response => response.playerId)
          : [playerId]
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

      const karaokePlayerId = game.activeChallenge.player?._id || game.activeChallenge.player;
      const karaokePoints = getChallengePoints('karaoke', { success: true, configuredPoints: game.activeChallenge.points });
      if (karaokePlayerId && typeof Player.findOneAndUpdate === 'function') {
        await Player.findOneAndUpdate(
          { _id: karaokePlayerId, room: room._id },
          { $inc: { 'stats.points': karaokePoints, 'stats.challengesCompleted': 1 } }
        );
      }

      // Limpiar el challenge activo
      game.activeChallenge = null;
      await game.save();
      const clearChallengeTimer = require('./gameHandlers').clearChallengeTimer;
      if (typeof clearChallengeTimer === 'function') clearChallengeTimer(roomCode);

      // Reanudar el juego
      room.gameState = 'playing';
      await room.save();

      // IMPORTANTE: Emitir challenge-complete PRIMERO para que el frontend
      // actualice el flag antes de recibir game-state-changed
      io.to(roomCode).emit('challenge-complete', { success: true, result: { points: karaokePoints } });
      io.to(roomCode).emit('challenge-completed', {
        success: true,
        result: { points: karaokePoints }
      });
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

      const existingResponses = Array.isArray(activeChallenge.responses) ? activeChallenge.responses : [];
      if (existingResponses.some(response => response.playerId?.toString() === playerId.toString())) {
        return socket.emit('error', { message: 'Ya respondiste este desafío' });
      }
      const points = getChallengePoints('trivia', { success: isCorrect, configuredPoints: activeChallenge.points });
      activeChallenge.responses = [
        ...existingResponses,
        { playerId, answer: answerNum, success: isCorrect, points, submittedAt: new Date() }
      ];
      activeChallenge.status = 'evaluating';
      activeChallenge.result = { answer: answerNum, success: isCorrect, points };
      if (typeof game.save === 'function') await game.save();

      if (typeof Player.findOneAndUpdate === 'function' && playerId && actor.room?._id) {
        const statUpdate = {
          'stats.triviaAttempted': 1,
          'stats.points': points
        };
        if (isCorrect) statUpdate['stats.triviaCorrect'] = 1;
        await Player.findOneAndUpdate(
          { _id: playerId, room: actor.room._id },
          { $inc: statUpdate }
        );
      }

      logger.info(`[${roomCode}] Trivia answered`, {
        playerId,
        answerNum,
        isCorrect
      });

      // Crear el objeto de respuesta con valores numéricos
      const publicResponseData = {
        playerId,
        answer: answerNum
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
        correct: correctNum,
        isCorrect,
        points
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

          currentGame.activeChallenge.status = 'completed';
          currentGame.activeChallenge.completedAt = new Date();
          currentGame.activeChallenge.endTime = new Date();
          currentGame.activeChallenge.result = {
            answer: answerNum,
            isCorrect,
            points,
            correct: correctNum
          };

          // Limpiar solo el challenge cuya respuesta acaba de aceptarse.
          currentGame.activeChallenge = null;
          await currentGame.save();

          // Reanudar el juego
          room.gameState = 'playing';
          await room.save();

          // Emitir que el challenge se completó
          io.to(roomCode).emit('trivia-result-public', {
            playerId,
            answer: answerNum,
            isCorrect,
            points,
            correct: correctNum
          });
          io.to(roomCode).emit('challenge-complete', { success: true, result: { isCorrect, points } });
          io.to(roomCode).emit('challenge-completed', { success: true, result: { isCorrect, points } });
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
