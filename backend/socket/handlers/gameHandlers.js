const Room = require('../../models/Room');
const Player = require('../../models/Player');
const Game = require('../../models/Game');
const logger = require('../../config/logger');
const { GAME_CONSTANTS } = require('../../constants');
const { isRoomHost, emitPermissionError } = require('../../middleware/socketAuthMiddleware');
const {
  getNextChallengeType,
  selectRandomChallenge,
  selectEligiblePlayers,
  selectRandomPlayer,
  createChallengeData,
  initializeChallengePools
} = require('../utils/challengeSelector');
const {
  selectRandomNumber,
  updateGameAfterNumberCall,
  hasAvailableNumbers,
  shouldTriggerChallenge: checkChallenge
} = require('../utils/numberCaller');
const {
  roomTimers,
  recordNumberCall,
  getNextSongId,
  getIntervalMs,
  ensureWatchdog,
  createRoomInterval,
  clearRoomInterval
} = require('../utils/roomTimer');
const { updateRoomActivity } = require('../../utils/roomActivity');

/**
 * Llama el siguiente número inmediatamente sin esperar el intervalo
 */
async function immediateNextNumber(io, roomCode) {
  const room = await Room.findOne({ code: roomCode });
  const game = await Game.findById(room.currentGame);

  if (!hasAvailableNumbers(game)) {
    logger.warn(`[${roomCode}] No available numbers for immediate call`);
    return;
  }

  const selected = selectRandomNumber(game.availableNumbers);
  if (!selected) return;

  const { number: nextNum, index } = selected;

  updateGameAfterNumberCall(game, nextNum, index);
  await game.save();

  recordNumberCall(roomCode);

  io.to(roomCode).emit('number-called', {
    number: nextNum,
    calledNumbers: game.calledNumbers
  });

  const nextSong = getNextSongId(roomCode);
  io.to(roomCode).emit('music-song-change', { roomCode, songId: nextSong });
  io.to(roomCode).emit('music-sync', {
    isPlaying: true,
    currentSongId: nextSong,
    currentTime: 0
  });

  logger.logGameEvent(roomCode, `Immediate number called: ${nextNum}`);
}

/**
 * Dispara un reto/challenge
 */
