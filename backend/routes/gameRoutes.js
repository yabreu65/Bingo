const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const Room = require('../models/Room');
const Player = require('../models/Player');
const { optionalAuth } = require('../middleware/authMiddleware');
const { isRoomHost } = require('../middleware/socketAuthMiddleware');
const { validateRequest } = require('../middleware/validateRequest');
const { startGameSchema, getGameSchema } = require('../schemas/gameSchemas');
const logger = require('../config/logger');
const { stripTriviaAnswers } = require('../utils/publicData');
const { initializeChallengePools } = require('../socket/utils/challengeSelector');

router.post('/start', validateRequest(startGameSchema), optionalAuth, async (req, res) => {
  try {
    const room = await Room.findById(req.body.roomId).select('+hostCapabilityHash');
    if (!room) return res.status(404).json({ error: 'Sala no encontrada' });
    const capability = req.get('x-room-host-capability');
    if (!(await isRoomHost(req, room, capability))) {
      return res.status(403).json({ error: 'No tienes permisos para iniciar la sala' });
    }

    if (room.gameState && room.gameState !== 'waiting') {
      return res.status(409).json({ error: 'La sala ya tiene una partida iniciada' });
    }

    let digitalPlayers = null;
    if (Array.isArray(room.players) && typeof Player.countDocuments === 'function') {
      digitalPlayers = await Player.countDocuments({ room: room._id, cardNumber: { $gte: 1, $lte: 200 } });
      const manualPlayers = (room.manualPlayers || []).filter((player) => player.cardNumber != null).length;
      if (digitalPlayers + manualPlayers < 2) {
        return res.status(400).json({ error: 'Se necesitan al menos dos jugadores con cartón' });
      }
    }

    const game = new Game({
      room: room._id,
      gameMode: room.config?.gameMode || 'full',
      startTime: new Date(),
      availablePools: initializeChallengePools()
    });
    await game.save();

    if (digitalPlayers > 0 && typeof Player.updateMany === 'function') {
      await Player.updateMany(
        { room: room._id, cardNumber: { $gte: 1, $lte: 200 } },
        { $inc: { 'stats.gamesPlayed': 1 } }
      );
    }
    
    room.currentGame = game._id;
    room.gameState = 'playing';
    await room.save();
    
    res.json({ success: true, game });
  } catch (error) {
    logger.error('Error starting game:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/:id', validateRequest(getGameSchema), async (req, res) => {
  try {
    const game = await Game.findById(req.params.id).populate('room');
    if (!game) return res.status(404).json({ error: 'Partida no encontrada' });
    res.json({ game: stripTriviaAnswers(game) });
  } catch (error) {
    logger.error('Error getting game:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
