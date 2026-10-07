const Room = require('../../models/Room');
const Player = require('../../models/Player');
const Game = require('../../models/Game');
const logger = require('../../config/logger');
const { isFullCard } = require('../utils/bingoValidator');
const { clearAllRoomTimers } = require('../utils/roomTimer');
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
  game.status = 'finished';
  game.endTime = new Date();
  game.duration = game.startTime ? (game.endTime - game.startTime) : undefined;
  game.winners = Array.isArray(game.winners) ? game.winners : [];
  game.winners.push({ player: player._id, achievement: bingoType, timestamp: new Date() });
  await game.save();

  room.gameState = 'finished';
  await room.save();

  clearAllRoomTimers(room.code);

  io.to(room.code).emit('bingo-verified', { playerId: player._id, bingoType });
  io.to(room.code).emit('game-state-changed', { state: 'finished' });
  io.to(room.code).emit('game-finished', { winnerId: player._id, winnerName: player.name, achievement: bingoType });
}

async function runTieBreak(io, socket, room) {
  const game = await Game.findById(room.currentGame);
  const candidates = Array.isArray(game.tieCandidates) ? game.tieCandidates.slice() : [];

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
      const { roomCode, playerId, bingoType } = data;

      const room = await Room.findOne({ code: roomCode }).populate('players');
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }

      const game = room.currentGame ? await Game.findById(room.currentGame) : null;
      if (!game) {
        return socket.emit('error', { message: 'Juego no encontrado' });
      }

      if (game.status === 'finished' || room.gameState === 'finished') {
        io.to(roomCode).emit('bingo-rejected', { playerId, bingoType });
        return;
      }

      const player = await Player.findById(playerId);
      if (!player) {
        return socket.emit('error', { message: 'Jugador no encontrado' });
      }

      io.to(roomCode).emit('bingo-claimed', { playerId, bingoType });

      room.gameState = 'paused';
      await room.save();
      io.to(roomCode).emit('game-state-changed', { state: 'paused' });

      const marked = Array.isArray(player.bingoCard?.markedCells) ? player.bingoCard.markedCells : [];
      const isValid = bingoType === 'full' ? isFullCard(marked) : false;

      logger.info(`[${roomCode}] 🎯 BINGO VALIDATION - Player: ${player.name}, Marked cells: ${marked.length}, Is valid: ${isValid}`);

      if (!isValid) {
        logger.warn(`[${roomCode}] ❌ BINGO REJECTED - Player: ${player.name}, Marked: ${marked.length}/25`);
        io.to(roomCode).emit('bingo-rejected', { playerId, bingoType });
        room.gameState = 'playing';
        await room.save();
        io.to(roomCode).emit('game-state-changed', { state: 'playing' });
        logger.logGameEvent(roomCode, 'Bingo rejected', { playerId, bingoType });
        return;
      }

      logger.info(`[${roomCode}] ✅ BINGO VALID - Tie-break enabled: ${room.config?.tieBreakEnabled}`);

      if (!room.config?.tieBreakEnabled) {
        await finishGameWithWinner(io, room, game, player, bingoType);
        logger.logGameEvent(roomCode, 'Bingo verified', { playerId, bingoType });
        return;
      }

      const now = Date.now();
      const windowEnds = game.tieWindowEnds ? new Date(game.tieWindowEnds).getTime() : 0;

      if (game.tieBreakActive && now <= windowEnds) {
        game.tieCandidates = Array.isArray(game.tieCandidates) ? game.tieCandidates : [];
        if (!game.tieCandidates.find(id => id.toString() === player._id.toString())) {
          game.tieCandidates.push(player._id);
        }
        await game.save();
        io.to(roomCode).emit('tiebreak-candidate-added', { playerId });
        logger.logGameEvent(roomCode, 'Tie-break candidate added', { playerId });
        return;
      }

      game.tieBreakActive = true;
      game.tieCandidates = [player._id];
      game.tieWindowEnds = new Date(Date.now() + 5000);
      await game.save();
      io.to(roomCode).emit('tiebreak-window-started', { endsAt: game.tieWindowEnds, firstCandidate: player._id });
      logger.logGameEvent(roomCode, 'Tie-break window started');

      setTimeout(async () => {
        const freshRoom = await Room.findOne({ code: roomCode });
        if (!freshRoom) return;
        await runTieBreak(io, socket, freshRoom);
      }, 5000);
    } catch (error) {
      logger.error('Error in claim-bingo:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para llamar un número manualmente (desde TV/host)
 */
function handleCallNumber(io, socket) {
  return async (data) => {
    try {
      const { roomCode, number, nextSongIndex } = data;

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }

      const game = await Game.findById(room.currentGame);
      if (!game) {
        return socket.emit('error', { message: 'Juego no encontrado' });
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
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para cuando el organizador inicia un performance de desempate
 */
function handleStartTiebreakPerformance(io, socket) {
  return async (data) => {
    try {
      const { roomCode, performerId } = data;

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
      socket.emit('error', { message: error.message });
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
        await finalizeTiebreakVoting(io, room, game, candidatesInfo);
      }, 30000);

    } catch (error) {
      logger.error('Error in start-tiebreak-voting:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Finalizar votación de tie-break y determinar ganador
 */
async function finalizeTiebreakVoting(io, room, game, candidatesInfo) {
  try {
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
      const { roomCode, voterId, performerId, stars } = data;

      logger.info(`[${roomCode}] Voto tie-break: ${voterId} → ${performerId}: ${stars} estrellas`);

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }

      const game = await Game.findById(room.currentGame);
      if (!game) {
        return socket.emit('error', { message: 'Juego no encontrado' });
      }

      // Guardar voto en el juego
      if (!game.tieBreakVotes) {
        game.tieBreakVotes = [];
      }

      // Verificar si ya votó por este candidato
      const existingVoteIndex = game.tieBreakVotes.findIndex(
        v => v.voterId.toString() === voterId && v.performerId.toString() === performerId
      );

      const vote = {
        voterId,
        performerId,
        stars,
        timestamp: new Date()
      };

      if (existingVoteIndex >= 0) {
        // Actualizar voto existente
        game.tieBreakVotes[existingVoteIndex] = vote;
      } else {
        // Agregar nuevo voto
        game.tieBreakVotes.push(vote);
      }

      await game.save();

      // Confirmar voto
      socket.emit('tiebreak-vote-confirmed', { performerId, stars });

      // Emitir progreso de votación (incluir digitales conectados + manuales)
      const connectedDigitalPlayers = room.players.filter(p => p.isConnected);
      const manualPlayersCount = (room.manualPlayers || []).length;
      const totalVoters = connectedDigitalPlayers.length + manualPlayersCount;
      const votersWhoVoted = new Set(game.tieBreakVotes.map(v => v.voterId.toString())).size;

      io.to(roomCode).emit('tiebreak-voting-progress', {
        voted: votersWhoVoted,
        total: totalVoters
      });

      logger.info(`[${roomCode}] Progreso votación: ${votersWhoVoted}/${totalVoters}`);

    } catch (error) {
      logger.error('Error in cast-tiebreak-vote:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para verificar BINGO de jugador manual (con cartón impreso)
 */
function handleVerifyBingoManual(io, socket) {
  return async (data) => {
    try {
      const { roomCode, playerName, cardNumber, playerId } = data;

      logger.info(`[${roomCode}] BINGO manual verificado: ${playerName} (Cartón #${cardNumber})`);

      const room = await Room.findOne({ code: roomCode }).populate('players');
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }

      const game = await Game.findById(room.currentGame);
      if (!game) {
        return socket.emit('error', { message: 'Juego no encontrado' });
      }

      // Finalizar juego con jugador manual como ganador
      game.status = 'finished';
      game.endTime = new Date();
      game.duration = game.startTime ? (game.endTime - game.startTime) : undefined;
      game.winners = Array.isArray(game.winners) ? game.winners : [];
      game.winners.push({
        playerName: playerName,
        cardNumber: cardNumber,
        playerId: playerId,
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
        playerName,
        cardNumber,
        playerId,
        bingoType: 'full'
      });

      io.to(room.code).emit('game-state-changed', { state: 'finished' });

      io.to(room.code).emit('game-finished', {
        winnerName: playerName,
        cardNumber: cardNumber,
        isManualPlayer: true,
        achievement: 'full'
      });

      logger.logGameEvent(room.code, 'BINGO manual verificado', {
        playerName,
        cardNumber,
        playerId
      });

    } catch (error) {
      logger.error('Error in verify-bingo-manual:', error);
      socket.emit('error', { message: error.message });
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
  handleCastTiebreakVote
};
