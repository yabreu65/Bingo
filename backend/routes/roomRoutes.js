const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Player = require('../models/Player');
const { getCard } = require('../utils/bingoCards');
const { validateRequest } = require('../middleware/validateRequest');
const { updateRoomActivity } = require('../utils/roomActivity');
const logger = require('../config/logger');
const {
  createRoomSchema,
  joinRoomSchema,
  getRoomSchema,
  selectCardSchema,
  updateConfigSchema,
  reconnectSchema
} = require('../schemas/roomSchemas');
const {
  createRoomLimiter,
  joinRoomLimiter,
  generalApiLimiter,
  selectCardLimiter,
  speedLimiter
} = require('../config/rateLimiters');

// Crear sala
router.post('/create', createRoomLimiter, speedLimiter, validateRequest(createRoomSchema), async (req, res) => {
  try {
    const code = await Room.generateUniqueCode();
    
    const hostPlayer = new Player({
      name: req.body.hostName,
      isHost: true
    });
    await hostPlayer.save();

    const room = new Room({
      code,
      name: req.body.roomName || `Sala ${code}`,
      host: hostPlayer._id,
      players: [hostPlayer._id],
      config: req.body.config || {}
    });
    
    await room.save();
    
    hostPlayer.room = room._id;
    await hostPlayer.save();

    res.json({
      success: true,
      room: await room.populate('players'),
      player: hostPlayer
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    if (room.players.length >= room.config.maxPlayers) {
      return res.status(400).json({ error: 'Sala llena' });
    }

    const player = new Player({
      name: req.body.playerName,
      room: room._id,
      isHost: false
    });
    await player.save();

    room.players.push(player._id);
    room.lastActivity = new Date();
    await room.save();

    // Actualizar timestamp de actividad
    await updateRoomActivity(roomCode);

    res.json({
      success: true,
      room: await room.populate('players'),
      player
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    res.json({ room });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    }).populate('players');

    if (!room) {
      return res.status(404).json({ error: 'Sala no encontrada' });
    }

    // Check if card is already taken by another player in this room
    const cardTaken = room.players.some(
      player => player.cardNumber === cardNumber && player._id.toString() !== playerId
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

    // Update player with selected card
    const player = await Player.findById(playerId);

    if (!player) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    // El cartón ya viene en formato de columnas desde getCard()
    // No necesitamos transformarlo - el frontend espera formato de columnas
    player.cardNumber = cardNumber;
    player.bingoCard.matrix = bingoCard;
    player.bingoCard.markedCells = [[2, 2]]; // Marcar centro como BINGO
    await player.save();

    // Actualizar timestamp de actividad de la sala
    await updateRoomActivity(req.params.code);

    res.json({
      success: true,
      bingoCard: player.bingoCard,
      cardNumber: cardNumber
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar configuración
router.patch('/:code/config', generalApiLimiter, validateRequest(updateConfigSchema), async (req, res) => {
  try {
    const room = await Room.findOneAndUpdate(
      { code: req.params.code.toUpperCase() },
      { config: req.body.config },
      { new: true }
    );

    res.json({ success: true, room });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    }).populate('players currentGame');

    if (!room) {
      return res.status(404).json({ error: 'Sala no encontrada o ya no está activa' });
    }

    const player = await Player.findById(playerId);

    if (!player) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    // Verificar que el jugador pertenece a esta sala
    if (player.room.toString() !== room._id.toString()) {
      return res.status(403).json({ error: 'El jugador no pertenece a esta sala' });
    }

    // Marcar jugador como conectado
    player.isConnected = true;
    await player.save();

    // Obtener números cantados si hay juego activo
    let calledNumbers = [];
    let currentNumber = null;
    if (room.currentGame) {
      calledNumbers = room.currentGame.calledNumbers || [];
      currentNumber = room.currentGame.currentNumber;
    }

    // Si es host y no tiene cartón, generar un cartón opcional para el organizador
    if (player.isHost && !player.cardNumber) {
      // El organizador puede jugar opcionalmente, asignamos cartón #0 (especial para host)
      // No es obligatorio, solo si quiere ver el cartón en el dashboard
      player.cardNumber = 0;
      player.bingoCard.matrix = [];
      await player.save();
    }

    res.json({
      success: true,
      room: {
        ...room.toObject(),
        players: room.players
      },
      player: player.toObject(),
      calledNumbers,
      currentNumber,
      gameState: room.gameState || 'waiting'
    });
  } catch (error) {
    logger.error('Error in reconnect:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RUTAS PARA JUGADORES MANUALES (Cartones Impresos #186-200)
// ============================================

const { successResponse, errorResponse, conflictErrorResponse, notFoundErrorResponse } = require('../utils/errorResponses');

// Asignar cartón manual a jugador
router.post('/:code/assign-manual-card', generalApiLimiter, async (req, res) => {
  try {
    const { code } = req.params;
    const { playerName, cardNumber } = req.body;

    // Validar nombre
    if (!playerName || playerName.trim().length < 2) {
      return res.status(400).json(
        errorResponse('INVALID_INPUT', 'El nombre del jugador debe tener al menos 2 caracteres')
      );
    }

    // Validar número de cartón (debe estar en rango 186-200)
    const cardNum = parseInt(cardNumber);
    if (isNaN(cardNum) || cardNum < 186 || cardNum > 200) {
      return res.status(400).json(
        errorResponse('INVALID_CARD', 'El número de cartón debe estar entre 186 y 200')
      );
    }

    const room = await Room.findOne({ code });
    if (!room) {
      return res.status(404).json(notFoundErrorResponse('Sala'));
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
    res.status(500).json(errorResponse('INTERNAL_ERROR', error.message));
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
    res.status(500).json(errorResponse('INTERNAL_ERROR', error.message));
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
    res.status(500).json(errorResponse('INTERNAL_ERROR', error.message));
  }
});

// Remover jugador manual
router.delete('/:code/manual-players/:playerId', generalApiLimiter, async (req, res) => {
  try {
    const { code, playerId } = req.params;

    const room = await Room.findOne({ code });
    if (!room) {
      return res.status(404).json(notFoundErrorResponse('Sala'));
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
    res.status(500).json(errorResponse('INTERNAL_ERROR', error.message));
  }
});

module.exports = router;
