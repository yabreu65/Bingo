const express = require('express');
const crypto = require('crypto');
const Room = require('../models/Room');
const AdminContent = require('../models/AdminContent');
const Playlist = require('../models/Playlist');
const Prize = require('../models/Prize');
const { optionalAuth } = require('../middleware/authMiddleware');
const { isRoomHost } = require('../middleware/socketAuthMiddleware');
const { CONTENT_KINDS, normalizeContent, parseImport } = require('../utils/adminCatalog');

const router = express.Router({ mergeParams: true });
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

async function authorizeRoom(req, res, next) {
  try {
    const code = req.params.code?.toUpperCase();
    if (!CODE_PATTERN.test(code)) return res.status(400).json({ error: 'Código de sala inválido' });
    const room = await Room.findOne({ code }).select('+hostCapabilityHash');
    if (!room) return res.status(404).json({ error: 'Sala no encontrada' });
    if (!(await isRoomHost(req, room, req.get('x-room-host-capability')))) return res.status(403).json({ error: 'No tienes permisos administrativos para esta sala' });
    req.adminRoom = room;
    next();
  } catch (error) { next(error); }
}

const sendError = (res, status, message) => res.status(status).json({ success: false, error: message });
function contentProjection(content, includeAnswers = true) {
  const value = content.toObject ? content.toObject() : { ...content };
  if (!includeAnswers) { delete value.correctAnswer; delete value.acceptedAnswers; }
  delete value.__v;
  return value;
}

router.use(optionalAuth);
router.use(authorizeRoom);