async function triggerChallenge(io, roomCode) {
  try {
    logger.info(`[${roomCode}] triggerChallenge called`);

    const room = await Room.findOne({ code: roomCode }).populate('players');
    if (!room) {
      logger.warn(`[${roomCode}] Room not found when triggering challenge`);
      return;
    }

    const game = await Game.findById(room.currentGame);
    if (!game) {
      logger.warn(`[${roomCode}] Game not found when triggering challenge`);
      return;
    }

  // Obtener lista de jugadores que ya han participado
  let recentPlayers = game.usedPlayers || [];

  // Combinar jugadores digitales y manuales
  const manualPlayersFormatted = (room.manualPlayers || []).map(mp => ({
    _id: mp.playerId,
    name: mp.playerName,
    cardNumber: mp.cardNumber,
    isManual: true
    // No tiene isConnected, lo cual permite que selectEligiblePlayers lo identifique como manual
  }));

  const allPlayers = [...room.players, ...manualPlayersFormatted];
  logger.info(`[${roomCode}] Total players: ${room.players.length} digital + ${manualPlayersFormatted.length} manual = ${allPlayers.length}`);

  // Obtener todos los jugadores elegibles (digitales: conectados con cartón, manuales: con cartón)
  const allEligiblePlayers = allPlayers.filter(p => {
    const hasValidCard = p.cardNumber !== undefined && p.cardNumber !== null;
    // Jugadores manuales (sin isConnected) siempre son elegibles si tienen cartón
    if (p.isConnected === undefined) {
      return hasValidCard;
    }
    // Jugadores digitales deben estar conectados
    return p.isConnected && hasValidCard;
  });

  logger.info(`[${roomCode}] Total eligible players: ${allEligiblePlayers.length}`);
  logger.info(`[${roomCode}] Recent players: ${recentPlayers.length}`);

  // Si no hay jugadores elegibles, continuar el juego
  if (allEligiblePlayers.length === 0) {
    logger.info(`[${roomCode}] No eligible players for challenge, continuing game`);
    await scheduleRoomInterval(io, roomCode);
    ensureWatchdog(roomCode, (rc) => scheduleRoomInterval(io, rc), room.config);
    return;
  }

  // Verificar si todos los jugadores elegibles ya han participado (completaron la ronda)
  const allHaveParticipated = allEligiblePlayers.every(p => {
    const playerId = p._id ? p._id.toString() : p.playerId;
    return recentPlayers.some(recentId => {
      // Convertir a string para comparación (puede ser ObjectId o String)
      const recentIdStr = typeof recentId === 'string' ? recentId : recentId.toString();
      return recentIdStr === playerId;
    });
  });

  if (allHaveParticipated && recentPlayers.length > 0) {
    logger.info(`[${roomCode}] ♻️ All ${allEligiblePlayers.length} players have participated - Starting new round`);
    game.usedPlayers = []; // Limpiar para nueva ronda
    recentPlayers = []; // Actualizar variable local
  }

  // Seleccionar jugadores que no han participado recientemente (incluye digitales y manuales)
  const eligiblePlayers = selectEligiblePlayers(allPlayers, recentPlayers);
  logger.info(`[${roomCode}] Eligible players for selection: ${eligiblePlayers.length}`);

  // Seleccionar jugador aleatorio
  const chosenPlayer = selectRandomPlayer(eligiblePlayers);
  logger.info(`[${roomCode}] ✅ Chosen player: ${chosenPlayer.name}`);

  // Obtener el siguiente tipo de reto basado en el último tipo del juego
  const lastType = game.lastChallengeType || null;
  const nextType = getNextChallengeType(lastType);

  logger.info(`[${roomCode}] Challenge type: ${nextType} (previous: ${lastType})`);

  // Seleccionar el reto del pool sin repetición
  const { challenge, updatedPools } = selectRandomChallenge(nextType, game.availablePools);
  if (!challenge) {
    logger.warn(`[${roomCode}] No challenge available for type ${nextType}`);
    return;
  }

  // Actualizar los pools disponibles en el juego
  game.availablePools = updatedPools;
  game.lastChallengeType = nextType;

  logger.info(`[${roomCode}] Challenge selected from pool - Remaining: trivia=${updatedPools.trivia.length}, dance=${updatedPools.dance.length}, karaoke=${updatedPools.karaoke.length}`);

  // Crear datos del reto
  const challengeData = createChallengeData(nextType, chosenPlayer, challenge);
  console.log('🎯 Challenge data being sent:', JSON.stringify(challengeData, null, 2));

  // Guardar en el juego
  game.activeChallenge = {
    type: nextType,
    player: chosenPlayer._id,
    data: nextType === GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA
      ? { question: challenge.question, options: challenge.options, correct: challenge.correct }
      : challenge.text || challenge,
    text: challenge.text,
    deezerId: challenge.deezerId,
    startTime: new Date()
  };
  game.numbersSinceChallenge = 0;

  // Agregar jugador a usedPlayers
  if (!game.usedPlayers) game.usedPlayers = [];
  game.usedPlayers.push(chosenPlayer._id);

  await game.save();

  // Pausar el juego
  room.gameState = 'paused';
  await room.save();

  // Emitir eventos
  io.to(roomCode).emit('game-state-changed', { state: 'paused' });

  // Para trivia y karaoke, emitir solo al jugador seleccionado y a la TV
  logger.info(`[${roomCode}] Challenge type is: ${nextType}`);
  logger.info(`[${roomCode}] Chosen player data:`, JSON.stringify({
    id: chosenPlayer._id,
    name: chosenPlayer.name,
    socketId: chosenPlayer.socketId,
    isConnected: chosenPlayer.isConnected
  }));

  // TRIVIA y KARAOKE: solo jugador seleccionado + TV
  if (nextType === GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA ||
      nextType === GAME_CONSTANTS.CHALLENGE_TYPES.KARAOKE) {

    logger.info(`[${roomCode}] 🎯 ${nextType.toUpperCase()} DETECTED - Sending only to player and TV`);

    // Emitir al jugador seleccionado
    if (chosenPlayer.socketId) {
      io.to(chosenPlayer.socketId).emit('challenge-triggered', challengeData);
      logger.info(`[${roomCode}] ✅ Sent to player ${chosenPlayer.name} (${chosenPlayer.socketId})`);
    } else {
      logger.warn(`[${roomCode}] ❌ Player ${chosenPlayer.name} has no socketId!`);
    }

    // Buscar y emitir a la TV
    const roomSockets = await io.in(roomCode).fetchSockets();
    logger.info(`[${roomCode}] Found ${roomSockets.length} sockets in room`);
    roomSockets.forEach(s => {
      logger.info(`  - Socket ${s.id}: playerId=${s.playerId}`);
    });

    const tvSocket = roomSockets.find(s => s.playerId === 'tv-display');
    if (tvSocket) {
      tvSocket.emit('challenge-triggered', challengeData);
      logger.info(`[${roomCode}] ✅ Sent to TV (${tvSocket.id})`);
    } else {
      logger.warn(`[${roomCode}] ❌ TV socket not found!`);
    }
  } else {
    logger.info(`[${roomCode}] Other challenge type (${nextType}) - sending to all`);
    // Para otros challenges (dance, group), emitir a todos
    io.to(roomCode).emit('challenge-triggered', challengeData);
  }

  logger.logGameEvent(roomCode, 'Challenge triggered', {
    type: nextType,
    player: chosenPlayer.name,
    text: challenge.text
  });

  // Countdown timer
  let timeLeft = GAME_CONSTANTS.CHALLENGE_DURATION;
  const countdownInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft >= 0) {
      io.to(roomCode).emit('challenge-countdown', { timeLeft });
    }
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);

  // Después de 30 segundos, completar el reto
  setTimeout(async () => {
    clearInterval(countdownInterval);

    const updatedRoom = await Room.findOne({ code: roomCode });
    if (!updatedRoom) return;

    const updatedGame = await Game.findById(updatedRoom.currentGame);
    if (!updatedGame) return;

    updatedGame.activeChallenge = null;
    await updatedGame.save();

    updatedRoom.gameState = 'playing';
    await updatedRoom.save();

    // IMPORTANTE: Emitir challenge-complete PRIMERO para que el frontend
    // actualice el flag antes de recibir game-state-changed
    io.to(roomCode).emit('challenge-complete', { success: true });
    io.to(roomCode).emit('game-state-changed', { state: 'playing' });

    await immediateNextNumber(io, roomCode);
    await scheduleRoomInterval(io, roomCode);
    ensureWatchdog(roomCode, (rc) => scheduleRoomInterval(io, rc), updatedRoom.config);
  }, GAME_CONSTANTS.CHALLENGE_DURATION * 1000);
  } catch (error) {
    logger.error(`[${roomCode}] ❌ CRITICAL ERROR in triggerChallenge:`, error);
    logger.error(`[${roomCode}] Error stack:`, error.stack);
    // Intentar reanudar el juego para que no se quede stuck
    try {
      const room = await Room.findOne({ code: roomCode });
      if (room) {
        room.gameState = 'playing';
        await room.save();
        io.to(roomCode).emit('game-state-changed', { state: 'playing' });
        await scheduleRoomInterval(io, roomCode);
        ensureWatchdog(roomCode, (rc) => scheduleRoomInterval(io, rc), room.config);
        logger.info(`[${roomCode}] ✅ Game resumed after challenge error`);
      }
    } catch (recoveryError) {
      logger.error(`[${roomCode}] Failed to recover from challenge error:`, recoveryError);
    }
  }
}

