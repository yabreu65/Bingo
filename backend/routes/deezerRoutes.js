const express = require('express');
const router = express.Router();
const deezerService = require('../services/deezerService');
const logger = require('../config/logger');

const parseLimit = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
};

// Buscar canciones
router.get('/search', async (req, res) => {
  try {
    const { query, limit } = req.query;

    if (typeof query !== 'string' || !query.trim() || query.length > 200) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const parsedLimit = parseLimit(limit, 10);
    if (parsedLimit === null) return res.status(400).json({ error: 'Limit parameter is invalid' });

    const tracks = await deezerService.searchTracks(query.trim(), parsedLimit);
    res.json({ success: true, tracks });
  } catch (error) {
    logger.error('Error searching Deezer tracks:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener una canción específica
router.get('/track/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d{1,20}$/.test(id)) return res.status(400).json({ error: 'Track ID is invalid' });
    const track = await deezerService.getTrack(id);
    res.json({ success: true, track });
  } catch (error) {
    logger.error('Error getting Deezer track:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Buscar por género
router.get('/genre/:genre', async (req, res) => {
  try {
    const { genre } = req.params;
    const { limit } = req.query;
    if (!/^[a-zA-Z0-9 -]{1,80}$/.test(genre)) {
      return res.status(400).json({ error: 'Genre is invalid' });
    }
    const parsedLimit = parseLimit(limit, 20);
    if (parsedLimit === null) return res.status(400).json({ error: 'Limit parameter is invalid' });
    const tracks = await deezerService.searchByGenre(genre.trim(), parsedLimit);
    res.json({ success: true, tracks, genre });
  } catch (error) {
    logger.error('Error searching Deezer by genre:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
