const express = require('express');
const router = express.Router();
const Player = require('../models/Player');
const Room = require('../models/Room');
const logger = require('../config/logger');
const { isRoomHost } = require('../middleware/socketAuthMiddleware');
const { matchesPlayerCapability } = require('../utils/playerCapability');
const { stripGuestCapabilityHashes } = require('../utils/publicData');

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

async function findAuthorizedPlayer(req, playerId) {
  const player = await Player.findById(playerId).select('+guestCapabilityHash');
  if (!player) return { missing: true };

  const roomId = player.room?._id || player.room;
  const room = await Room.findById(roomId).select('+hostCapabilityHash');
  if (!room || room._id.toString() !== roomId.toString()) return { missing: true };

  const isListedInRoom = room.players.some((roomPlayer) => {
    const listedId = roomPlayer?._id || roomPlayer;
    return listedId?.toString() === player._id.toString();
  });
  if (!isListedInRoom) return { authorized: false };

  if (player.isHost) {
    const roomHostId = room.host?._id || room.host;
    const isRoomOwner = roomHostId?.toString() === player._id.toString();
    const authorized = isRoomOwner && await isRoomHost(
      req,
      room,
      req.get('x-room-host-capability')
    );
    return authorized ? { authorized: true, player, room, isHost: true } : { authorized: false };
  }

  const authorized = matchesPlayerCapability(
    req.get('x-player-capability'),
    player.guestCapabilityHash,
    room._id,
    player._id
  );
  return authorized ? { authorized: true, player, room, isHost: false } : { authorized: false };
}

router.get('/:id', async (req, res) => {
  try {
    if (!OBJECT_ID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'El identificador del jugador no es válido' });
    }
    const result = await findAuthorizedPlayer(req, req.params.id);
    if (result.missing) return res.status(404).json({ error: 'Jugador no encontrado' });
    if (!result.authorized) return res.status(403).json({ error: 'No tienes permisos para consultar este jugador' });
    return res.json({ player: stripGuestCapabilityHashes(result.player) });
  } catch (error) {
    logger.error('Error fetching player:', error);
    return res.status(500).json({ error: 'No se pudo obtener el jugador' });
  }
});

router.patch('/:id/points', async (req, res) => {
  try {
    if (!OBJECT_ID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'El identificador del jugador no es válido' });
    }
    const points = req.body?.points;
    if (!Number.isInteger(points) || points < -1000 || points > 1000) {
      return res.status(400).json({ error: 'La cantidad de puntos no es válida' });
    }

    const result = await findAuthorizedPlayer(req, req.params.id);
    if (result.missing) return res.status(404).json({ error: 'Jugador no encontrado' });
    if (!result.authorized) return res.status(403).json({ error: 'No tienes permisos para modificar este jugador' });

    const filter = {
      _id: result.player._id,
      room: result.room._id,
      isHost: result.isHost
    };
    if (!result.isHost) filter.guestCapabilityHash = result.player.guestCapabilityHash;

    const player = await Player.findOneAndUpdate(
      filter,
      { $inc: { 'stats.points': points } },
      { new: true, runValidators: true }
    );
    if (!player) return res.status(403).json({ error: 'No tienes permisos para modificar este jugador' });
    return res.json({ success: true, player: stripGuestCapabilityHashes(player) });
  } catch (error) {
    logger.error('Error updating player points:', error);
    return res.status(500).json({ error: 'No se pudieron actualizar los puntos' });
  }
});

module.exports = router;
