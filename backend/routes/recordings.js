const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fsSync = require('fs');
const fs = require('fs').promises;
const Recording = require('../models/Recording');
const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const logger = require('../config/logger');
const { optionalAuth } = require('../middleware/authMiddleware');
const { isRoomHost } = require('../middleware/socketAuthMiddleware');
const { matchesPlayerCapability } = require('../utils/playerCapability');

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

// Asegurarse de que la carpeta de uploads existe
const uploadsDir = path.join(__dirname, '../uploads/recordings');
fsSync.mkdirSync(uploadsDir, { recursive: true });

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

const sameId = (left, right) => {
  const leftId = left?._id || left;
  const rightId = right?._id || right;
  return !!leftId && !!rightId && leftId.toString() === rightId.toString();
};

const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_PATTERN.test(value);

const sendInvalidRecordingId = (res) => res.status(400).json({
  success: false,
  message: 'La grabación no es válida'
});

const parseByteRange = (rangeHeader, fileSize) => {
  if (typeof rangeHeader !== 'string' || !rangeHeader.startsWith('bytes=')) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2]) || fileSize <= 0) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : fileSize - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= fileSize || end < start) {
      return null;
    }
    end = Math.min(end, fileSize - 1);
  }

  return { start, end };
};

async function findRecordingActor(req, room, playerId) {
  const player = await Player.findById(playerId).select('+guestCapabilityHash');
  if (!player || !sameId(player.room, room._id) ||
      !room.players?.some((roomPlayer) => sameId(roomPlayer, player._id))) return null;

  if (await isRoomHost(req, room, req.get('x-room-host-capability'))) {
    return { room, player, role: 'host' };
  }

  if (player.isHost || !matchesPlayerCapability(
    req.get('x-player-capability'), player.guestCapabilityHash, room._id, player._id
  )) return null;

  return { room, player, role: 'player' };
}

async function authorizeRecordingUpload(req, res, next) {
  try {
    const roomCode = req.get('x-room-code')?.trim().toUpperCase();
    const playerId = req.get('x-player-id');
    if (!roomCode || !playerId) {
      return res.status(403).json({ success: false, message: 'No tienes permisos para subir esta grabación' });
    }
    if (!OBJECT_ID_PATTERN.test(playerId)) {
      return res.status(400).json({ success: false, message: 'El jugador no es válido' });
    }

    const room = await Room.findOne({ code: roomCode }).select('+hostCapabilityHash');
    if (!room) return res.status(404).json({ success: false, message: 'Sala no encontrada' });
    const actor = await findRecordingActor(req, room, playerId);
    if (!actor) return res.status(403).json({ success: false, message: 'No tienes permisos para subir esta grabación' });

    req.recordingActor = actor;
    return next();
  } catch (error) {
    logger.error('Error authorizing recording upload:', error);
    return res.status(500).json({ success: false, message: 'No se pudo autorizar la grabación' });
  }
}

// POST /api/recordings/upload
// Sube una grabación de video
router.post('/upload', optionalAuth, authorizeRecordingUpload, upload.single('recording'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se recibió ningún archivo'
      });
    }

    const { challengeType, challengeText, duration } = req.body;
    const { room, player } = req.recordingActor;
    const game = await Game.findById(room.currentGame);
    const gameRoomId = game?.room?._id || game?.room;
    const activeChallenge = game?.activeChallenge;
    const performerId = activeChallenge?.player?._id || activeChallenge?.player;
    if (!game || !sameId(gameRoomId, room._id) ||
        !['karaoke', 'dance'].includes(activeChallenge?.type) ||
        !sameId(performerId, player._id) || challengeType !== activeChallenge.type) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(403).json({ success: false, message: 'No tienes permisos para subir esta grabación' });
    }

    if (typeof challengeText !== 'string' || !challengeText.trim()) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
    }

    const parsedDuration = duration === undefined || duration === ''
      ? 30
      : typeof duration === 'string' && /^\d+(\.\d+)?$/.test(duration)
        ? Number(duration)
        : NaN;
    if (!Number.isFinite(parsedDuration) || parsedDuration < 0 || parsedDuration > 600) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ success: false, message: 'La duración de la grabación no es válida' });
    }

    // Create the recording from server-bound room, game, and performer state.
    const recording = new Recording({
      gameId: game._id,
      roomCode: room.code,
      playerId: player._id,
      playerName: player.name,
      challengeType: activeChallenge.type,
      challengeText: typeof challengeText === 'string' ? challengeText.slice(0, 500) : activeChallenge.type,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      duration: parsedDuration
    });

    await recording.save();

    res.status(201).json({
      success: true,
      message: 'Grabación subida exitosamente',
      recording: recording
    });

  } catch (error) {
    logger.error('Error uploading recording:', error);

    // Intentar eliminar el archivo si hubo error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }

    res.status(500).json({
      success: false,
      message: 'Error al subir la grabación',
      error: 'Error interno del servidor'
    });
  }
});

