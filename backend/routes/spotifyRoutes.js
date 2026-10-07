const express = require('express');
const router = express.Router();

router.get('/login', (req, res) => {
  res.json({ message: 'Configure Spotify OAuth - Ver guía' });
});

module.exports = router;
