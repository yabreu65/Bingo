const logger = require('../../config/logger');
const votingService = require('../../services/votingService');
const Room = require('../../models/Room');
const Game = require('../../models/Game');
const Player = require('../../models/Player');
const Vote = require('../../models/Vote');
const { isRoomHost, emitPermissionError } = require('../../middleware/socketAuthMiddleware');

/**
 * Iniciar votación después de completar un challenge
 */
async function startVoting(io, socket, data = {}) {
  try {
    const { roomCode, challengeType, challengeText, performerId, performerName, songData, hostCapability } = data;
    const allowedChallengeTypes = new Set(['dance', 'sing', 'karaoke', 'group', 'trivia']);
    if (typeof roomCode !== 'string' || !/^[A-Z0-9]{6}$/.test(roomCode) ||
        !allowedChallengeTypes.has(challengeType) || typeof performerId !== 'string') {
      return socket.emit('error', { message: 'Datos de votación inválidos' });
    }
    logger.info(`[VOTING] Iniciando votación en sala ${roomCode}`);

    const room = await Room.findOne({ code: roomCode }).select('+hostCapabilityHash').populate('players');
    if (!room) {
      socket.emit('error', { message: 'Sala no encontrada' });
      return;
    }
    if (!(await isRoomHost(socket, room, hostCapability))) {
      return emitPermissionError(socket);
    }

    const game = await Game.findOne({ room: room._id, status: 'active' });
    if (!game) {
      socket.emit('error', { message: 'Juego no encontrado' });
      return;
    }

    const activeChallenge = game.activeChallenge;
    const authoritativePerformerId = activeChallenge?.player?._id || activeChallenge?.player;
    const performer = room.players.find((candidate) =>
      (candidate?._id || candidate)?.toString() === authoritativePerformerId?.toString()
    );
    if (!activeChallenge || activeChallenge.type !== challengeType ||
        !authoritativePerformerId || authoritativePerformerId.toString() !== performerId || !performer) {
      return socket.emit('error', { message: 'El challenge o el jugador no son válidos' });
    }
    const trustedPerformerName = performer.name;
    const trustedChallengeText = typeof activeChallenge.text === 'string'
      ? activeChallenge.text
      : typeof activeChallenge.data?.text === 'string' ? activeChallenge.data.text : activeChallenge.type;

    // Crear votación
    const vote = await votingService.createVoting(
      game._id,
      roomCode,
      challengeType,
      trustedChallengeText,
      authoritativePerformerId,
      trustedPerformerName
    );

    // Calcular total de votantes (digitales conectados + manuales - el performer)
    const connectedDigitalPlayers = room.players.filter(p => p.isConnected);
    const manualPlayersCount = (room.manualPlayers || []).length;
    const totalPlayersCount = connectedDigitalPlayers.length + manualPlayersCount;
    const totalVoters = totalPlayersCount - 1; // Todos excepto el performer

    // Actualizar el juego con la votación activa
    game.activeVoting = {
      voteId: vote._id,
      challengeType,
      performerId,
      performerName,
      startTime: new Date(),
      votesReceived: 0,
      totalVoters
    };

    await game.save();

    // Emitir evento a todos los jugadores
    const votingData = {
      voteId: vote._id,
      challengeType,
      performerId: authoritativePerformerId,
      performerName: trustedPerformerName,
      challengeText: trustedChallengeText,
      totalVoters,
      votingDuration: 15 // 15 segundos para votar
    };

    // Agregar songData si se proporciona (para desempates con canción específica)
    if (songData && typeof songData === 'object' && !Array.isArray(songData)) {
      votingData.songData = {
        title: typeof songData.title === 'string' ? songData.title.slice(0, 200) : undefined,
        artist: typeof songData.artist === 'string' ? songData.artist.slice(0, 200) : undefined,
        localFile: typeof songData.localFile === 'string' ? songData.localFile.slice(0, 200) : undefined
      };
    }

    io.to(roomCode).emit('votingStarted', votingData);

    logger.info(`[VOTING] Votación iniciada: ${vote._id}`);
  } catch (error) {
    logger.error('[VOTING] Error iniciando votación:', error);
    socket.emit('error', { message: 'Error iniciando votación' });
  }
}

/**
 * Registrar un voto
 */
async function castVote(io, socket, data = {}) {
  try {
    const { voteId, voterId, stars } = data;
    if (typeof voteId !== 'string' || voteId.length > 100 ||
        !Number.isInteger(stars) || stars < 1 || stars > 5) {
      return socket.emit('error', { message: 'Voto inválido' });
    }
    if (!socket.roomCode || !socket.playerId || socket.playerId === 'tv-display' ||
        voterId?.toString() !== socket.playerId.toString()) {
      socket.emit('error', { message: 'No tienes permisos para votar con esta identidad' });
      return;
    }
    const voteContext = await Vote.findById(voteId);
    if (!voteContext || voteContext.roomCode !== socket.roomCode) {
      socket.emit('error', { message: 'Votación no encontrada en esta sala' });
      return;
    }
    const room = await Room.findOne({ code: socket.roomCode });
    const voter = room ? await Player.findOne({
      _id: socket.playerId,
      room: room._id,
      socketId: socket.id,
      isConnected: true
    }) : null;
    if (!voter || voteContext.performerId?.toString() === voter._id.toString()) {
      socket.emit('error', { message: 'No puedes votar en esta votación' });
      return;
    }
    const voterName = voter.name;
    logger.info(`[VOTING] ${voterName} vota ${stars} estrellas`);

    // Verificar que no haya votado ya
    const alreadyVoted = await votingService.hasVoted(voteId, voter._id);
    if (alreadyVoted) {
      socket.emit('error', { message: 'Ya has votado' });
      return;
    }

    // Agregar el voto
    const { vote, stats } = await votingService.submitVote(voteId, voter._id, voterName, stars);

    // Actualizar el juego
    const game = await Game.findOne({ 'activeVoting.voteId': voteId });
    if (game) {
      game.activeVoting.votesReceived = vote.totalVotes;
      await game.save();
    }

    // Emitir confirmación al votante
    socket.emit('voteConfirmed', {
      voteId,
      stars
    });

    // Obtener la sala para emitir update a todos
    const voteRoom = await Room.findOne({ code: vote.roomCode });
    if (voteRoom) {
      // Emitir update de votación a todos
      io.to(vote.roomCode).emit('votingUpdate', {
        voteId,
        votesReceived: vote.totalVotes,
        totalVoters: game?.activeVoting?.totalVoters || 0,
        currentAverage: stats.averageStars
      });
    }

    logger.info(`[VOTING] Voto registrado. Total: ${vote.totalVotes}`);
  } catch (error) {
    logger.error('[VOTING] Error registrando voto:', error);
    socket.emit('error', { message: 'Error registrando voto' });
  }
}