/**
 * Programa el intervalo para llamar números automáticamente
 */
async function scheduleRoomInterval(io, roomCode) {
  logger.info(`[${roomCode}] Setting up interval timer`);

  const room = await Room.findOne({ code: roomCode }).populate('players');
  const intervalMs = getIntervalMs(room.config);

  // Log info sobre jugadores
  const connectedDigital = room.players.filter(p => p.isConnected).length;
  const manualCount = (room.manualPlayers || []).length;
  logger.info(`[${roomCode}] Interval set to ${intervalMs / 1000} seconds. Players: ${connectedDigital} digital + ${manualCount} manual`);

  createRoomInterval(roomCode, intervalMs, async (rc) => {
    logger.info(`[${rc}] ⏰ Interval triggered`);

    try {
      const currentRoom = await Room.findOne({ code: rc }).populate('players');
      if (!currentRoom) {
        logger.warn(`[${rc}] Room not found, clearing interval`);
        clearRoomInterval(rc);
        return;
      }

      // Log estado de jugadores en cada intervalo
      const digitalConnected = currentRoom.players.filter(p => p.isConnected).length;
      const manualPlayers = (currentRoom.manualPlayers || []).length;
      logger.info(`[${rc}] Current players: ${digitalConnected} digital connected + ${manualPlayers} manual = ${digitalConnected + manualPlayers} total`);

      // Si el juego está pausado, no llamar número
      if (currentRoom.gameState === 'paused') {
        logger.info(`[${rc}] Game is paused, skipping number call`);
        return;
      }

      const currentGame = await Game.findById(currentRoom.currentGame);
      if (!currentGame) {
        logger.warn(`[${rc}] Game not found`);
        return;
      }

      // PRIMERO: Verificar si debe disparar challenge ANTES de cantar el número
      const freq = currentRoom.config?.challengeFrequency || GAME_CONSTANTS.CHALLENGE_FREQUENCY;
      const numsSinceChallenge = currentGame.numbersSinceChallenge || 0;

      const timestamp = new Date().toISOString();
      logger.info(`[${rc}] ⏰ ${timestamp} - Interval triggered. Numbers since last challenge: ${numsSinceChallenge}/${freq}`);

      const willTriggerChallenge = checkChallenge(numsSinceChallenge, freq);

      if (willTriggerChallenge) {
        // Si debe disparar challenge, NO cantar número, solo disparar challenge
        logger.info(`[${rc}] ⚠️  ${timestamp} - Challenge frequency reached (${numsSinceChallenge} >= ${freq}), triggering challenge NOW`);
        clearRoomInterval(rc);
        await triggerChallenge(io, rc);
        return; // No cantar número, el challenge lo hará después
      }

      // SEGUNDO: Si NO debe disparar challenge, cantar el número
      if (!hasAvailableNumbers(currentGame)) {
        logger.warn(`[${rc}] No more numbers available`);
        return;
      }

      const selected = selectRandomNumber(currentGame.availableNumbers);
      if (!selected) return;

      const { number: nextNum, index } = selected;

      const callTimestamp = new Date().toISOString();
      logger.info(`[${rc}] 📞 ${callTimestamp} - Calling number: ${nextNum}`);

      updateGameAfterNumberCall(currentGame, nextNum, index);
      await currentGame.save();

      const afterUpdate = currentGame.numbersSinceChallenge;
      logger.info(`[${rc}] 📈 Numbers since challenge incremented to: ${afterUpdate}`);

      recordNumberCall(rc);

      io.to(rc).emit('number-called', {
        number: nextNum,
        calledNumbers: currentGame.calledNumbers
      });

      // Emitir music-sync después de cantar el número
      const nextSong = getNextSongId(rc);
      io.to(rc).emit('music-song-change', { roomCode: rc, songId: nextSong });
      io.to(rc).emit('music-sync', {
        isPlaying: true,
        currentSongId: nextSong,
        currentTime: 0
      });
      logger.info(`[${rc}] Music synced, song ID: ${nextSong}`);
    } catch (error) {
      logger.error(`[${rc}] ❌ CRITICAL ERROR in interval:`, error);
      logger.error(`[${rc}] Error stack:`, error.stack);
      // NO limpiar el intervalo aquí, dejar que el watchdog lo maneje
      // El intervalo continuará intentando en el próximo tick
    }
  });

  logger.info(`[${roomCode}] ✅ Interval scheduled successfully`);
}

