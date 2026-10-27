const Room = require('../../models/Room');
const Player = require('../../models/Player');
const Game = require('../../models/Game');
const logger = require('../../config/logger');
const { getCard } = require('../../utils/bingoCards');
const { getCalledMarkedCells, validateBingoClaim } = require('../utils/bingoValidator');
const { GAME_CONSTANTS } = require('../../constants');
const { clearAllRoomTimers } = require('../utils/roomTimer');
const { isRoomHost, emitPermissionError } = require('../../middleware/socketAuthMiddleware');

const canControlRoom = (socket, room, data) => isRoomHost(socket, room, data?.hostCapability);
const canControlTiebreak = async (socket, room, data) => {
  if (await canControlRoom(socket, room, data)) return true;
  const requestedRoom = typeof data?.roomCode === 'string' ? data.roomCode.toUpperCase() : '';
  return socket.playerId === 'tv-display' && socket.tvAuthorized === true &&
    !!socket.roomCode && socket.roomCode.toUpperCase() === requestedRoom &&
    room?.code?.toUpperCase() === requestedRoom;
};
const votingHandlers = require('./votingHandlers');
const votingService = require('../../services/votingService');
const EventEmitter = require('events');

// Event emitter para coordinar inicio de performances
const performanceEmitter = new EventEmitter();

/**
 * Esperar a que el organizador inicie un performance
 */
function waitForPerformanceStart(roomCode, performerId) {
  return new Promise((resolve) => {
    const eventName = `start-performance-${roomCode}-${performerId}`;
    performanceEmitter.once(eventName, () => {
      resolve();
    });
  });
}

async function finishGameWithWinner(io, room, game, player, bingoType) {
  const endTime = new Date();
  const winner = {
    player: player._id,
    playerName: player.name,
    cardNumber: player.cardNumber,
    achievement: bingoType,
    timestamp: endTime
  };
  const pointsByType = {
    line: GAME_CONSTANTS.POINTS.LINE_COMPLETED,
    fourCorners: GAME_CONSTANTS.POINTS.FOUR_CORNERS,
    centralCross: GAME_CONSTANTS.POINTS.CENTRAL_CROSS,
    full: GAME_CONSTANTS.POINTS.FULL_CARD
  };
  const statsUpdate = {
    $inc: {
      'stats.points': pointsByType[bingoType] || 0,
      'stats.bingosAchieved': 1,
      'stats.gamesWon': 1,
      ...(bingoType === 'line' ? { 'stats.linesCompleted': 1 } : {})
    }
  };
  if (bingoType !== 'line') {
    statsUpdate.$set = {
      [`stats.has${bingoType === 'fourCorners' ? 'FourCorners' : bingoType === 'centralCross' ? 'CentralCross' : 'FullCard'}`]: true
    };
  }

  let finalizedGame = game;
  if (typeof Game.findOneAndUpdate === 'function' && game._id) {
    finalizedGame = await Game.findOneAndUpdate(
      { _id: game._id, status: { $ne: 'finished' } },
      {
        $set: {
          status: 'finished',
          endTime,
          duration: game.startTime ? (endTime - game.startTime) : undefined
        },
        $push: { winners: winner }
      },
      { new: true }
    );
    if (!finalizedGame) return false;
  } else {
    game.status = 'finished';
    game.endTime = endTime;
    game.duration = game.startTime ? (game.endTime - game.startTime) : undefined;
    game.winners = Array.isArray(game.winners) ? game.winners : [];
    game.winners.push(winner);
    await game.save();
  }

  if (typeof Player.findOneAndUpdate === 'function') {
    await Player.findOneAndUpdate({ _id: player._id }, statsUpdate, { new: true });
  }

  room.gameState = 'finished';
  await room.save();

  clearAllRoomTimers(room.code);

  io.to(room.code).emit('bingo-verified', { playerId: player._id, bingoType });
  io.to(room.code).emit('game-state-changed', { state: 'finished' });
  io.to(room.code).emit('game-finished', { winnerId: player._id, winnerName: player.name, achievement: bingoType });
  return true;
}

