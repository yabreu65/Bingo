const express = require('express');
const router = express.Router();
const Player = require('../models/Player');

router.get('/:id', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    res.json({ player });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/points', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    player.stats.points += req.body.points;
    await player.save();
    res.json({ success: true, player });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
