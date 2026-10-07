const Player = require('../models/Player');
const Game = require('../models/Game');
const Room = require('../models/Room');
const logger = require('../config/logger');
const { GAME_CONSTANTS } = require('../constants');

/**
 * Calcula el nivel de un jugador basado en sus puntos
 * @param {number} points
 * @returns {Object}
 */
function calculatePlayerLevel(points) {
  const levels = GAME_CONSTANTS.LEVELS;

  // Encontrar el nivel correspondiente
  for (let i = levels.length - 1; i >= 0; i--) {
    if (points >= levels[i].minPoints) {
      return {
        level: i + 1,
        name: levels[i].name,
        stars: levels[i].stars,
        currentPoints: points,
        minPoints: levels[i].minPoints,
        nextLevelPoints: i < levels.length - 1 ? levels[i + 1].minPoints : null,
        progress: i < levels.length - 1
          ? ((points - levels[i].minPoints) / (levels[i + 1].minPoints - levels[i].minPoints)) * 100
          : 100
      };
    }
  }

  // Por defecto, nivel 1
  return {
    level: 1,
    name: levels[0].name,
    stars: levels[0].stars,
    currentPoints: points,
    minPoints: 0,
    nextLevelPoints: levels[1].minPoints,
    progress: (points / levels[1].minPoints) * 100
  };
}

/**
 * Obtiene las estadísticas completas de un jugador
 * @param {string} playerId
 * @returns {Promise<Object>}
 */
async function getPlayerCompleteStats(playerId) {
  try {
    const player = await Player.findById(playerId);

    if (!player) {
      throw new Error('Jugador no encontrado');
    }

    const level = calculatePlayerLevel(player.stats.points || 0);

    return {
      playerId: player._id,
      name: player.name,
      isHost: player.isHost,
      stats: {
        points: player.stats.points || 0,
        gamesPlayed: player.stats.gamesPlayed || 0,
        gamesWon: player.stats.gamesWon || 0,
        numbersMarked: player.stats.numbersMarked || 0,
        challengesCompleted: player.stats.challengesCompleted || 0,
        bingosAchieved: player.stats.bingosAchieved || 0
      },
      level,
      winRate: player.stats.gamesPlayed > 0
        ? ((player.stats.gamesWon / player.stats.gamesPlayed) * 100).toFixed(2)
        : 0
    };
  } catch (error) {
    logger.error(`Error getting complete stats for player ${playerId}:`, error);
    throw error;
  }
}

/**
 * Obtiene el leaderboard de jugadores
 * @param {number} limit - Número máximo de jugadores a retornar
 * @param {string} sortBy - Campo por el cual ordenar ('points', 'gamesWon', 'winRate')
 * @returns {Promise<Array>}
 */