async function runTieBreak(io, socket, room) {
  if (!room?.currentGame) {
    logger.warn(`[${room?.code || 'unknown'}] Tie-break requested without an active game`);
    return;
  }
  const game = await Game.findById(room.currentGame);
  if (!game) {
    logger.warn(`[${room.code}] Tie-break requested for a missing game`);
    return;
  }
  const candidates = Array.isArray(game.tieCandidates) ? game.tieCandidates.slice() : [];

  if (candidates.length === 0) {
    game.tieBreakActive = false;
    game.tieBreakStatus = null;
    game.tieWindowEnds = null;
    await game.save();
    return;
  }

  if (candidates.length <= 1) {
    const soloId = candidates[0];
    const winner = await Player.findById(soloId);
    if (winner) {
      await finishGameWithWinner(io, room, game, winner, 'full');
      logger.logGameEvent(room.code, 'Tie-break trivial (único candidato)');
    }
    game.tieBreakActive = false;
    game.tieCandidates = [];
    game.tieWindowEnds = null;
    await game.save();
    return;
  }

  io.to(room.code).emit('tiebreak-started', {
    candidates,
    message: '🧟 ¡DESEMPATE! Baile de Thriller'
  });

  // 🧟 Configuración de Thriller para desempate
  const thrillerSong = {
    title: 'Thriller',
    artist: 'Michael Jackson',
    localFile: 'Michael Jackson - Thriller.mp4'
  };

  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const candId = candidates[i];
    const performer = await Player.findById(candId);
    if (!performer) continue;

    // Marcar en el juego que estamos esperando performance
    game.tieBreakCurrentPerformer = {
      performerId: performer._id,
      status: 'waiting', // waiting | performing | voting
      performerNumber: i + 1,
      totalPerformers: candidates.length
    };
    await game.save();

    // Emitir evento de espera para que organizador inicie el video
    io.to(room.code).emit('tiebreak-ready-for-performer', {
      performerId: performer._id,
      performerName: performer.name,
      performerNumber: i + 1,
      totalPerformers: candidates.length,
      songData: thrillerSong,
      message: '🧟 ¡DESEMPATE! Baile de Thriller'
    });

    // Esperar a que el organizador inicie el video
    await waitForPerformanceStart(room.code, performer._id);

    // Marcar como performing
    game.tieBreakCurrentPerformer.status = 'performing';
    game.markModified('tieBreakCurrentPerformer');
    await game.save();

    // Notificar que el video está reproduciéndose
    io.to(room.code).emit('tiebreak-performance-started', {
      performerId: performer._id,
      performerName: performer.name
    });

    // Esperar duración del video (16 segundos)
    await new Promise(resolve => setTimeout(resolve, 16000));

    // Después del video, marcar como completado (NO iniciar votación automática)
    game.tieBreakCurrentPerformer.status = 'completed';
    game.markModified('tieBreakCurrentPerformer');
    await game.save();

    logger.info(`[${room.code}] Performance ${i + 1}/${candidates.length} completado`);
  }

  // Todos los candidatos bailaron - Esperar a que organizador abra votaciones
  game.tieBreakCurrentPerformer = null;
  game.tieBreakStatus = 'waiting-for-voting'; // Nuevo estado
  await game.save();

  // Emitir evento para mostrar botón de "ABRIR VOTACIONES"
  io.to(room.code).emit('tiebreak-all-performances-done', {
    candidates: candidates.map(cId => {
      const p = results.find(r => r.performerId?.toString() === cId.toString());
      return p || { performerId: cId };
    }),
    candidateCount: candidates.length,
    message: '🧟 Todos han bailado - Listo para votar'
  });

  logger.info(`[${room.code}] Todos los performances completados. Esperando votación.`);
}

/**
 * Handler para reclamar bingo
 */
