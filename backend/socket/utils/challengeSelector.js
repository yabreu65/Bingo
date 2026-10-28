const { CHALLENGE_POOLS, GAME_CONSTANTS } = require('../../constants');
const logger = require('../../config/logger');

/**
 * Mezcla un array aleatoriamente (Fisher-Yates shuffle)
 * @param {Array} array - Array a mezclar
 * @returns {Array} - Array mezclado
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Inicializa los pools disponibles para un juego nuevo
 * @returns {Object} - Pools mezclados para cada tipo de challenge
 */
function initializeChallengePools(customPools = {}) {
  return {
    trivia: shuffleArray(customPools.trivia?.length ? customPools.trivia : CHALLENGE_POOLS.trivia),
    riddle: shuffleArray(customPools.riddle?.length ? customPools.riddle : CHALLENGE_POOLS.riddle),
    dance: shuffleArray(customPools.dance?.length ? customPools.dance : CHALLENGE_POOLS.dance),
    sing: shuffleArray(customPools.sing?.length ? customPools.sing : CHALLENGE_POOLS.sing),
    group: shuffleArray(customPools.group?.length ? customPools.group : CHALLENGE_POOLS.group),
    karaoke: shuffleArray(customPools.karaoke?.length ? customPools.karaoke : CHALLENGE_POOLS.karaoke)
  };
}

async function loadChallengePoolsForRoom(roomId) {
  if (!roomId) return initializeChallengePools();
  try {
    const AdminContent = require('../../models/AdminContent');
    const { contentToChallenge } = require('../../utils/adminCatalog');
    const items = await AdminContent.find({ room: roomId, enabled: true, archivedAt: null });
    const pools = {};
    items.forEach(item => { if (!pools[item.kind]) pools[item.kind] = []; pools[item.kind].push(contentToChallenge(item)); });
    return initializeChallengePools(pools);
  } catch (error) {
    logger.warn(`Managed content unavailable; using legacy pools: ${error.message}`);
    return initializeChallengePools();
  }
}

/**
 * Selecciona el siguiente tipo de reto basado en el último tipo usado
 * Rota entre: trivia -> dance -> karaoke -> trivia...
 */
function getNextChallengeType(lastChallengeType, enabledTypes = null) {
  // Rotación fija: trivia -> dance -> karaoke
  const defaultRotation = [
    GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA,
    GAME_CONSTANTS.CHALLENGE_TYPES.DANCE,
    GAME_CONSTANTS.CHALLENGE_TYPES.KARAOKE
  ];
  const rotation = Array.isArray(enabledTypes) && enabledTypes.length > 0
    ? enabledTypes.filter(type => CHALLENGE_POOLS[type])
    : defaultRotation;

  if (rotation.length === 0) return null;

  if (!lastChallengeType) {
    return rotation[0]; // Empezar con trivia
  }

  const currentIndex = rotation.indexOf(lastChallengeType);
  const nextIndex = (currentIndex + 1) % rotation.length;

  return rotation[nextIndex];
}

/**
 * Selecciona un reto del pool disponible sin repetición
 * @param {string} challengeType - Tipo de challenge (trivia, dance, karaoke)
 * @param {Object} availablePools - Pools disponibles del juego
 * @returns {Object} - Challenge seleccionado y pools actualizados
 */
function selectRandomChallenge(challengeType, availablePools) {
  const configuredPool = availablePools?.[challengeType];
  const sourcePool = Array.isArray(configuredPool) && configuredPool.length > 0
    ? configuredPool
    : CHALLENGE_POOLS[challengeType];

  if (!Array.isArray(sourcePool)) {
    logger.warn(`Challenge type "${challengeType}" is not supported`);
    return {
      challenge: null,
      updatedPools: availablePools || {}
    };
  }

  if (!availablePools || !availablePools[challengeType]) {
    logger.warn(`Available pool for type "${challengeType}" not found, initializing...`);
    availablePools = availablePools || {};
    availablePools[challengeType] = shuffleArray(sourcePool);
  }

  let pool = availablePools[challengeType];

  // Si el pool está vacío, remezclar
  if (!pool || pool.length === 0) {
    logger.info(`Pool for ${challengeType} exhausted, reshuffling...`);
    pool = shuffleArray(sourcePool);
    availablePools[challengeType] = pool;
  }

  // Tomar el primer elemento del pool (ya está mezclado)
  const selected = pool.shift();

  // Para trivia, el selected es un objeto con question, options y correct
  if (challengeType === GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA) {
    return {
      challenge: {
        question: selected.question,
        options: selected.options,
        correct: selected.correct,
        deezerId: null
      },
      updatedPools: availablePools
    };
  }

  if (challengeType === GAME_CONSTANTS.CHALLENGE_TYPES.RIDDLE) {
    return {
      challenge: {
        prompt: selected.prompt,
        answers: selected.answers,
        id: selected.id
      },
      updatedPools: availablePools
    };
  }

  // Para karaoke, retornar con estructura específica
  if (challengeType === GAME_CONSTANTS.CHALLENGE_TYPES.KARAOKE) {
    return {
      challenge: {
        text: selected.text || `🎤 Canta: ${selected.title} - ${selected.artist}`,
        localFile: selected.localFile,
        karaokeId: selected.id,
        title: selected.title,
        artist: selected.artist,
        points: selected.points,
        duration: selected.duration
      },
      updatedPools: availablePools
    };
  }

  // Para otros tipos (dance), selected es un objeto con text y deezerId
  return {
    challenge: selected,
    updatedPools: availablePools
  };
}

