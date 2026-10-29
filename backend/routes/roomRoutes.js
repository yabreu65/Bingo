const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Room = require('../models/Room');
const Player = require('../models/Player');
const { CARD_MATRIX_VERSION, getCard } = require('../utils/bingoCards');
const { validateRequest } = require('../middleware/validateRequest');
const { updateRoomActivity } = require('../utils/roomActivity');
const logger = require('../config/logger');
const { optionalAuth } = require('../middleware/authMiddleware');
const { createHostCapabilityHash, isRoomHost } = require('../middleware/socketAuthMiddleware');
const {
  createPlayerCapability,
  createPlayerCapabilityHash,
  isPlayerCapability
} = require('../utils/playerCapability');
const { stripGuestCapabilityHashes, stripTriviaAnswers, stripPrivatePlayerData } = require('../utils/publicData');
const { createTvCapability, createTvCapabilityHash } = require('../utils/tvCapability');
const {
  createTvAuthorizationToken,
  isTvAuthorizationToken,
  hashTvAuthorizationToken,
  getTvAuthorizationLinkTtlMs,
  getTvAuthorizationSessionTtlMs,
  revokeTemporaryTvSockets
} = require('../utils/tvAuthorization');
const { matchesPlayerCapability } = require('../utils/playerCapability');
const {
  createRoomSchema,
  joinRoomSchema,
  getRoomSchema,
  selectCardSchema,
  updateConfigSchema,
  reconnectSchema,
  createTvAuthorizationSchema,
  claimTvAuthorizationSchema,
  renewTvAuthorizationSchema,
  revokeTvAuthorizationSchema
} = require('../schemas/roomSchemas');
const {
  createRoomLimiter,
  joinRoomLimiter,
  generalApiLimiter,
  selectCardLimiter,
  tvAuthorizationLimiter,
  speedLimiter
} = require('../config/rateLimiters');
const { normalizeNewRoomConfig } = require('../utils/roomConfiguration');