function handleClaimBingo(io, socket) {
  return async (data) => {
    try {
      const roomCode = socket.roomCode;
      const playerId = socket.playerId;
      const requestedRoomCode = typeof data?.roomCode === 'string' ? data.roomCode.toUpperCase() : '';
      if (!roomCode || !playerId || playerId === 'tv-display' ||
          requestedRoomCode !== roomCode.toUpperCase() ||
          data?.playerId?.toString() !== playerId.toString()) {
        return socket.emit('error', { message: 'No tienes permisos para reclamar BINGO' });
      }
      const { bingoType } = data;
      if (!['line', 'fourCorners', 'centralCross', 'full'].includes(bingoType)) {
        return socket.emit('error', { message: 'Tipo de BINGO inválido' });
      }

      const room = await Room.findOne({ code: roomCode }).populate('players');
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }

      const player = await Player.findOneAndUpdate(
        { _id: playerId, room: room._id, socketId: socket.id, isConnected: true },
        { $set: { socketId: socket.id } },
        { new: true }
      );
      if (!player) {
        return socket.emit('error', { message: 'No tienes permisos para reclamar BINGO' });
      }

      const game = room.currentGame ? await Game.findById(room.currentGame) : null;
      if (!game) {
        return socket.emit('error', { message: 'Juego no encontrado' });
      }

      if (!['active', 'playing'].includes(game.status) || room.gameState !== 'playing') {
        io.to(roomCode).emit('bingo-rejected', { playerId, bingoType });
        return;
      }

      io.to(roomCode).emit('bingo-claimed', { playerId, bingoType });

      const configuredType = room.config?.gameMode || game.gameMode || 'full';
      if (bingoType !== configuredType) {
        io.to(roomCode).emit('bingo-rejected', { playerId, bingoType });
        return;
      }

      const validation = validateBingoClaim({
        matrix: player.bingoCard?.matrix,
        markedCells: player.bingoCard?.markedCells,
        calledNumbers: game.calledNumbers,
        bingoType
      });
      if (!validation.isValid) {
        io.to(roomCode).emit('bingo-rejected', { playerId, bingoType });
        logger.logGameEvent(roomCode, 'Bingo rejected', { playerId, bingoType });
        return;
      }

      room.gameState = 'paused';
      await room.save();
      io.to(roomCode).emit('game-state-changed', { state: 'paused' });

      logger.info(`[${roomCode}] ✅ BINGO VALID - Type: ${bingoType}; tie-break enabled: ${room.config?.tieBreakEnabled}`);

      if (!room.config?.tieBreakEnabled || bingoType !== 'full') {
        await finishGameWithWinner(io, room, game, player, bingoType);
        logger.logGameEvent(roomCode, 'Bingo verified', { playerId, bingoType });
        return;
      }

      const now = new Date();
      const playerAlreadyCandidate = Array.isArray(game.tieCandidates) &&
        game.tieCandidates.some((candidateId) => candidateId.toString() === player._id.toString());

      if (game.tieBreakActive && playerAlreadyCandidate) return;

      // Claims can arrive concurrently. Use an atomic update so the second
      // valid claim joins the active five-second window instead of losing to a
      // Mongoose document-version race.
      const candidateAddedGame = await Game.findOneAndUpdate(
        {
          _id: game._id,
          tieBreakActive: true,
          tieWindowEnds: { $gte: now },
          tieCandidates: { $ne: player._id }
        },
        { $addToSet: { tieCandidates: player._id } },
        { new: true }
      );
      if (candidateAddedGame) {
        io.to(roomCode).emit('tiebreak-candidate-added', { playerId });
        logger.logGameEvent(roomCode, 'Tie-break candidate added', { playerId });
        return;
      }

      const tieWindowEnds = new Date(Date.now() + 5000);
      const windowStartedGame = await Game.findOneAndUpdate(
        {
          _id: game._id,
          $or: [
            { tieBreakActive: { $ne: true } },
            { tieBreakActive: true, tieWindowEnds: { $lt: now } }
          ]
        },
        {
          $set: {
            tieBreakActive: true,
            tieCandidates: [player._id],
            tieWindowEnds,
            tieBreakStatus: null,
            tieBreakCurrentPerformer: null
          }
        },
        { new: true }
      );

      if (windowStartedGame) {
        io.to(roomCode).emit('tiebreak-window-started', {
          endsAt: windowStartedGame.tieWindowEnds,
          firstCandidate: player._id
        });
        logger.logGameEvent(roomCode, 'Tie-break window started');

        setTimeout(async () => {
          try {
            const freshRoom = await Room.findOne({ code: roomCode });
            if (!freshRoom) return;
            await runTieBreak(io, socket, freshRoom);
          } catch (error) {
            logger.error('Error starting tie-break asynchronously:', error);
          }
        }, 5000);
        return;
      }

      // If another request opened the window between the two atomic updates,
      // retry the join against the now-current window.
      const racedCandidateGame = await Game.findOneAndUpdate(
        {
          _id: game._id,
          tieBreakActive: true,
          tieWindowEnds: { $gte: new Date() },
          tieCandidates: { $ne: player._id }
        },
        { $addToSet: { tieCandidates: player._id } },
        { new: true }
      );
      if (racedCandidateGame) {
        io.to(roomCode).emit('tiebreak-candidate-added', { playerId });
        logger.logGameEvent(roomCode, 'Tie-break candidate added', { playerId });
        return;
      }

      logger.warn(`[${roomCode}] Valid bingo could not join or open the tie-break window`);
    } catch (error) {
      logger.error('Error in claim-bingo:', error);
      socket.emit('error', { message: 'No se pudo reclamar el bingo' });
    }
  };
}