async function getLeaderboard(limit = 10, sortBy = 'points') {
  try {
    let sortField = {};

    switch (sortBy) {
      case 'points':
        sortField = { 'stats.points': -1 };
        break;
      case 'gamesWon':
        sortField = { 'stats.gamesWon': -1 };
        break;
      case 'bingos':
        sortField = { 'stats.bingosAchieved': -1 };
        break;
      default:
        sortField = { 'stats.points': -1 };
    }

    const players = await Player.find({})
      .sort(sortField)
      .limit(limit)
      .select('name stats');

    return players.map((player, index) => ({
      rank: index + 1,
      playerId: player._id,
      name: player.name,
      stats: player.stats,
      level: calculatePlayerLevel(player.stats.points || 0)
    }));
  } catch (error) {
    logger.error('Error getting leaderboard:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas globales del sistema
 * @returns {Promise<Object>}
 */
async function getGlobalStats() {
  try {
    const totalPlayers = await Player.countDocuments();
    const totalGames = await Game.countDocuments();
    const activeRooms = await Room.countDocuments({ gameState: 'playing' });

    // Estadísticas agregadas de jugadores
    const playerStats = await Player.aggregate([
      {
        $group: {
          _id: null,
          totalPoints: { $sum: '$stats.points' },
          totalGamesPlayed: { $sum: '$stats.gamesPlayed' },
          totalBingos: { $sum: '$stats.bingosAchieved' },
          totalChallenges: { $sum: '$stats.challengesCompleted' }
        }
      }
    ]);

    const stats = playerStats[0] || {
      totalPoints: 0,
      totalGamesPlayed: 0,
      totalBingos: 0,
      totalChallenges: 0
    };

    return {
      players: {
        total: totalPlayers,
        registered: totalPlayers
      },
      games: {
        total: totalGames,
        activeRooms
      },
      overall: {
        totalPoints: stats.totalPoints,
        totalGamesPlayed: stats.totalGamesPlayed,
        totalBingos: stats.totalBingos,
        totalChallenges: stats.totalChallenges,
        averagePointsPerPlayer: totalPlayers > 0
          ? Math.round(stats.totalPoints / totalPlayers)
          : 0
      }
    };
  } catch (error) {
    logger.error('Error getting global stats:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas de un juego específico
 * @param {string} gameId
 * @returns {Promise<Object>}
 */
async function getGameStats(gameId) {
  try {
    const game = await Game.findById(gameId).populate('room');

    if (!game) {
      throw new Error('Juego no encontrado');
    }

    const duration = game.endTime
      ? Math.round((new Date(game.endTime) - new Date(game.startTime)) / 1000)
      : Math.round((Date.now() - new Date(game.startTime)) / 1000);

    return {
      gameId: game._id,
      roomCode: game.room?.code,
      startTime: game.startTime,
      endTime: game.endTime,
      duration: `${Math.floor(duration / 60)}m ${duration % 60}s`,
      durationSeconds: duration,
      numbers: {
        total: GAME_CONSTANTS.MAX_NUMBER,
        called: game.calledNumbers.length,
        remaining: game.availableNumbers.length
      },
      currentNumber: game.currentNumber,
      hasActiveChallenge: !!game.activeChallenge,
      winner: game.winner
    };
  } catch (error) {
    logger.error(`Error getting game stats for ${gameId}:`, error);
    throw error;
  }
}

/**
 * Obtiene estadísticas de una sala
 * @param {string} roomCode
 * @returns {Promise<Object>}
 */
async function getRoomStats(roomCode) {
  try {
    const room = await Room.findOne({ code: roomCode }).populate('players');

    if (!room) {
      throw new Error('Sala no encontrada');
    }

    const connectedPlayers = room.players.filter(p => p.isConnected);
    const playersWithCards = room.players.filter(p =>
      p.cardNumber != null &&
      p.cardNumber > 0 &&
      Array.isArray(p.bingoCard?.matrix)
    );

    let gameStats = null;
    if (room.currentGame) {
      gameStats = await getGameStats(room.currentGame);
    }

    return {
      roomCode: room.code,
      hostName: room.hostName,
      gameState: room.gameState,
      players: {
        total: room.players.length,
        connected: connectedPlayers.length,
        withCards: playersWithCards.length
      },
      config: room.config,
      currentGame: gameStats,
      createdAt: room.createdAt
    };
  } catch (error) {
    logger.error(`Error getting room stats for ${roomCode}:`, error);
    throw error;
  }
}

/**
 * Registra una victoria de bingo para un jugador
 * @param {string} playerId
 * @param {string} bingoType
 * @returns {Promise<Player>}
 */
async function recordBingoAchievement(playerId, bingoType) {
  try {
    const player = await Player.findById(playerId);

    if (!player) {
      throw new Error('Jugador no encontrado');
    }

    player.stats.bingosAchieved = (player.stats.bingosAchieved || 0) + 1;

    // Agregar puntos según el tipo de bingo
    const points = GAME_CONSTANTS.POINTS[bingoType.toUpperCase().replace('-', '_')] || 0;
    player.stats.points = (player.stats.points || 0) + points;

    await player.save();

    logger.info(`Bingo achievement recorded for player ${playerId}`, {
      bingoType,
      points
    });

    return player;
  } catch (error) {
    logger.error(`Error recording bingo achievement for ${playerId}:`, error);
    throw error;
  }
}

/**
 * Registra la finalización de un challenge
 * @param {string} playerId
 * @param {string} challengeType
 * @param {boolean} successful
 * @returns {Promise<Player>}
 */
async function recordChallengeCompletion(playerId, challengeType, successful) {
  try {
    const player = await Player.findById(playerId);

    if (!player) {
      throw new Error('Jugador no encontrado');
    }

    if (successful) {
      player.stats.challengesCompleted = (player.stats.challengesCompleted || 0) + 1;

      // Agregar puntos
      const points = challengeType === 'trivia'
        ? GAME_CONSTANTS.POINTS.TRIVIA_CORRECT
        : GAME_CONSTANTS.POINTS.CHALLENGE_COMPLETED;

      player.stats.points = (player.stats.points || 0) + points;
    }

    await player.save();

    logger.info(`Challenge completion recorded for player ${playerId}`, {
      challengeType,
      successful
    });

    return player;
  } catch (error) {
    logger.error(`Error recording challenge completion for ${playerId}:`, error);
    throw error;
  }
}

module.exports = {
  calculatePlayerLevel,
  getPlayerCompleteStats,
  getLeaderboard,
  getGlobalStats,
  getGameStats,
  getRoomStats,
  recordBingoAchievement,
  recordChallengeCompletion
};
