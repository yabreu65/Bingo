const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const Room = require('../models/Room');

router.post('/start', async (req, res) => {
  try {
    const room = await Room.findById(req.body.roomId);
    const game = new Game({
      room: room._id,
      startTime: new Date()
    });
    await game.save();
    
    room.currentGame = game._id;
    room.gameState = 'playing';
    await room.save();
    
    res.json({ success: true, game });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const game = await Game.findById(req.params.id).populate('room');
    res.json({ game });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
