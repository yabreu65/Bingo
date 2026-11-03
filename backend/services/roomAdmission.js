const crypto = require('crypto');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const Player = require('../models/Player');
const { CARD_MATRIX_VERSION, getCard } = require('../utils/bingoCards');
const { createPlayerCapabilityHash } = require('../utils/playerCapability');

class AdmissionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const participantCountExpression = () => ({
  $add: [
    { $size: { $filter: {
      input: { $ifNull: ['$players', []] },
      as: 'playerId',
      cond: { $ne: ['$$playerId', '$host'] }
    } } },
    { $size: { $ifNull: ['$manualPlayers', []] } }
  ]
});
const capacityAvailable = { $lt: [
  participantCountExpression(),
  { $ifNull: ['$config.maxPlayers', 50] }
] };

const validToken = (token, code) => typeof token === 'string' &&
  new RegExp(`^${code}\\.[A-Za-z0-9_-]{43}$`).test(token);
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const capabilityFor = (token, room, player) => crypto.createHmac('sha256', token)
  .update(`bingo-guest-v1:${room}:${player}`).digest('base64url');

async function transaction(fn) {
  try {
    return await mongoose.connection.transaction(fn, {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000
    });
  } catch (error) {
    // No unsafe fallback to separate writes on standalone MongoDB.
    if (error.code === 20 || error.codeName === 'IllegalOperation') {
      throw new AdmissionError(503, 'La admisión requiere MongoDB con transacciones');
    }
    throw error;
  }
}

async function admitGuest(code, name, token) {
  if (!validToken(token, code)) throw new AdmissionError(400, 'Clave de admisión inválida o de otra sala');
  const admissionTokenHash = hashToken(token);
  return transaction(async session => {
    const room = await Room.findOne({ code, isActive: true }).session(session);
    if (!room) throw new AdmissionError(404, 'Sala no encontrada');
    const existing = await Player.findOne({ room: room._id, admissionTokenHash, isHost: false })
      .select('+guestCapabilityHash').session(session);
    if (existing) {
      if (!room.players.some(id => String(id) === String(existing._id))) {
        throw new AdmissionError(409, 'La admisión requiere revisión del organizador');
      }
      const playerCapability = capabilityFor(token, room._id, existing._id);
      // Do not resurrect an old or rotated capability.
      if (existing.guestCapabilityHash !== createPlayerCapabilityHash(playerCapability, room._id, existing._id)) {
        throw new AdmissionError(403, 'La admisión ya no está autorizada');
      }
      return { room, player: existing, playerCapability };
    }
    const player = new Player({ name, room: room._id, isHost: false, admissionTokenHash });
    const playerCapability = capabilityFor(token, room._id, player._id);
    player.guestCapabilityHash = createPlayerCapabilityHash(playerCapability, room._id, player._id);
    const claimed = await Room.findOneAndUpdate({ _id: room._id, isActive: true, $expr: capacityAvailable },
      { $push: { players: player._id }, $set: { lastActivity: new Date() } },
      { new: true, session, runValidators: true });
    if (!claimed) throw new AdmissionError(400, 'Sala llena');
    await player.save({ session });
    return { room: claimed, player, playerCapability };
  });
}

async function admitManual(roomId, playerName, cardNumber) {
  return transaction(async session => {
    const manualPlayer = { playerId: `manual-${crypto.randomUUID()}`, playerName, cardNumber, assignedAt: new Date() };
    const room = await Room.findById(roomId).session(session);
    if (!room?.isActive) throw new AdmissionError(404, 'Sala no encontrada');
    const digitalCard = await Player.exists({ room: roomId, cardNumber }).session(session);
    if (room.reservedCards.includes(cardNumber) || digitalCard) {
      throw new AdmissionError(409, `El cartón #${cardNumber} ya está asignado a otro jugador`);
    }
    const claimed = await Room.findOneAndUpdate({ _id: roomId, isActive: true,
      reservedCards: { $ne: cardNumber }, $expr: capacityAvailable }, {
      $push: { manualPlayers: manualPlayer, reservedCards: cardNumber },
      $set: { lastActivity: new Date() }
    }, { new: true, session, runValidators: true });
    if (!claimed) throw new AdmissionError(400, 'Sala llena');
    return manualPlayer;
  });
}

async function selectGuestCard(roomId, playerFilter, cardNumber) {
  return transaction(async session => {
    // Both manual and digital card allocation write Room, serializing their
    // snapshots before reading Player. No process-local mutex is relied on.
    const room = await Room.findOneAndUpdate({
      _id: roomId, isActive: true, gameState: 'waiting',
      players: playerFilter._id, reservedCards: { $ne: cardNumber }
    }, { $inc: { __v: 1 }, $set: { lastActivity: new Date() } }, { new: true, session });
    if (!room) throw new AdmissionError(409, 'El cartón no está disponible o la partida ya comenzó');
    const existing = await Player.findOne(playerFilter).session(session);
    if (!existing) throw new AdmissionError(403, 'No tienes permisos para modificar este cartón');
    // Repeating selection must not reset previously persisted marks.
    if (existing.cardNumber === cardNumber) return existing;
    const other = await Player.exists({ room: roomId, cardNumber, _id: { $ne: existing._id } }).session(session);
    if (other) throw new AdmissionError(400, `El cartón #${cardNumber} ya está en uso. Elige otro número.`);
    return Player.findOneAndUpdate(playerFilter, { $set: {
      cardNumber, 'bingoCard.matrix': getCard(cardNumber),
      'bingoCard.matrixVersion': CARD_MATRIX_VERSION, 'bingoCard.markedCells': [[2, 2]]
    } }, { new: true, session, runValidators: true });
  });
}

module.exports = { admitGuest, admitManual, selectGuestCard, transaction, AdmissionError, participantCountExpression };
