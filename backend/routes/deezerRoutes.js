const express = require('express');
const router = express.Router();
const deezerService = require('../services/deezerService');

// Buscar canciones
router.get('/search', async (req, res) => {
  try {
    const { query, limit } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const tracks = await deezerService.searchTracks(query, limit ? parseInt(limit) : 10);
    res.json({ success: true, tracks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener una canción específica
router.get('/track/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const track = await deezerService.getTrack(id);
    res.json({ success: true, track });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar por género
router.get('/genre/:genre', async (req, res) => {
  try {
    const { genre } = req.params;
    const { limit } = req.query;
    const tracks = await deezerService.searchByGenre(genre, limit ? parseInt(limit) : 20);
    res.json({ success: true, tracks, genre });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