/**
 * Handler para llamar un número manualmente (desde TV/host)
 */
function handleCallNumber(io, socket) {
  return async (data) => {
    try {
      const { roomCode, number, nextSongIndex } = data || {};
      if (typeof roomCode !== 'string' || !/^[A-Z0-9]{6}$/.test(roomCode) ||
          !Number.isInteger(number) || number < 1 || number > 75 ||
          (nextSongIndex !== undefined &&
            (!Number.isInteger(nextSongIndex) || nextSongIndex < 0))) {
        return socket.emit('error', { message: 'Datos de número inválidos' });
      }

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }
      if (!(await canControlRoom(socket, room, data))) {
        return emitPermissionError(socket);
      }

      const game = await Game.findById(room.currentGame);
      if (!game) {
        return socket.emit('error', { message: 'Juego no encontrado' });
      }
      if (room.gameState !== 'playing' || !['active', 'playing'].includes(game.status)) {
        return socket.emit('error', { message: 'La partida no permite llamar números ahora' });
      }
      if (!Array.isArray(game.availableNumbers) || !game.availableNumbers.includes(number)) {
        return socket.emit('error', { message: 'El número ya fue cantado o no es válido' });
      }

      game.calledNumbers.push(number);
      game.currentNumber = number;
      game.availableNumbers = game.availableNumbers.filter(n => n !== number);
      await game.save();

      // Si se proporciona el índice de la siguiente canción, sincronizar música
      if (nextSongIndex !== undefined) {
        room.musicState.currentSongIndex = nextSongIndex;
        room.musicState.currentTime = 0;
        room.musicState.lastUpdated = new Date();
        await room.save();
      }

      io.to(roomCode).emit('number-called', {
        number,
        calledNumbers: game.calledNumbers,
        nextSongIndex
      });

      logger.logGameEvent(roomCode, 'Number called manually', {
        number,
        nextSongIndex
      });
    } catch (error) {
      logger.error('Error in call-number:', error);
      socket.emit('error', { message: 'No se pudo llamar al número' });
    }
  };
}

/**
 * Handler para cuando el organizador inicia un performance de desempate
 */
function handleStartTiebreakPerformance(io, socket) {
  return async (data) => {
    try {
      const { roomCode, performerId } = data || {};
      if (typeof roomCode !== 'string' || !/^[A-Z0-9]{6}$/.test(roomCode) ||
          typeof performerId !== 'string' || performerId.length === 0) {
        return socket.emit('error', { message: 'Datos de desempate inválidos' });
      }
      const room = await Room.findOne({ code: roomCode });
      if (!(await canControlTiebreak(socket, room, data))) {
        return emitPermissionError(socket);
      }

      const game = await Game.findById(room.currentGame);
      if (!game?.tieBreakActive || !Array.isArray(game.tieCandidates) ||
          !game.tieCandidates.some((candidateId) => candidateId.toString() === performerId)) {
        return socket.emit('error', { message: 'El candidato de desempate no es válido' });
      }

      logger.info(`[${roomCode}] Organizador inició performance para ${performerId}`);

      // Emitir evento para liberar la espera
      const eventName = `start-performance-${roomCode}-${performerId}`;
      performanceEmitter.emit(eventName);

      // Confirmar al organizador
      socket.emit('tiebreak-performance-confirmed', {
        performerId,
        status: 'started'
      });
    } catch (error) {
      logger.error('Error in start-tiebreak-performance:', error);
      socket.emit('error', { message: 'No se pudo iniciar la actuación de desempate' });
    }
  };
}