/**
 * Finalizar votación (automática o manual)
 */
async function endVoting(io, socket, data = {}) {
  try {
    const { roomCode, voteId, hostCapability } = data;
    logger.info(`[VOTING] Finalizando votación ${voteId}`);

    const room = await Room.findOne({ code: roomCode }).select('+hostCapabilityHash');
    if (!room) {
      socket.emit('error', { message: 'Sala no encontrada' });
      return;
    }
    if (!(await isRoomHost(socket, room, hostCapability))) {
      return emitPermissionError(socket);
    }

    const voteContext = await Vote.findById(voteId);
    if (!voteContext || typeof voteContext.roomCode !== 'string' ||
        voteContext.roomCode.toUpperCase() !== room.code.toUpperCase()) {
      socket.emit('error', { message: 'Votación no encontrada en esta sala' });
      return;
    }

    // Completar la votación
    const results = await votingService.completeVoting(voteId);

    // Actualizar el juego
    const game = await Game.findOne({ 'activeVoting.voteId': voteId });
    if (game) {
      // Agregar a votaciones completadas
      game.completedVotes.push(voteId);

      // Limpiar votación activa
      game.activeVoting = null;

      await game.save();

      // Actualizar puntos del jugador
      const player = await Player.findById(results.performerId);
      if (player) {
        player.stats.points = (player.stats?.points || 0) + results.bonusPoints;
        await player.save();
      }
    }

    // Emitir resultados a todos
    io.to(roomCode).emit('votingResults', {
      voteId: results.voteId,
      performerId: results.performerId,
      performerName: results.performerName,
      challengeType: results.challengeType,
      totalVotes: results.totalVotes,
      averageStars: results.averageStars,
      bonusPoints: results.bonusPoints,
      distribution: results.distribution
    });

    logger.info(`[VOTING] Votación finalizada. Promedio: ${results.averageStars} estrellas, Bonus: ${results.bonusPoints} pts`);
  } catch (error) {
    logger.error('[VOTING] Error finalizando votación:', error);
    socket.emit('error', { message: 'Error finalizando votación' });
  }
}

/**
 * Obtener rankings especiales al finalizar el juego
 */
async function getSpecialRankings(io, socket, data = {}) {
  try {
    const { roomCode } = data;
    if (!roomCode || !socket.roomCode || !socket.playerId ||
        socket.roomCode.toUpperCase() !== roomCode.toUpperCase()) {
      return emitPermissionError(socket);
    }
    logger.info(`[VOTING] Obteniendo rankings especiales para ${roomCode}`);

    const room = await Room.findOne({ code: roomCode });
    if (!room) {
      socket.emit('error', { message: 'Sala no encontrada' });
      return;
    }

    const game = await Game.findOne({ room: room._id }).sort({ createdAt: -1 });
    if (!game) {
      socket.emit('error', { message: 'Juego no encontrado' });
      return;
    }

    const rankings = await votingService.getSpecialRankings(game._id);

    // Emitir rankings al solicitante (generalmente el host)
    socket.emit('specialRankings', rankings);

    logger.info(`[VOTING] Rankings especiales enviados`);
  } catch (error) {
    logger.error('[VOTING] Error obteniendo rankings:', error);
    socket.emit('error', { message: 'Error obteniendo rankings' });
  }
}

/**
 * Obtener todas las votaciones de un juego
 */
async function getGameVotings(io, socket, data = {}) {
  try {
    const { roomCode } = data;
    if (!roomCode || !socket.roomCode || !socket.playerId ||
        socket.roomCode.toUpperCase() !== roomCode.toUpperCase()) {
      return emitPermissionError(socket);
    }
    const room = await Room.findOne({ code: roomCode });
    if (!room) {
      socket.emit('error', { message: 'Sala no encontrada' });
      return;
    }

    const game = await Game.findOne({ room: room._id }).sort({ createdAt: -1 });
    if (!game) {
      socket.emit('error', { message: 'Juego no encontrado' });
      return;
    }

    const votings = await votingService.getGameVotings(game._id);

    socket.emit('gameVotings', {
      votings,
      total: votings.length
    });
  } catch (error) {
    logger.error('[VOTING] Error obteniendo votaciones del juego:', error);
    socket.emit('error', { message: 'Error obteniendo votaciones' });
  }
}

module.exports = {
  startVoting,
  castVote,
  endVoting,
  getSpecialRankings,
  getGameVotings
};
