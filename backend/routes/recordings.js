const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const Recording = require('../models/Recording');

// Asegurarse de que la carpeta de uploads existe
const uploadsDir = path.join(__dirname, '../uploads/recordings');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Configuración de Multer para almacenamiento de videos
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `recording-${uniqueSuffix}${ext}`);
  }
});

// Filtro para aceptar solo videos
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['video/webm', 'video/mp4', 'video/ogg'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se aceptan videos WebM, MP4 u OGG.'), false);
  }
};

// Configuración de Multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // Máximo 50 MB
  }
});

// POST /api/recordings/upload
// Sube una grabación de video
router.post('/upload', upload.single('recording'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se recibió ningún archivo'
      });
    }

    const {
      gameId,
      roomCode,
      playerId,
      playerName,
      challengeType,
      challengeText,
      duration
    } = req.body;

    // Validación de campos requeridos
    if (!gameId || !roomCode || !playerId || !playerName || !challengeType || !challengeText) {
      // Eliminar archivo si falta información
      await fs.unlink(req.file.path).catch(console.error);

      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos'
      });
    }

    // Validar que sea karaoke o dance
    if (challengeType !== 'karaoke' && challengeType !== 'dance') {
      await fs.unlink(req.file.path).catch(console.error);

      return res.status(400).json({
        success: false,
        message: 'Solo se pueden grabar challenges de karaoke o dance'
      });
    }

    // Crear documento de Recording
    const recording = new Recording({
      gameId,
      roomCode,
      playerId,
      playerName,
      challengeType,
      challengeText,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      duration: parseInt(duration) || 30
    });

    await recording.save();

    res.status(201).json({
      success: true,
      message: 'Grabación subida exitosamente',
      recording: recording
    });

  } catch (error) {
    console.error('Error uploading recording:', error);

    // Intentar eliminar el archivo si hubo error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }

    res.status(500).json({
      success: false,
      message: 'Error al subir la grabación',
      error: error.message
    });
  }
});

// GET /api/recordings/game/:roomCode
// Obtiene todas las grabaciones de un juego
router.get('/game/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const recordings = await Recording.getGameRecordings(roomCode);

    res.json({
      success: true,
      count: recordings.length,
      recordings
    });

  } catch (error) {
    console.error('Error fetching game recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las grabaciones',
      error: error.message
    });
  }
});

// GET /api/recordings/player/:playerId
// Obtiene todas las grabaciones de un jugador
router.get('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const recordings = await Recording.getPlayerRecordings(playerId);

    res.json({
      success: true,
      count: recordings.length,
      recordings
    });

  } catch (error) {
    console.error('Error fetching player recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las grabaciones del jugador',
      error: error.message
    });
  }
});

// GET /api/recordings/:id/stream
// Stream de video para reproducción
router.get('/:id/stream', async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Grabación no encontrada'
      });
    }

    const filepath = path.join(uploadsDir, recording.filename);

    // Verificar que el archivo existe
    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'Archivo de video no encontrado'
      });
    }

    // Incrementar vistas
    await recording.incrementViews();

    // Obtener tamaño del archivo
    const stat = await fs.stat(filepath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Streaming con rango (para reproducción)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      const readStream = require('fs').createReadStream(filepath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': recording.mimeType
      });

      readStream.pipe(res);
    } else {
      // Sin rango, enviar archivo completo
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': recording.mimeType
      });

      require('fs').createReadStream(filepath).pipe(res);
    }

  } catch (error) {
    console.error('Error streaming recording:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reproducir la grabación',
      error: error.message
    });
  }
});

// GET /api/recordings/:id
// Obtiene información de una grabación
router.get('/:id', async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Grabación no encontrada'
      });
    }

    res.json({
      success: true,
      recording
    });

  } catch (error) {
    console.error('Error fetching recording:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la grabación',
      error: error.message
    });
  }
});

// POST /api/recordings/:id/like
// Da like a una grabación
router.post('/:id/like', async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Grabación no encontrada'
      });
    }

    await recording.incrementLikes();

    res.json({
      success: true,
      likes: recording.likes
    });

  } catch (error) {
    console.error('Error liking recording:', error);
    res.status(500).json({
      success: false,
      message: 'Error al dar like',
      error: error.message
    });
  }
});

// DELETE /api/recordings/:id/like
// Quita like de una grabación
router.delete('/:id/like', async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Grabación no encontrada'
      });
    }

    await recording.decrementLikes();

    res.json({
      success: true,
      likes: recording.likes
    });

  } catch (error) {
    console.error('Error unliking recording:', error);
    res.status(500).json({
      success: false,
      message: 'Error al quitar like',
      error: error.message
    });
  }
});

// DELETE /api/recordings/:id
// Elimina una grabación
router.delete('/:id', async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Grabación no encontrada'
      });
    }

    // Eliminar archivo físico
    const filepath = path.join(uploadsDir, recording.filename);
    try {
      await fs.unlink(filepath);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    // Eliminar de la base de datos
    await Recording.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Grabación eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error deleting recording:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la grabación',
      error: error.message
    });
  }
});

// GET /api/recordings/game/:roomCode/stats
// Estadísticas de grabaciones de un juego
router.get('/game/:roomCode/stats', async (req, res) => {
  try {
    const { roomCode } = req.params;

    const recordings = await Recording.find({ roomCode });

    const stats = {
      total: recordings.length,
      karaoke: recordings.filter(r => r.challengeType === 'karaoke').length,
      dance: recordings.filter(r => r.challengeType === 'dance').length,
      totalViews: recordings.reduce((sum, r) => sum + r.views, 0),
      totalLikes: recordings.reduce((sum, r) => sum + r.likes, 0),
      totalSize: recordings.reduce((sum, r) => sum + r.fileSize, 0),
      mostViewed: recordings.sort((a, b) => b.views - a.views)[0] || null,
      mostLiked: recordings.sort((a, b) => b.likes - a.likes)[0] || null
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
});

module.exports = router;