/**
 * Handler para cuando el organizador abre las votaciones del desempate
 */
function handleStartTiebreakVoting(io, socket) {
  return async (data) => {
    try {
      const { roomCode } = data;

      logger.info(`[${roomCode}] Organizador abrió votaciones de tie-break`);

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }
      if (!(await canControlTiebreak(socket, room, data))) {
        return emitPermissionError(socket);
      }

      const game = await Game.findById(room.currentGame);
      if (!game || !game.tieBreakActive) {
        return socket.emit('error', { message: 'No hay tie-break activo' });
      }

      const candidates = game.tieCandidates || [];
      if (candidates.length === 0) {
        return socket.emit('error', { message: 'No hay candidatos' });
      }

      // Obtener información de cada candidato
      const candidatesInfo = [];
      for (const candId of candidates) {
        const player = await Player.findById(candId);
        if (player) {
          candidatesInfo.push({
            performerId: player._id,
            performerName: player.name
          });
        }
      }

      // Marcar estado de votación
      game.tieBreakStatus = 'voting';
      await game.save();

      // Emitir evento de votación para múltiples candidatos
      io.to(roomCode).emit('tiebreak-voting-started', {
        candidates: candidatesInfo,
        votingDuration: 30, // 30 segundos para votar por todos
        message: '🗳️ Vota por cada candidato'
      });

      logger.info(`[${roomCode}] Votación de tie-break iniciada para ${candidates.length} candidatos`);

      // Después de 30 segundos, procesar resultados
      setTimeout(async () => {
        await finalizeTiebreakVoting(io, room, game._id, candidatesInfo);
      }, 30000);

    } catch (error) {
      logger.error('Error in start-tiebreak-voting:', error);
      socket.emit('error', { message: 'No se pudo iniciar la votación de desempate' });
    }
  };
}

/**
 * Finalizar votación de tie-break y determinar ganador
 */
async function finalizeTiebreakVoting(io, room, gameId, candidatesInfo) {
  try {
    // Votes are written by independent player sockets while the timer is
    // running. Reload the game so finalization never uses the stale document
    // captured when voting started.
    const game = await Game.findById(gameId);
    if (!game) {
      logger.warn(`[${room?.code || 'unknown'}] Tie-break finalization skipped: game not found`);
      return;
    }

    // Obtener votos de cada candidato desde game.tieBreakVotes
    const results = [];

    for (const candidate of candidatesInfo) {
      const votes = (game.tieBreakVotes || []).filter(
        v => v.performerId.toString() === candidate.performerId.toString()
      );

      const average = votes.length > 0
        ? votes.reduce((sum, v) => sum + v.stars, 0) / votes.length
        : 0;

      results.push({
        performerId: candidate.performerId,
        performerName: candidate.performerName,
        average,
        totalVotes: votes.length
      });
    }

    // Ordenar por promedio
    results.sort((a, b) => b.average - a.average);

    if (results.length === 0) {
      game.tieBreakActive = false;
      game.tieCandidates = [];
      game.tieWindowEnds = null;
      game.tieBreakStatus = null;
      await game.save();
      return;
    }

    const winnerInfo = results[0];
    const winner = await Player.findById(winnerInfo.performerId);

    // Limpiar estado de tie-break
    game.tieBreakActive = false;
    game.tieCandidates = [];
    game.tieWindowEnds = null;
    game.tieBreakStatus = null;
    await game.save();

    // Emitir resultados
    io.to(room.code).emit('tiebreak-results', { results });

    // Declarar ganador
    if (winner) {
      await finishGameWithWinner(io, room, game, winner, 'full');
      logger.logGameEvent(room.code, 'Tie-break finished', {
        winner: winner.name,
        results
      });
    }
  } catch (error) {
    logger.error('Error finalizando tie-break voting:', error);
  }
}

/**
 * Handler para votos de tie-break
 */