/**
 * Handler para iniciar el juego
 */
function handleStartGame(io, socket) {
  return async (data) => {
    try {
      const { roomCode } = data;

      logger.info(`[${roomCode}] Game start requested`);

      const room = await Room.findOne({ code: roomCode });

      // Verificar permisos de host
      if (!(await isRoomHost(socket, room))) {
        logger.warn(`[${roomCode}] Unauthorized start-game attempt by socket ${socket.id}`);
        return emitPermissionError(socket);
      }

      const game = new Game({
        room: room._id,
        startTime: new Date(),
        availablePools: initializeChallengePools(),
        lastChallengeType: null
      });
      await game.save();

      logger.info(`[${roomCode}] Game created with ID: ${game._id}`);

      room.currentGame = game._id;
      room.gameState = 'playing';
      await room.save();

      // Actualizar timestamp de actividad
      await updateRoomActivity(roomCode);

      io.to(roomCode).emit('game-started', { gameId: game._id });
      io.to(roomCode).emit('game-state-changed', { state: 'playing' });

      logger.logGameEvent(roomCode, 'Game started');

      // Countdown antes del primer número
      let count = GAME_CONSTANTS.COUNTDOWN_DURATION;
      io.to(roomCode).emit('countdown-tick', { value: count });

      const cdId = setInterval(async () => {
        count -= 1;
        io.to(roomCode).emit('countdown-tick', { value: count });

        if (count <= 0) {
          clearInterval(cdId);
          logger.info(`[${roomCode}] Countdown finished, calling first number`);

          await immediateNextNumber(io, roomCode);
          await scheduleRoomInterval(io, roomCode);
          ensureWatchdog(roomCode, (rc) => scheduleRoomInterval(io, rc), room.config);
        }
      }, 1000);
    } catch (error) {
      const errorRoomCode = data?.roomCode || 'unknown';
      logger.error(`[${errorRoomCode}] Error in start-game:`, error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para cambiar el estado del juego
 */
function handleGameStateChange(io, socket) {
  return async (data) => {
    try {
      const { roomCode, state } = data;

      const room = await Room.findOne({ code: roomCode });

      if (room) {
        // Verificar permisos de host
        const hasPermission = await isRoomHost(socket, room);
        if (!hasPermission) {
          logger.warn(`[${roomCode}] Unauthorized game-state-change attempt by socket ${socket.id}`);
          return emitPermissionError(socket);
        }

        room.gameState = state;
        await room.save();

        io.to(roomCode).emit('game-state-changed', { state });

        logger.logGameEvent(roomCode, `Game state changed to: ${state}`);
      }
    } catch (error) {
      logger.error('Error in game-state-change:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para reiniciar el juego
 */
function handleResetGame(io, socket) {
  return async (data) => {
    try {
      const { roomCode } = data;

      const room = await Room.findOne({ code: roomCode });

      // Verificar permisos de host
      if (room) {
        const hasPermission = await isRoomHost(socket, room);
        if (!hasPermission) {
          logger.warn(`[${roomCode}] Unauthorized reset-game attempt by socket ${socket.id}`);
          return emitPermissionError(socket);
        }
      }

      if (room && room.currentGame) {
        const game = await Game.findById(room.currentGame);
        if (game) {
          game.calledNumbers = [];
          game.currentNumber = null;
          game.availableNumbers = Array.from({ length: GAME_CONSTANTS.MAX_NUMBER }, (_, i) => i + 1);
          await game.save();
        }
      }

      io.to(roomCode).emit('game-reset');

      logger.logGameEvent(roomCode, 'Game reset');
    } catch (error) {
      logger.error('Error in reset-game:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para iniciar countdown
 */
function handleStartCountdown(io, socket) {
  return async (data) => {
    try {
      const { roomCode } = data;

      io.to(roomCode).emit('countdown-started');

      logger.logGameEvent(roomCode, 'Countdown started');
    } catch (error) {
      logger.error('Error in start-countdown:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para pausar el juego
 */
function handlePauseGame(io, socket) {
  return async (data) => {
    try {
      const { roomCode } = data;

      logger.info(`[${roomCode}] Pause game requested by TV display`);

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        logger.warn(`[${roomCode}] Room not found for pause`);
        return;
      }

      room.gameState = 'paused';
      await room.save();

      io.to(roomCode).emit('game-state-changed', { state: 'paused' });
      io.to(roomCode).emit('music-sync', { isPlaying: false });

      logger.logGameEvent(roomCode, 'Game paused by TV display');
    } catch (error) {
      logger.error('Error in pause-game:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para reanudar el juego
 */
function handleResumeGame(io, socket) {
  return async (data) => {
    try {
      const { roomCode } = data;

      logger.info(`[${roomCode}] Resume game requested by TV display`);

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        logger.warn(`[${roomCode}] Room not found for resume`);
        return;
      }

      room.gameState = 'playing';
      await room.save();

      io.to(roomCode).emit('game-state-changed', { state: 'playing' });
      io.to(roomCode).emit('music-sync', { isPlaying: true });

      logger.logGameEvent(roomCode, 'Game resumed by TV display');
    } catch (error) {
      logger.error('Error in resume-game:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para lanzar eventos especiales (Cartonazo)
 */
function handleLaunchEvent(io, socket) {
  return async (data) => {
    try {
      const { roomCode, type, text } = data;

      if (type === 'cartonazo') {
        logger.info(`[${roomCode}] Cartonazo event triggered`);

        const room = await Room.findOne({ code: roomCode }).populate('players');
        if (!room) {
          logger.warn(`[${roomCode}] Room not found for Cartonazo`);
          return;
        }

        // Combinar jugadores digitales y manuales
        const manualPlayersFormatted = (room.manualPlayers || []).map(mp => ({
          _id: mp.playerId,
          name: mp.playerName,
          cardNumber: mp.cardNumber,
          isManual: true
        }));

        // Jugadores elegibles: digitales conectados (no host) + manuales
        const eligibleDigitalPlayers = room.players.filter(p => p.isConnected && !p.isHost);
        const eligiblePlayers = [...eligibleDigitalPlayers, ...manualPlayersFormatted];

        logger.info(`[${roomCode}] Cartonazo eligible players: ${eligibleDigitalPlayers.length} digital + ${manualPlayersFormatted.length} manual = ${eligiblePlayers.length} total`);

        if (eligiblePlayers.length === 0) {
          logger.warn(`[${roomCode}] No eligible players for Cartonazo`);
          socket.emit('error', { message: 'No hay jugadores elegibles para el Cartonazo.' });
          return;
        }

        const winner = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];

        logger.info(`[${roomCode}] Cartonazo Winner: ${winner.name}`);

        io.to(roomCode).emit('cartonazo-winner', {
          playerId: winner._id,
          name: winner.name,
          message: `¡Felicidades a ${winner.name}, el ganador del Cartonazo!`
        });
      } else {
        // Comportamiento original para otros eventos
        io.to(roomCode).emit('launch-event', { type, text });
      }
    } catch (error) {
      logger.error(`Error in launch-event:`, error);
      socket.emit('error', { message: 'Error al procesar el evento.' });
    }
  };
}

/**
 * Registra todos los handlers de juego
 * @param {SocketIO} io
 * @param {Socket} socket
 */
function registerGameHandlers(io, socket) {
  socket.on('start-game', handleStartGame(io, socket));
  socket.on('game-state-change', handleGameStateChange(io, socket));
  socket.on('pause-game', handlePauseGame(io, socket));
  socket.on('resume-game', handleResumeGame(io, socket));
  socket.on('reset-game', handleResetGame(io, socket));
  socket.on('start-countdown', handleStartCountdown(io, socket));
  socket.on('launch-event', handleLaunchEvent(io, socket));
}

module.exports = {
  registerGameHandlers,
  // Exports para otros módulos y testing
  immediateNextNumber,
  scheduleRoomInterval,
  triggerChallenge,
  handleStartGame,
  handleGameStateChange,
  handlePauseGame,
  handleResumeGame,
  handleResetGame,
  handleStartCountdown,
  handleLaunchEvent
};