router.get('/contents', async (req, res, next) => {
  try {
    const filter = { room: req.adminRoom._id, archivedAt: null };
    if (req.query.kind) { if (!CONTENT_KINDS.has(req.query.kind)) return sendError(res, 400, 'Tipo de contenido inválido'); filter.kind = req.query.kind; }
    if (req.query.enabled !== undefined) filter.enabled = req.query.enabled !== 'false';
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '25', 10)));
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
    if (search) { const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ statement: new RegExp(safe, 'i') }, { title: new RegExp(safe, 'i') }]; }
    const [items, total] = await Promise.all([AdminContent.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit), AdminContent.countDocuments(filter)]);
    res.json({ success: true, items: items.map(item => contentProjection(item)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.post('/contents', async (req, res, next) => {
  try {
    const item = new AdminContent({ room: req.adminRoom._id, ...normalizeContent(req.body?.kind, req.body) });
    await item.save();
    req.adminRoom.config.managedContentEnabled = true;
    await req.adminRoom.save();
    res.status(201).json({ success: true, item: contentProjection(item) });
  } catch (error) { if (error.name === 'Error') return sendError(res, 400, error.message); next(error); }
});

router.get('/contents/:id', async (req, res, next) => {
  try { if (!OBJECT_ID_PATTERN.test(req.params.id)) return sendError(res, 400, 'Contenido inválido'); const item = await AdminContent.findOne({ _id: req.params.id, room: req.adminRoom._id, archivedAt: null }); if (!item) return sendError(res, 404, 'Contenido no encontrado'); res.json({ success: true, item: contentProjection(item) }); }
  catch (error) { next(error); }
});

router.patch('/contents/:id', async (req, res, next) => {
  try {
    if (!OBJECT_ID_PATTERN.test(req.params.id)) return sendError(res, 400, 'Contenido inválido');
    const current = await AdminContent.findOne({ _id: req.params.id, room: req.adminRoom._id, archivedAt: null });
    if (!current) return sendError(res, 404, 'Contenido no encontrado');
    Object.assign(current, normalizeContent(current.kind, { ...current.toObject(), ...req.body }));
    await current.save(); res.json({ success: true, item: contentProjection(current) });
  } catch (error) { if (error.name === 'Error') return sendError(res, 400, error.message); next(error); }
});

router.post('/contents/:id/duplicate', async (req, res, next) => {
  try { const source = await AdminContent.findOne({ _id: req.params.id, room: req.adminRoom._id, archivedAt: null }); if (!source) return sendError(res, 404, 'Contenido no encontrado'); const copy = new AdminContent({ ...source.toObject(), _id: undefined, title: `${source.title || source.statement} (copia)`, createdAt: undefined, updatedAt: undefined }); await copy.save(); res.status(201).json({ success: true, item: contentProjection(copy) }); }
  catch (error) { next(error); }
});

router.delete('/contents/:id', async (req, res, next) => {
  try { const item = await AdminContent.findOneAndUpdate({ _id: req.params.id, room: req.adminRoom._id, archivedAt: null }, { $set: { enabled: false, archivedAt: new Date() } }, { new: true }); if (!item) return sendError(res, 404, 'Contenido no encontrado'); res.json({ success: true, item: contentProjection(item) }); }
  catch (error) { next(error); }
});

router.post('/contents/import', async (req, res, next) => {
  try {
    const rows = parseImport(req.body?.format === 'csv' ? 'csv' : 'json', req.body?.format === 'csv' ? req.body?.data : req.body?.items);
    const valid = []; const invalid = [];
    rows.forEach((row, index) => { try { valid.push(new AdminContent({ room: req.adminRoom._id, ...normalizeContent(row.kind, row) })); } catch (error) { invalid.push({ row: index + 1, error: error.message }); } });
    if (invalid.length) return res.status(422).json({ success: false, imported: 0, invalid, message: 'La importación contiene filas inválidas y no se escribió ninguna fila' });
    if (valid.length) await AdminContent.insertMany(valid, { ordered: true });
    req.adminRoom.config.managedContentEnabled = true; await req.adminRoom.save();
    res.status(201).json({ success: true, imported: valid.length, invalid: [] });
  } catch (error) { sendError(res, 400, error.message); }
});

router.get('/contents/export', async (req, res, next) => {
  try {
    const items = await AdminContent.find({ room: req.adminRoom._id, archivedAt: null }).sort({ kind: 1, updatedAt: -1 });
    if (req.query.format === 'csv') { const headers = ['kind', 'title', 'statement', 'options', 'correctAnswer', 'acceptedAnswers', 'points', 'timeLimit', 'enabled']; const lines = items.map(item => { const value = contentProjection(item); return headers.map(header => JSON.stringify(Array.isArray(value[header]) ? value[header].join('|') : value[header] ?? '')).join(','); }); return res.type('text/csv').send(`${headers.join(',')}\n${lines.join('\n')}`); }
    res.json({ success: true, items: items.map(item => contentProjection(item)) });
  } catch (error) { next(error); }
});

router.get('/playlists', async (req, res, next) => { try { res.json({ success: true, playlists: await Playlist.find({ room: req.adminRoom._id, archivedAt: null }).populate('tracks').sort({ updatedAt: -1 }) }); } catch (error) { next(error); } });

router.post('/playlists', async (req, res, next) => {
  try { const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''; const trackIds = Array.isArray(req.body?.trackIds) ? req.body.trackIds : []; if (!name || name.length > 120 || trackIds.length > 200) return sendError(res, 400, 'Playlist inválida'); const tracks = await AdminContent.find({ _id: { $in: trackIds }, room: req.adminRoom._id, kind: 'track', archivedAt: null }); if (tracks.length !== new Set(trackIds).size) return sendError(res, 400, 'La playlist contiene pistas no autorizadas'); const playlist = await Playlist.create({ room: req.adminRoom._id, name, description: req.body.description, tracks: trackIds, enabled: req.body.enabled !== false }); res.status(201).json({ success: true, playlist }); }
  catch (error) { next(error); }
});

router.patch('/playlists/:id', async (req, res, next) => {
  try { const playlist = await Playlist.findOne({ _id: req.params.id, room: req.adminRoom._id, archivedAt: null }); if (!playlist) return sendError(res, 404, 'Playlist no encontrada'); if (req.body.name !== undefined) playlist.name = String(req.body.name).trim().slice(0, 120); if (req.body.description !== undefined) playlist.description = String(req.body.description).slice(0, 500); if (req.body.enabled !== undefined) playlist.enabled = Boolean(req.body.enabled); if (req.body.trackIds) { const ids = Array.isArray(req.body.trackIds) ? req.body.trackIds : []; const tracks = await AdminContent.find({ _id: { $in: ids }, room: req.adminRoom._id, kind: 'track', archivedAt: null }); if (tracks.length !== new Set(ids).size) return sendError(res, 400, 'La playlist contiene pistas no autorizadas'); playlist.tracks = ids; } await playlist.save(); res.json({ success: true, playlist }); }
  catch (error) { next(error); }
});

router.delete('/playlists/:id', async (req, res, next) => { try { const playlist = await Playlist.findOneAndUpdate({ _id: req.params.id, room: req.adminRoom._id, archivedAt: null }, { $set: { enabled: false, archivedAt: new Date() } }, { new: true }); if (!playlist) return sendError(res, 404, 'Playlist no encontrada'); res.json({ success: true, playlist }); } catch (error) { next(error); } });
router.post('/playlists/:id/activate', async (req, res, next) => { try { const playlist = await Playlist.findOne({ _id: req.params.id, room: req.adminRoom._id, archivedAt: null, enabled: true }); if (!playlist) return sendError(res, 404, 'Playlist no encontrada'); req.adminRoom.config.activePlaylist = playlist._id; await req.adminRoom.save(); res.json({ success: true, playlist, room: req.adminRoom }); } catch (error) { next(error); } });

router.get('/prizes', async (req, res, next) => { try { res.json({ success: true, prizes: await Prize.find({ room: req.adminRoom._id, archivedAt: null }).sort({ updatedAt: -1 }) }); } catch (error) { next(error); } });
router.post('/prizes', async (req, res, next) => { try { const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''; const quantity = Number(req.body?.quantity); if (!name || !Number.isInteger(quantity) || quantity < 0 || quantity > 100000) return sendError(res, 400, 'Premio inválido'); const prize = await Prize.create({ room: req.adminRoom._id, name, description: req.body.description, type: req.body.type, quantity, remaining: quantity, eligibilityRules: req.body.eligibilityRules || {} }); res.status(201).json({ success: true, prize }); } catch (error) { next(error); } });
router.patch('/prizes/:id', async (req, res, next) => { try { const prize = await Prize.findOne({ _id: req.params.id, room: req.adminRoom._id, archivedAt: null }); if (!prize) return sendError(res, 404, 'Premio no encontrado'); if (req.body.name !== undefined) prize.name = String(req.body.name).trim().slice(0, 120); if (req.body.description !== undefined) prize.description = String(req.body.description).slice(0, 500); if (req.body.enabled !== undefined) prize.enabled = Boolean(req.body.enabled); await prize.save(); res.json({ success: true, prize }); } catch (error) { next(error); } });
router.post('/prizes/:id/deliveries', async (req, res, next) => { try { const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId.trim() : ''; const playerName = typeof req.body?.playerName === 'string' ? req.body.playerName.trim().slice(0, 120) : ''; if (!playerId || !playerName) return sendError(res, 400, 'Jugador inválido'); const deliveryId = crypto.randomUUID(); const prize = await Prize.findOneAndUpdate({ _id: req.params.id, room: req.adminRoom._id, archivedAt: null, enabled: true, remaining: { $gt: 0 }, 'deliveries.playerId': { $ne: playerId } }, { $inc: { remaining: -1 }, $push: { deliveries: { deliveryId, playerId, playerName } } }, { new: true, runValidators: true }); if (!prize) return sendError(res, 409, 'Premio agotado o ya entregado a este jugador'); res.status(201).json({ success: true, delivery: prize.deliveries.find(item => item.deliveryId === deliveryId), prize }); } catch (error) { next(error); } });
router.delete('/prizes/:id', async (req, res, next) => { try { const prize = await Prize.findOneAndUpdate({ _id: req.params.id, room: req.adminRoom._id, archivedAt: null }, { $set: { enabled: false, archivedAt: new Date() } }, { new: true }); if (!prize) return sendError(res, 404, 'Premio no encontrado'); res.json({ success: true, prize }); } catch (error) { next(error); } });

module.exports = router;
