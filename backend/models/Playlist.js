const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500 },
  tracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdminContent' }],
  enabled: { type: Boolean, default: true },
  archivedAt: { type: Date, default: null }
}, { timestamps: true });

playlistSchema.index({ room: 1, enabled: 1, archivedAt: 1 });

module.exports = mongoose.model('Playlist', playlistSchema);