function handleCastTiebreakVote(io, socket) {
  return async (data) => {
    try {
      const { voterId, performerId, stars } = data || {};
      const roomCode = socket.roomCode;
      const requestedRoom = typeof data?.roomCode === 'string' ? data.roomCode.toUpperCase() : '';
      if (!roomCode || !socket.playerId || socket.playerId === 'tv-display' ||
          requestedRoom !== roomCode.toUpperCase() ||
          voterId?.toString() !== socket.playerId.toString() ||
          !Number.isInteger(stars) || stars < 1 || stars > 5) {
        return socket.emit('error', { message: 'No tienes permisos para emitir este voto' });
      }

      logger.info(`[${roomCode}] Tie-break vote submitted by current socket owner`);

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }
      const voter = await Player.findOne({
        _id: socket.playerId,
        room: room._id,
        socketId: socket.id,
        isConnected: true
      });
      if (!voter) return socket.emit('error', { message: 'No tienes permisos para emitir este voto' });

      const game = await Game.findById(room.currentGame);
      if (!game) {
        return socket.emit('error', { message: 'Juego no encontrado' });
      }

      if (!Array.isArray(game.tieCandidates) || !game.tieCandidates.some(
        candidateId => candidateId.toString() === performerId?.toString()
      )) {
        return socket.emit('error', { message: 'Candidato de desempate inválido' });
      }

      const vote = {
        voterId: voter._id,
        performerId,
        stars,
        timestamp: new Date()
      };

      // Votes from different browser sessions can arrive in the same event
      // loop turn. Use an atomic append, then an atomic replacement for the
      // retry/update case, instead of saving a stale document per vote.
      const voteMatch = {
        voterId: voter._id,
        performerId
      };
      let updatedGame = await Game.findOneAndUpdate(
        {
          _id: game._id,
          tieBreakActive: true,
          tieBreakStatus: 'voting',
          tieBreakVotes: { $not: { $elemMatch: voteMatch } }
        },
        { $push: { tieBreakVotes: vote } },
        { new: true }
      );

      if (!updatedGame) {
        updatedGame = await Game.findOneAndUpdate(
          { _id: game._id, tieBreakVotes: { $elemMatch: voteMatch } },
          {
            $set: {
              'tieBreakVotes.$.stars': stars,
              'tieBreakVotes.$.timestamp': vote.timestamp
            }
          },
          { new: true }
        );
      }

      if (!updatedGame) {
        return socket.emit('error', { message: 'No se pudo registrar el voto de desempate' });
      }

      // Confirmar voto
      socket.emit('tiebreak-vote-confirmed', { performerId, stars });

      // Emitir progreso de votación (incluir digitales conectados + manuales)
      const connectedDigitalPlayers = room.players.filter(p => p.isConnected);
      const manualPlayersCount = (room.manualPlayers || []).length;
      const totalVoters = connectedDigitalPlayers.length + manualPlayersCount;
      const votersWhoVoted = new Set(updatedGame.tieBreakVotes.map(v => v.voterId.toString())).size;

      io.to(roomCode).emit('tiebreak-voting-progress', {
        voted: votersWhoVoted,
        total: totalVoters
      });

      logger.info(`[${roomCode}] Progreso votación: ${votersWhoVoted}/${totalVoters}`);

    } catch (error) {
      logger.error('Error in cast-tiebreak-vote:', error);
      socket.emit('error', { message: 'No se pudo registrar el voto de desempate' });
    }
  };
}

/**
 * Handler para verificar BINGO de jugador manual (con cartón impreso)
 */
