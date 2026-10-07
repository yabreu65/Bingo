const Vote = require('../models/Vote');
const Game = require('../models/Game');
const Room = require('../models/Room');
const logger = require('../config/logger');

/**
 * Crear una nueva votación para un challenge
 */
async function createVoting(gameId, roomCode, challengeType, challengeText, performerId, performerName) {
  try {
    const vote = new Vote({
      gameId,
      roomCode,
      challengeType,
      challengeText,
      performerId,
      performerName,
      votes: [],
      isComplete: false
    });

    await vote.save();
    logger.info(`Votación creada: ${vote._id} para jugador ${performerName}`);

    return vote;
  } catch (error) {
    logger.error('Error creando votación:', error);
    throw error;
  }
}

/**
 * Agregar un voto a una votación existente
 */
async function submitVote(voteId, voterId, voterName, stars) {
  try {
    const vote = await Vote.findById(voteId);

    if (!vote) {
      throw new Error('Votación no encontrada');
    }

    if (vote.isComplete) {
      throw new Error('La votación ya está cerrada');
    }

    // Agregar el voto usando el método del modelo
    vote.addVote(voterId, voterName, stars);
    await vote.save();

    logger.info(`Voto agregado: ${voterName} votó ${stars} estrellas`);

    return {
      vote,
      stats: {
        totalVotes: vote.totalVotes,
        averageStars: vote.averageStars,
        bonusPoints: vote.bonusPoints
      }
    };
  } catch (error) {
    logger.error('Error agregando voto:', error);
    throw error;
  }
}

/**
 * Completar una votación y calcular resultados finales
 */
async function completeVoting(voteId) {
  try {
    const vote = await Vote.findById(voteId);

    if (!vote) {
      throw new Error('Votación no encontrada');
    }

    // Calcular estadísticas finales
    vote.calculateStats();
    vote.isComplete = true;
    vote.completedAt = new Date();

    await vote.save();

    logger.info(`Votación completada: ${vote._id} - Promedio: ${vote.averageStars} estrellas`);

    return {
      voteId: vote._id,
      performerId: vote.performerId,
      performerName: vote.performerName,
      challengeType: vote.challengeType,
      totalVotes: vote.totalVotes,
      averageStars: vote.averageStars,
      bonusPoints: vote.bonusPoints,
      distribution: vote.distribution
    };
  } catch (error) {
    logger.error('Error completando votación:', error);
    throw error;
  }
}

/**
 * Obtener el estado actual de una votación
 */
async function getVotingStatus(voteId) {
  try {
    const vote = await Vote.findById(voteId);

    if (!vote) {
      throw new Error('Votación no encontrada');
    }

    return {
      voteId: vote._id,
      performerName: vote.performerName,
      challengeType: vote.challengeType,
      totalVotes: vote.totalVotes,
      averageStars: vote.averageStars,
      isComplete: vote.isComplete
    };
  } catch (error) {
    logger.error('Error obteniendo estado de votación:', error);
    throw error;
  }
}

/**
 * Verificar si un jugador ya votó
 */
async function hasVoted(voteId, voterId) {
  try {
    const vote = await Vote.findById(voteId);

    if (!vote) {
      return false;
    }

    return vote.votes.some(v => v.voterId.toString() === voterId.toString());
  } catch (error) {
    logger.error('Error verificando voto:', error);
    return false;
  }
}

/**
 * Obtener las mejores performances de un juego
 */
async function getBestPerformances(gameId) {
  try {
    const best = await Vote.getBestPerformances(gameId);

    return {
      bestKaraoke: best.karaoke ? formatPerformance(best.karaoke) : null,
      bestDance: best.dance ? formatPerformance(best.dance) : null,
      bestSing: best.sing ? formatPerformance(best.sing) : null,
      bestGroup: best.group ? formatPerformance(best.group) : null,
      bestOverall: best.overall ? formatPerformance(best.overall) : null
    };
  } catch (error) {
    logger.error('Error obteniendo mejores performances:', error);
    throw error;
  }
}

/**
 * Obtener todas las votaciones de un juego
 */
async function getGameVotings(gameId) {
  try {
    const votes = await Vote.find({
      gameId,
      isComplete: true
    }).sort({ createdAt: 1 });

    return votes.map(vote => ({
      voteId: vote._id,
      performerName: vote.performerName,
      challengeType: vote.challengeType,
      challengeText: vote.challengeText,
      averageStars: vote.averageStars,
      totalVotes: vote.totalVotes,
      bonusPoints: vote.bonusPoints
    }));
  } catch (error) {
    logger.error('Error obteniendo votaciones del juego:', error);
    throw error;
  }
}

/**
 * Obtener rankings especiales al final del juego
 */
async function getSpecialRankings(gameId) {
  try {
    const best = await getBestPerformances(gameId);
    const allVotes = await Vote.find({
      gameId,
      isComplete: true
    }).sort({ averageStars: -1 });

    // Encontrar el más divertido (5.0 estrellas)
    const funniest = allVotes.find(v => v.averageStars === 5.0);

    // Top 3 actuaciones
    const top3 = allVotes.slice(0, 3).map(vote => ({
      performerName: vote.performerName,
      challengeType: vote.challengeType,
      challengeText: vote.challengeText,
      averageStars: vote.averageStars,
      totalVotes: vote.totalVotes
    }));

    return {
      bestKaraoke: best.bestKaraoke,
      bestDance: best.bestDance,
      bestSing: best.bestSing,
      bestGroup: best.bestGroup,
      funniest: funniest ? formatPerformance(funniest) : null,
      top3,
      totalVotings: allVotes.length
    };
  } catch (error) {
    logger.error('Error obteniendo rankings especiales:', error);
    throw error;
  }
}

/**
 * Calcular puntos bonus para un jugador basado en sus votaciones
 */
async function calculatePlayerBonusPoints(gameId, playerId) {
  try {
    const votes = await Vote.find({
      gameId,
      performerId: playerId,
      isComplete: true
    });

    const totalBonus = votes.reduce((sum, vote) => sum + vote.bonusPoints, 0);

    return totalBonus;
  } catch (error) {
    logger.error('Error calculando puntos bonus del jugador:', error);
    return 0;
  }
}

// Función helper para formatear performance
function formatPerformance(vote) {
  return {
    performerName: vote.performerName,
    challengeType: vote.challengeType,
    challengeText: vote.challengeText,
    averageStars: vote.averageStars,
    totalVotes: vote.totalVotes,
    bonusPoints: vote.bonusPoints,
    distribution: vote.distribution
  };
}

module.exports = {
  createVoting,
  submitVote,
  completeVoting,
  getVotingStatus,
  hasVoted,
  getBestPerformances,
  getGameVotings,
  getSpecialRankings,
  calculatePlayerBonusPoints
};