/**
 * Selecciona jugadores elegibles para un reto
 * @param {Array} players - Lista de jugadores en la sala (puede incluir digitales y manuales)
 * @param {Array} recentPlayers - IDs de jugadores que han participado recientemente
 * @returns {Array} - Jugadores elegibles
 */
function selectEligiblePlayers(players, recentPlayers = []) {
  // Filtrar jugadores elegibles:
  // - Jugadores digitales: conectados y con cartón válido
  // - Jugadores manuales: siempre elegibles si tienen cardNumber (identificados por no tener isConnected)
  const eligible = players.filter(p => {
    const hasValidCard = p.cardNumber !== undefined && p.cardNumber !== null;

    // Si es jugador manual (no tiene isConnected o es undefined), solo verificar cartón
    if (p.isConnected === undefined) {
      return hasValidCard;
    }

    // Si es jugador digital, verificar que esté conectado Y tenga cartón
    return p.isConnected && hasValidCard;
  });

  logger.info(`[CHALLENGE] Total eligible players: ${eligible.length} of ${players.length}`);

  if (eligible.length === 0) {
    return [];
  }

  // Si hay jugadores que no han participado recientemente, preferir esos
  const notRecent = eligible.filter(p => {
    const playerId = p._id ? p._id.toString() : p.playerId;
    // Verificar si el playerId está en recentPlayers (puede ser ObjectId o String)
    return !recentPlayers.some(recentId => {
      const recentIdStr = typeof recentId === 'string' ? recentId : recentId.toString();
      return recentIdStr === playerId;
    });
  });

  if (notRecent.length > 0) {
    return notRecent;
  }

  // Si todos han participado recientemente, retornar todos los elegibles
  return eligible;
}

/**
 * Selecciona un jugador aleatorio de la lista de elegibles
 */
function selectRandomPlayer(eligiblePlayers) {
  if (!eligiblePlayers || eligiblePlayers.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * eligiblePlayers.length);
  return eligiblePlayers[randomIndex];
}

/**
 * Verifica si es momento de lanzar un reto basado en la frecuencia configurada
 */
function shouldTriggerChallenge(numbersSinceChallenge, challengeFrequency) {
  return numbersSinceChallenge >= (challengeFrequency || GAME_CONSTANTS.CHALLENGE_FREQUENCY);
}

/**
 * Crea el objeto de datos del reto para emitir al cliente
 */
function createChallengeData(challengeType, selectedPlayer, challenge) {
  const player = {
    id: selectedPlayer._id,
    name: selectedPlayer.name
  };

  if (selectedPlayer.isManual !== undefined) {
    player.isManual = selectedPlayer.isManual;
  }

  if (selectedPlayer.cardNumber !== undefined) {
    player.cardNumber = selectedPlayer.cardNumber;
  }

  const baseData = {
    type: challengeType,
    player,
    duration: GAME_CONSTANTS.CHALLENGE_DURATION
  };

  // Para trivia, nunca enviar la respuesta correcta en el reto inicial.
  if (challengeType === GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA) {
    baseData.data = {
      question: challenge.question,
      options: challenge.options
    };
  }
  else if (challengeType === GAME_CONSTANTS.CHALLENGE_TYPES.RIDDLE) {
    baseData.data = {
      prompt: challenge.prompt,
      id: challenge.id
    };
    baseData.text = challenge.prompt;
  }
  // Para karaoke, incluir datos adicionales y duración más larga
  else if (challengeType === GAME_CONSTANTS.CHALLENGE_TYPES.KARAOKE) {
    baseData.data = challenge.text;
    baseData.karaokeId = challenge.karaokeId;
    baseData.title = challenge.title;
    baseData.artist = challenge.artist;
    baseData.localFile = challenge.localFile;
    baseData.duration = Number.isInteger(challenge.duration) ? challenge.duration : 60;
  }
  // Para otros tipos (dance, sing, group)
  else {
    baseData.data = challenge.text || challenge;
    baseData.text = challenge.text;
    baseData.deezerId = challenge.deezerId;
  }

  return baseData;
}

module.exports = {
  getNextChallengeType,
  selectRandomChallenge,
  selectEligiblePlayers,
  selectRandomPlayer,
  shouldTriggerChallenge,
  createChallengeData,
  initializeChallengePools,
  loadChallengePoolsForRoom,
  shuffleArray
};