function handleVerifyBingoManual(io, socket) {
  return async (data, ack) => {
    try {
      const { roomCode, playerName, cardNumber, playerId } = data;
      const requestedRoomCode = typeof roomCode === 'string' ? roomCode.toUpperCase() : '';

      logger.info(`[${requestedRoomCode}] BINGO manual verification requested`);

      const room = await Room.findOne({ code: requestedRoomCode }).populate('players');
      if (!room) {
        const error = { message: 'Sala no encontrada' };
        ack?.({ success: false, error: error.message });
        return socket.emit('error', error);
      }
      if (!(await canControlRoom(socket, room, data))) {
        return emitPermissionError(socket, ack);
      }

      const requestedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
      const requestedPlayerName = typeof playerName === 'string' ? playerName.trim() : '';
      if (!requestedPlayerId || !requestedPlayerName ||
          !Number.isInteger(cardNumber) || cardNumber < 186 || cardNumber > 200) {
        const error = 'Los datos del jugador manual no son válidos';
        ack?.({ success: false, error });
        return socket.emit('error', { message: error });
      }

      const manualPlayer = (room.manualPlayers || []).find((player) =>
        player.playerId === requestedPlayerId &&
        player.playerName === requestedPlayerName &&
        player.cardNumber === cardNumber
      );
      if (!manualPlayer) {
        const error = 'El jugador manual no pertenece a esta sala';
        ack?.({ success: false, error });
        return socket.emit('error', { message: error });
      }

      const game = await Game.findById(room.currentGame);
      if (!game) {
        const error = { message: 'Juego no encontrado' };
        ack?.({ success: false, error: error.message });
        return socket.emit('error', error);
      }

      if (Array.isArray(game.calledNumbers)) {
        const bingoType = room.config?.gameMode || game.gameMode || 'full';
        const manualCard = getCard(cardNumber);
        const markedCells = getCalledMarkedCells(manualCard, game.calledNumbers);
        const validation = validateBingoClaim({
          matrix: manualCard,
          markedCells,
          calledNumbers: game.calledNumbers,
          bingoType
        });
        if (!validation.isValid) {
          const error = 'El cartón manual no cumple la modalidad activa';
          ack?.({ success: false, error });
          return socket.emit('error', { message: error });
        }
      }

      // Finalizar juego con jugador manual como ganador
      game.status = 'finished';
      game.endTime = new Date();
      game.duration = game.startTime ? (game.endTime - game.startTime) : undefined;
      game.winners = Array.isArray(game.winners) ? game.winners : [];
      game.winners.push({
        playerName: manualPlayer.playerName,
        cardNumber: manualPlayer.cardNumber,
        playerId: manualPlayer.playerId,
        isManualPlayer: true,
        achievement: 'full',
        timestamp: new Date()
      });
      await game.save();

      room.gameState = 'finished';
      await room.save();

      clearAllRoomTimers(room.code);

      // Emitir eventos de BINGO verificado
      io.to(room.code).emit('bingo-verified-manual', {
        playerName: manualPlayer.playerName,
        cardNumber: manualPlayer.cardNumber,
        playerId: manualPlayer.playerId,
        bingoType: 'full'
      });

      io.to(room.code).emit('game-state-changed', { state: 'finished' });

      io.to(room.code).emit('game-finished', {
        winnerName: manualPlayer.playerName,
        cardNumber: manualPlayer.cardNumber,
        isManualPlayer: true,
        achievement: 'full'
      });

      logger.logGameEvent(room.code, 'BINGO manual verificado', {
        playerName: manualPlayer.playerName,
        cardNumber: manualPlayer.cardNumber,
        playerId: manualPlayer.playerId
      });

      ack?.({
        success: true,
        playerName: manualPlayer.playerName,
        cardNumber: manualPlayer.cardNumber,
        playerId: manualPlayer.playerId
      });

    } catch (error) {
      logger.error('Error in verify-bingo-manual:', error);
      const message = 'No se pudo verificar el bingo manual';
      ack?.({ success: false, error: message });
      socket.emit('error', { message });
    }
  };
}

/**
 * Registra todos los handlers de bingo
 * @param {SocketIO} io
 * @param {Socket} socket
 */
function registerBingoHandlers(io, socket) {
  socket.on('claim-bingo', handleClaimBingo(io, socket));
  socket.on('call-number', handleCallNumber(io, socket));
  socket.on('start-tiebreak-performance', handleStartTiebreakPerformance(io, socket));
  socket.on('start-tiebreak-voting', handleStartTiebreakVoting(io, socket));
  socket.on('cast-tiebreak-vote', handleCastTiebreakVote(io, socket));
  socket.on('verify-bingo-manual', handleVerifyBingoManual(io, socket));
}

module.exports = {
  registerBingoHandlers,
  // Exports individuales para testing
  handleClaimBingo,
  handleCallNumber,
  handleStartTiebreakPerformance,
  handleStartTiebreakVoting,
  handleCastTiebreakVote,
  handleVerifyBingoManual
};
