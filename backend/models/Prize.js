const mongoose = require('mongoose');

const prizeDeliverySchema = new mongoose.Schema({
  deliveryId: { type: String, required: true },
  playerId: { type: String, required: true },
  playerName: { type: String, required: true, trim: true },
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
  deliveredAt: { type: Date, default: Date.now }
}, { _id: false });

const prizeSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500 },
  type: { type: String, enum: ['descriptive', 'physical', 'recognition'], default: 'descriptive' },
  quantity: { type: Number, required: true, min: 0, max: 100000 },
  remaining: { type: Number, required: true, min: 0, max: 100000 },
  eligibilityRules: { type: mongoose.Schema.Types.Mixed, default: {} },
  enabled: { type: Boolean, default: true },
  archivedAt: { type: Date, default: null },
  deliveries: { type: [prizeDeliverySchema], default: [] }
}, { timestamps: true });

prizeSchema.index({ room: 1, enabled: 1, archivedAt: 1 });

module.exports = mongoose.model('Prize', prizeSchema);