// GET /api/recordings/game/:roomCode
// Obtiene todas las grabaciones de un juego
router.get('/game/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;
    if (!ROOM_CODE_PATTERN.test(roomCode.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'La sala no es válida' });
    }
    const recordings = await Recording.getGameRecordings(roomCode);

    res.json({
      success: true,
      count: recordings.length,
      recordings
    });

  } catch (error) {
    logger.error('Error fetching game recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las grabaciones',
      error: 'Error interno del servidor'
    });
  }
});

// GET /api/recordings/player/:playerId
// Obtiene todas las grabaciones de un jugador
router.get('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    if (!isObjectId(playerId)) return sendInvalidRecordingId(res);
    const recordings = await Recording.getPlayerRecordings(playerId);

    res.json({
      success: true,
      count: recordings.length,
      recordings
    });

  } catch (error) {
    logger.error('Error fetching player recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las grabaciones del jugador',
      error: 'Error interno del servidor'
    });
  }
});

// GET /api/recordings/:id/stream
// Stream de video para reproducción
router.get('/:id/stream', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return sendInvalidRecordingId(res);
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

    // Obtener tamaño del archivo
    const stat = await fs.stat(filepath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const byteRange = parseByteRange(range, fileSize);

    if (range && !byteRange) {
      return res.status(416)
        .set('Content-Range', `bytes */${fileSize}`)
        .json({ success: false, message: 'El rango solicitado no es válido' });
    }

    // Incrementar vistas solo cuando el archivo y el rango son válidos.
    await recording.incrementViews();

    if (byteRange) {
      const { start, end } = byteRange;
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
        'Accept-Ranges': 'bytes',
        'Content-Type': recording.mimeType
      });

      require('fs').createReadStream(filepath).pipe(res);
    }

  } catch (error) {
    logger.error('Error streaming recording:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reproducir la grabación',
      error: 'Error interno del servidor'
    });
  }
});

// GET /api/recordings/:id
// Obtiene información de una grabación
router.get('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return sendInvalidRecordingId(res);
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
    logger.error('Error fetching recording:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la grabación',
      error: 'Error interno del servidor'
    });
  }
});

// POST /api/recordings/:id/like
// Da like a una grabación
router.post('/:id/like', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return sendInvalidRecordingId(res);
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
    logger.error('Error liking recording:', error);
    res.status(500).json({
      success: false,
      message: 'Error al dar like',
      error: 'Error interno del servidor'
    });
  }
});

// DELETE /api/recordings/:id/like
// Quita like de una grabación
router.delete('/:id/like', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return sendInvalidRecordingId(res);
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
    logger.error('Error unliking recording:', error);
    res.status(500).json({
      success: false,
      message: 'Error al quitar like',
      error: 'Error interno del servidor'
    });
  }
});

// DELETE /api/recordings/:id
// Elimina una grabación
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return sendInvalidRecordingId(res);
    const recording = await Recording.findById(req.params.id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Grabación no encontrada'
      });
    }

    // Eliminar archivo físico
    const room = await Room.findOne({ code: recording.roomCode }).select('+hostCapabilityHash');
    if (!room) {
      return res.status(404).json({ success: false, message: 'Sala no encontrada' });
    }
    const actor = await findRecordingActor(req, room, recording.playerId);
    if (!actor) {
      return res.status(403).json({ success: false, message: 'No tienes permisos para eliminar esta grabación' });
    }

    const filepath = path.join(uploadsDir, recording.filename);
    try {
      await fs.unlink(filepath);
    } catch (error) {
      logger.error('Error deleting recording file:', error);
      return res.status(500).json({ success: false, message: 'No se pudo eliminar el archivo de video' });
    }

    // Eliminar de la base de datos
    await Recording.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Grabación eliminada exitosamente'
    });

  } catch (error) {
    logger.error('Error deleting recording:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la grabación',
      error: 'Error interno del servidor'
    });
  }
});

// GET /api/recordings/game/:roomCode/stats
// Estadísticas de grabaciones de un juego
router.get('/game/:roomCode/stats', async (req, res) => {
  try {
    const { roomCode } = req.params;
    if (!ROOM_CODE_PATTERN.test(roomCode.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'La sala no es válida' });
    }

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
    logger.error('Error fetching recording stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router;
module.exports.parseByteRange = parseByteRange;