// Crear sala
router.post('/create', createRoomLimiter, speedLimiter, validateRequest(createRoomSchema), async (req, res) => {
  try {
    const code = await Room.generateUniqueCode();
    
    const hostPlayer = new Player({
      name: req.body.hostName,
      isHost: true
    });
    await hostPlayer.save();

    const hostCapability = crypto.randomBytes(32).toString('base64url');
    const tvCapability = createTvCapability();
    const room = new Room({
      code,
      name: req.body.roomName || `Sala ${code}`,
      host: hostPlayer._id,
      players: [hostPlayer._id],
      config: normalizeNewRoomConfig(req.body.config || {})
    });
    room.hostCapabilityHash = createHostCapabilityHash(hostCapability, room._id);
    room.tvCapabilityHash = createTvCapabilityHash(tvCapability, room._id);
    await room.save();
    
    hostPlayer.room = room._id;
    await hostPlayer.save();
    room.hostCapabilityHash = undefined;
    room.tvCapabilityHash = undefined;

    res.json({
      success: true,
      room: stripPrivatePlayerData(stripGuestCapabilityHashes(await room.populate('players'))),
      player: stripGuestCapabilityHashes(hostPlayer),
      hostCapability,
      tvCapability
    });
  } catch (error) {
    logger.error('Error creating room:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Unirse a sala
router.post('/join', joinRoomLimiter, speedLimiter, validateRequest(joinRoomSchema), async (req, res) => {
  try {
    const roomCode = req.body.roomCode || req.body.code;

    if (!roomCode) {
      return res.status(400).json({ error: 'Código de sala requerido' });
    }

    const room = await Room.findOne({
      code: roomCode.toUpperCase(),
      isActive: true
    });

    if (!room) {
      return res.status(404).json({ error: 'Sala no encontrada' });
    }

    if (room.config?.activePlaylist && typeof room.populate === 'function') {
      await room.populate({ path: 'config.activePlaylist', populate: { path: 'tracks' } });
    }

    const totalPlayers = room.players.length + (room.manualPlayers?.length || 0);
    if (totalPlayers >= room.config.maxPlayers) {
      return res.status(400).json({ error: 'Sala llena' });
    }

    const player = new Player({
      name: req.body.playerName,
      room: room._id,
      isHost: false
    });
    const playerCapability = createPlayerCapability();
    player.guestCapabilityHash = createPlayerCapabilityHash(
      playerCapability,
      room._id,
      player._id
    );
    await player.save();

    room.players.push(player._id);
    room.lastActivity = new Date();
    await room.save();

    // Actualizar timestamp de actividad
    await updateRoomActivity(roomCode);

    res.json({
      success: true,
      room: stripPrivatePlayerData(stripGuestCapabilityHashes(await room.populate('players'))),
      player: stripGuestCapabilityHashes(player),
      playerCapability
    });
  } catch (error) {
    logger.error('Error joining room:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

const findRoomForHostCapability = async (code) => Room.findOne({
  code: code.toUpperCase(),
  isActive: true
}).select('+hostCapabilityHash');

const authorizeRoomHost = async (req, res) => {
  const room = await findRoomForHostCapability(req.params.code);
  if (!room) {
    res.status(404).json({ error: 'Sala no encontrada' });
    return null;
  }
  const authorized = await isRoomHost(req, room, req.get('x-room-host-capability'));
  if (!authorized) {
    res.status(403).json({ error: 'No tienes permisos para autorizar la TV' });
    return null;
  }
  return room;
};

// Generate a one-time TV link. MongoDB stores only the room-bound hash.
router.post('/:code/tv-authorization', tvAuthorizationLimiter, validateRequest(createTvAuthorizationSchema), async (req, res) => {
  try {
    const room = await authorizeRoomHost(req, res);
    if (!room) return;

    const now = new Date();
    const tvToken = createTvAuthorizationToken();
    const linkExpiresAt = new Date(now.getTime() + getTvAuthorizationLinkTtlMs());
    room.tvAuthorization = {
      linkTokenHash: hashTvAuthorizationToken(tvToken, room._id),
      linkExpiresAt,
      linkClaimedAt: undefined,
      sessionTokenHash: undefined,
      sessionExpiresAt: undefined,
      sessionLastSeenAt: undefined,
      revokedAt: undefined
    };
    await room.save();

    revokeTemporaryTvSockets(req.app.get('io'), room.code);
    res.json({
      success: true,
      roomCode: room.code,
      tvToken,
      expiresAt: linkExpiresAt.toISOString()
    });
  } catch (error) {
    logger.error('Error generating TV authorization:', error);
    res.status(500).json({ error: 'No se pudo generar la autorización temporal de TV' });
  }
});

// Consume the one-time link and issue a separate short-lived TV session.
router.post('/:code/tv-authorization/claim', tvAuthorizationLimiter, validateRequest(claimTvAuthorizationSchema), async (req, res) => {
  try {
    const roomCode = req.params.code.toUpperCase();
    const { token } = req.body;
    const room = await Room.findOne({ code: roomCode, isActive: true })
      .select('+tvAuthorization.linkTokenHash +tvAuthorization.sessionTokenHash');
    if (!room || !isTvAuthorizationToken(token)) {
      return res.status(400).json({ error: 'Enlace de TV inválido o expirado' });
    }

    const now = new Date();
    const sessionToken = createTvAuthorizationToken();
    const sessionExpiresAt = new Date(now.getTime() + getTvAuthorizationSessionTtlMs());
    const claimedRoom = await Room.findOneAndUpdate(
      {
        _id: room._id,
        isActive: true,
        'tvAuthorization.linkTokenHash': hashTvAuthorizationToken(token, room._id),
        'tvAuthorization.linkExpiresAt': { $gt: now },
        'tvAuthorization.linkClaimedAt': null,
        'tvAuthorization.revokedAt': null
      },
      {
        $set: {
          'tvAuthorization.linkClaimedAt': now,
          'tvAuthorization.sessionTokenHash': hashTvAuthorizationToken(sessionToken, room._id),
          'tvAuthorization.sessionExpiresAt': sessionExpiresAt,
          'tvAuthorization.sessionLastSeenAt': now
        }
      },
      { new: true, runValidators: true }
    );
    if (!claimedRoom) {
      return res.status(409).json({ error: 'Enlace de TV inválido, expirado o ya utilizado' });
    }

    req.app.get('io')?.to(roomCode).emit('tv-authorization-status', {
      roomCode,
      connected: false,
      claimed: true,
      expiresAt: sessionExpiresAt.toISOString()
    });
    return res.json({
      success: true,
      roomCode,
      tvSessionToken: sessionToken,
      expiresAt: sessionExpiresAt.toISOString()
    });
  } catch (error) {
    logger.error('Error claiming TV authorization:', error);
    return res.status(500).json({ error: 'No se pudo reclamar el enlace de TV' });
  }
});

router.post('/:code/tv-authorization/renew', tvAuthorizationLimiter, validateRequest(renewTvAuthorizationSchema), async (req, res) => {
  try {
    const roomCode = req.params.code.toUpperCase();
    const sessionToken = req.get('x-tv-session-token');
    if (!isTvAuthorizationToken(sessionToken)) {
      return res.status(401).json({ error: 'Sesión de TV inválida' });
    }

    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + getTvAuthorizationSessionTtlMs());
    const roomForSession = await Room.findOne({ code: roomCode, isActive: true })
      .select('+tvAuthorization.sessionTokenHash');
    if (!roomForSession) return res.status(401).json({ error: 'Sesión de TV inválida' });
    const room = await Room.findOneAndUpdate(
      {
        _id: roomForSession._id,
        isActive: true,
        'tvAuthorization.sessionTokenHash': hashTvAuthorizationToken(sessionToken, roomForSession._id),
        'tvAuthorization.sessionExpiresAt': { $gt: now },
        'tvAuthorization.revokedAt': null
      },
      {
        $set: {
          'tvAuthorization.sessionExpiresAt': sessionExpiresAt,
          'tvAuthorization.sessionLastSeenAt': now
        }
      },
      { new: true }
    );
    if (!room) return res.status(401).json({ error: 'Sesión de TV expirada o revocada' });

    req.app.get('io')?.to(roomCode).emit('tv-authorization-status', {
      roomCode,
      connected: true,
      expiresAt: sessionExpiresAt.toISOString()
    });

    return res.json({ success: true, roomCode, expiresAt: sessionExpiresAt.toISOString() });
  } catch (error) {
    logger.error('Error renewing TV authorization:', error);
    return res.status(500).json({ error: 'No se pudo renovar la sesión de TV' });
  }
});

router.post('/:code/tv-authorization/revoke', tvAuthorizationLimiter, validateRequest(revokeTvAuthorizationSchema), async (req, res) => {
  try {
    const room = await authorizeRoomHost(req, res);
    if (!room) return;

    const now = new Date();
    room.tvAuthorization = {
      ...(room.tvAuthorization?.toObject?.() || room.tvAuthorization || {}),
      linkTokenHash: undefined,
      linkExpiresAt: undefined,
      linkClaimedAt: undefined,
      sessionTokenHash: undefined,
      sessionExpiresAt: undefined,
      sessionLastSeenAt: undefined,
      revokedAt: now
    };
    await room.save();
    revokeTemporaryTvSockets(req.app.get('io'), room.code);
    req.app.get('io')?.to(room.code).emit('tv-authorization-status', {
      roomCode: room.code,
      connected: false,
      revokedAt: now.toISOString()
    });
    return res.json({ success: true, roomCode: room.code, revokedAt: now.toISOString() });
  } catch (error) {
    logger.error('Error revoking TV authorization:', error);
    return res.status(500).json({ error: 'No se pudo revocar la autorización de TV' });
  }
});

// Obtener sala
router.get('/:code', generalApiLimiter, validateRequest(getRoomSchema), async (req, res) => {
  try {
    const room = await Room.findOne({ 
      code: req.params.code.toUpperCase() 
    }).populate('players currentGame');
    
    if (!room) {
      return res.status(404).json({ error: 'Sala no encontrada' });
    }
    if (room.config?.activePlaylist && typeof room.populate === 'function') {
      await room.populate({ path: 'config.activePlaylist', populate: { path: 'tracks' } });
    }
    res.json({ room: stripTriviaAnswers(stripPrivatePlayerData(stripGuestCapabilityHashes(room))) });
  } catch (error) {
    logger.error('Error getting room:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Seleccionar cartón
router.post('/:code/select-card', selectCardLimiter, validateRequest(selectCardSchema), async (req, res) => {
  try {
    const { playerId, cardNumber } = req.body;

    if (!playerId || !cardNumber) {
      return res.status(400).json({ error: 'PlayerId y cardNumber requeridos' });
    }

    if (cardNumber < 1 || cardNumber > 200) {
      return res.status(400).json({ error: 'El número de cartón debe estar entre 1 y 200' });
    }

    const room = await Room.findOne({
      code: req.params.code.toUpperCase(),
      isActive: true
    }).select('+hostCapabilityHash').populate('players');

    if (!room) {
      return res.status(404).json({ error: 'Sala no encontrada' });
    }
    const playerIdString = playerId.toString();
    const isRoomMember = room.players.some((player) => player._id.toString() === playerIdString);
    if (!isRoomMember) {
      return res.status(403).json({ error: 'No tienes permisos para modificar este cartón' });
    }

    // Check if card is already taken by another player in this room
    const cardTaken = room.players.some(
      player => player.cardNumber === cardNumber && player._id.toString() !== playerIdString
    );

    if (cardTaken) {
      return res.status(400).json({
        error: `El cartón #${cardNumber} ya está en uso. Elige otro número.`
      });
    }

    // Get the pre-generated card
    const bingoCard = getCard(cardNumber);

    if (!bingoCard) {
      return res.status(500).json({ error: 'Error al obtener el cartón' });
    }

    const isHostPlayer = room.host && room.host.toString() === playerIdString;
    let playerFilter = { _id: playerId, room: room._id };
    if (isHostPlayer) {
      if (!(await isRoomHost(req, room, req.get('x-room-host-capability')))) {
        return res.status(403).json({ error: 'No tienes permisos para modificar este cartón' });
      }
      playerFilter.isHost = true;
    } else {
      const capability = req.get('x-player-capability');
      if (!isPlayerCapability(capability)) {
        return res.status(403).json({ error: 'No tienes permisos para modificar este cartón' });
      }
      playerFilter = {
        ...playerFilter,
        isHost: false,
        guestCapabilityHash: createPlayerCapabilityHash(capability, room._id, playerId)
      };
    }

    if (room.gameState && room.gameState !== 'waiting') {
      return res.status(403).json({ error: 'No se pueden cambiar cartones después de iniciar la partida' });
    }

    const player = await Player.findOneAndUpdate(
      playerFilter,
      {
        $set: {
          cardNumber,
          'bingoCard.matrix': bingoCard,
          'bingoCard.matrixVersion': CARD_MATRIX_VERSION,
          'bingoCard.markedCells': [[2, 2]]
        }
      },
      { new: true, runValidators: true }
    );
    if (!player) {
      return res.status(403).json({ error: 'No tienes permisos para modificar este cartón' });
    }

    // Actualizar timestamp de actividad de la sala
    await updateRoomActivity(req.params.code);

    res.json(stripGuestCapabilityHashes({
      success: true,
      bingoCard: player.bingoCard,
      cardNumber
    }));
  } catch (error) {
    logger.error('Error selecting card:', error);
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'El cartón ya está en uso. Elige otro número.' });
    }
    res.status(500).json({ error: 'No se pudo seleccionar el cartón' });
  }
});

// Actualizar configuración
router.patch('/:code/config', generalApiLimiter, optionalAuth, validateRequest(updateConfigSchema), async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase() }).select('+hostCapabilityHash');
    if (!room) return res.status(404).json({ error: 'Sala no encontrada' });
    const capability = req.get('x-room-host-capability');
    if (!(await isRoomHost(req, room, capability))) {
      return res.status(403).json({ error: 'No tienes permisos para modificar la sala' });
    }
    if (room.gameState && room.gameState !== 'waiting' &&
        (Object.prototype.hasOwnProperty.call(req.body.config, 'gameMode') ||
         Object.prototype.hasOwnProperty.call(req.body.config, 'maxPlayers'))) {
      return res.status(409).json({ error: 'Esta configuración no puede cambiar durante una partida' });
    }
    const currentConfig = typeof room.config?.toObject === 'function'
      ? room.config.toObject()
      : { ...(room.config || {}) };
    const nextConfig = {
      ...currentConfig,
      ...req.body.config,
      enabledChallengeTypes: {
        ...(currentConfig.enabledChallengeTypes || {}),
        ...(req.body.config.enabledChallengeTypes || {})
      }
    };
    if (currentConfig.multimediaPolicy || req.body.config.multimediaPolicy) {
      nextConfig.multimediaPolicy = {
        ...(currentConfig.multimediaPolicy || {}),
        ...(req.body.config.multimediaPolicy || {})
      };
    }
    // Only new/explicitly migrated configurations are normalized. A legacy
    // room remains untouched when an unrelated setting is updated.
    if (req.body.config.eventMode && !currentConfig.eventMode) {
      const normalized = normalizeNewRoomConfig(nextConfig);
      nextConfig.eventMode = normalized.eventMode;
      nextConfig.multimediaPolicy = {
        ...(normalized.multimediaPolicy || {}),
        ...(req.body.config.multimediaPolicy || {})
      };
    }
    room.config = nextConfig;
    await room.save();
    room.hostCapabilityHash = undefined;
    res.json({ success: true, room });
  } catch (error) {
    logger.error('Error updating room config:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Reconectar jugador/organizador (obtener estado actual)
router.post('/:code/reconnect', generalApiLimiter, validateRequest(reconnectSchema), async (req, res) => {
  try {
    const { playerId } = req.body;
    logger.debug(`Reconnect attempt: room=${req.params.code}, playerId=${playerId}`);

    if (!playerId) {
      logger.warn('Reconnect failed: No playerId provided');
      return res.status(400).json({ error: 'PlayerId requerido' });
    }

    const room = await Room.findOne({
      code: req.params.code.toUpperCase(),
      isActive: true
    }).select('+hostCapabilityHash').populate('players currentGame');

    if (!room) {
      return res.status(404).json({ error: 'Sala no encontrada o ya no está activa' });
    }

    const player = await Player.findById(playerId).select('+guestCapabilityHash');

    if (!player) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    const playerRoomId = player.room?._id || player.room;
    const isListedInRoom = room.players.some((roomPlayer) => {
      const listedId = roomPlayer?._id || roomPlayer;
      return listedId?.toString() === player._id.toString();
    });
    if (playerRoomId?.toString() !== room._id.toString() || !isListedInRoom) {
      return res.status(403).json({ error: 'El jugador no pertenece a esta sala' });
    }

    const isHostPlayer = player.isHost && room.host?.toString() === player._id.toString();
    let playerFilter = { _id: player._id, room: room._id, isHost: isHostPlayer };
    if (isHostPlayer) {
      if (!(await isRoomHost(req, room, req.get('x-room-host-capability')))) {
        return res.status(403).json({ error: 'No tienes permisos para reconectar a este jugador' });
      }
    } else {
      if (player.isHost || !matchesPlayerCapability(
        req.get('x-player-capability'),
        player.guestCapabilityHash,
        room._id,
        player._id
      )) {
        return res.status(403).json({ error: 'No tienes permisos para reconectar a este jugador' });
      }
      playerFilter.guestCapabilityHash = player.guestCapabilityHash;
    }

    const connectedPlayer = await Player.findOneAndUpdate(
      playerFilter,
      { $set: { isConnected: true } },
      { new: true, runValidators: true }
    );
    if (!connectedPlayer) {
      return res.status(403).json({ error: 'No tienes permisos para reconectar a este jugador' });
    }

    // Obtener números cantados si hay juego activo
    let calledNumbers = [];
    let currentNumber = null;
    if (room.currentGame) {
      calledNumbers = room.currentGame.calledNumbers || [];
      currentNumber = room.currentGame.currentNumber;
    }

    // Si es host y no tiene cartón, generar un cartón opcional para el organizador
    res.json({
      success: true,
      room: stripTriviaAnswers(stripPrivatePlayerData(stripGuestCapabilityHashes({
        ...room.toObject(),
        players: room.players
      }))),
      player: stripGuestCapabilityHashes(connectedPlayer),
      calledNumbers,
      currentNumber,
      gameState: room.gameState || 'waiting'
    });
  } catch (error) {
    logger.error('Error in reconnect:', error);
    res.status(500).json({ error: 'No se pudo reconectar al jugador' });
  }
});

// ============================================
// RUTAS PARA JUGADORES MANUALES (Cartones Impresos #186-200)
// ============================================

const { successResponse, errorResponse, conflictErrorResponse, notFoundErrorResponse } = require('../utils/errorResponses');

// Asignar cartón manual a jugador
router.post('/:code/assign-manual-card', generalApiLimiter, optionalAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const { playerName, cardNumber } = req.body;

    // Validar nombre
    if (typeof playerName !== 'string' || playerName.trim().length < 2) {
      return res.status(400).json(
        errorResponse('INVALID_INPUT', 'El nombre del jugador debe tener al menos 2 caracteres')
      );
    }

    // Validar número de cartón como entero estricto (debe estar en rango 186-200)
    const cardNum = typeof cardNumber === 'number'
      ? cardNumber
      : typeof cardNumber === 'string' && /^\d+$/.test(cardNumber)
        ? Number(cardNumber)
        : NaN;
    if (!Number.isInteger(cardNum) || cardNum < 186 || cardNum > 200) {
      return res.status(400).json(
        errorResponse('INVALID_CARD', 'El número de cartón debe estar entre 186 y 200')
      );
    }

    const room = await Room.findOne({ code: code.toUpperCase() }).select('+hostCapabilityHash');
    if (!room) {
      return res.status(404).json(notFoundErrorResponse('Sala'));
    }
    if (!(await isRoomHost(req, room, req.get('x-room-host-capability')))) {
      return res.status(403).json(errorResponse('INSUFFICIENT_PERMISSIONS', 'No tienes permisos para modificar la sala'));
    }

    // Verificar que el cartón no esté ya asignado
    const isAlreadyAssigned = room.manualPlayers.some(
      p => p.cardNumber === cardNum
    );

    if (isAlreadyAssigned) {
      return res.status(409).json(
        conflictErrorResponse(`El cartón #${cardNum} ya está asignado a otro jugador`)
      );
    }

    // Crear jugador manual
    const manualPlayer = {
      playerId: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      playerName: playerName.trim(),
      cardNumber: cardNum,
      assignedAt: new Date()
    };

    room.manualPlayers.push(manualPlayer);
    room.reservedCards.push(cardNum);
    await updateRoomActivity(room);
    await room.save();

    res.json(successResponse({
      player: manualPlayer,
      message: `Cartón #${cardNum} asignado a ${playerName.trim()}`
    }));

  } catch (error) {
    logger.error('Error assigning manual card:', error);
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Error interno del servidor'));
  }
});

// Obtener jugadores manuales de una sala
router.get('/:code/manual-players', generalApiLimiter, async (req, res) => {
  try {
    const { code } = req.params;

    const room = await Room.findOne({ code });
    if (!room) {
      return res.status(404).json(notFoundErrorResponse('Sala'));
    }

    res.json(successResponse({
      manualPlayers: room.manualPlayers || [],
      reservedCards: room.reservedCards || [],
      totalManual: room.manualPlayers ? room.manualPlayers.length : 0
    }));

  } catch (error) {
    logger.error('Error getting manual players:', error);
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Error interno del servidor'));
  }
});

// Obtener cartones disponibles (186-200 no asignados)
router.get('/:code/available-manual-cards', generalApiLimiter, async (req, res) => {
  try {
    const { code } = req.params;

    const room = await Room.findOne({ code });
    if (!room) {
      return res.status(404).json(notFoundErrorResponse('Sala'));
    }

    const allManualCards = Array.from({ length: 15 }, (_, i) => 186 + i);
    const reservedCards = room.reservedCards || [];
    const availableCards = allManualCards.filter(card => !reservedCards.includes(card));

    res.json(successResponse({
      available: availableCards,
      reserved: reservedCards,
      totalAvailable: availableCards.length,
      totalReserved: reservedCards.length
    }));

  } catch (error) {
    logger.error('Error getting available cards:', error);
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Error interno del servidor'));
  }
});

// Remover jugador manual
router.delete('/:code/manual-players/:playerId', generalApiLimiter, optionalAuth, async (req, res) => {
  try {
    const { code, playerId } = req.params;

    const room = await Room.findOne({ code: code.toUpperCase() }).select('+hostCapabilityHash');
    if (!room) {
      return res.status(404).json(notFoundErrorResponse('Sala'));
    }
    if (!(await isRoomHost(req, room, req.get('x-room-host-capability')))) {
      return res.status(403).json(errorResponse('INSUFFICIENT_PERMISSIONS', 'No tienes permisos para modificar la sala'));
    }

    const playerIndex = room.manualPlayers.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) {
      return res.status(404).json(notFoundErrorResponse('Jugador manual'));
    }

    const removedPlayer = room.manualPlayers[playerIndex];
    const cardNumber = removedPlayer.cardNumber;

    // Remover jugador y liberar cartón
    room.manualPlayers.splice(playerIndex, 1);
    room.reservedCards = room.reservedCards.filter(c => c !== cardNumber);

    await updateRoomActivity(room);
    await room.save();

    res.json(successResponse({
      message: `Jugador ${removedPlayer.playerName} removido`,
      freedCard: cardNumber
    }));

  } catch (error) {
    logger.error('Error removing manual player:', error);
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Error interno del servidor'));
  }
});

module.exports = router;
