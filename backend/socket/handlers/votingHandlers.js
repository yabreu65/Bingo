const logger = require('../../config/logger');
const votingService = require('../../services/votingService');
const Room = require('../../models/Room');
const Game = require('../../models/Game');
const Player = require('../../models/Player');

/**
 * Iniciar votación después de completar un challenge
 */
async function startVoting(io, socket, { roomCode, challengeType, challengeText, performerId, performerName, songData }) {
  try {
    logger.info(`[VOTING] Iniciando votación en sala ${roomCode}`);

    const room = await Room.findOne({ code: roomCode }).populate('players');
    if (!room) {
      socket.emit('error', { message: 'Sala no encontrada' });
      return;
    }

    const game = await Game.findOne({ room: room._id, status: 'active' });
    if (!game) {
      socket.emit('error', { message: 'Juego no encontrado' });
      return;
    }

    // Crear votación
    const vote = await votingService.createVoting(
      game._id,
      roomCode,
      challengeType,
      challengeText,
      performerId,
      performerName
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
      performerId,
      performerName,
      challengeText,
      totalVoters,
      votingDuration: 15 // 15 segundos para votar
    };

    // Agregar songData si se proporciona (para desempates con canción específica)
    if (songData) {
      votingData.songData = songData;
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
async function castVote(io, socket, { voteId, voterId, voterName, stars }) {
  try {
    logger.info(`[VOTING] ${voterName} vota ${stars} estrellas`);

    // Verificar que el voto sea válido (1-5 estrellas)
    if (stars < 1 || stars > 5) {
      socket.emit('error', { message: 'Voto inválido: debe ser entre 1 y 5 estrellas' });
      return;
    }

    // Verificar que no haya votado ya
    const alreadyVoted = await votingService.hasVoted(voteId, voterId);
    if (alreadyVoted) {
      socket.emit('error', { message: 'Ya has votado' });
      return;
    }

    // Agregar el voto
    const { vote, stats } = await votingService.submitVote(voteId, voterId, voterName, stars);

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
    const room = await Room.findOne({ code: vote.roomCode });
    if (room) {
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
    socket.emit('error', { message: error.message || 'Error registrando voto' });
  }
}

/**
 * Finalizar votación (automática o manual)
 */
async function endVoting(io, socket, { roomCode, voteId }) {
  try {
    logger.info(`[VOTING] Finalizando votación ${voteId}`);

    const room = await Room.findOne({ code: roomCode });
    if (!room) {
      socket.emit('error', { message: 'Sala no encontrada' });
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
        player.score = (player.score || 0) + results.bonusPoints;
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
async function getSpecialRankings(io, socket, { roomCode }) {
  try {
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
async function getGameVotings(io, socket, { roomCode }) {
  try {
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
