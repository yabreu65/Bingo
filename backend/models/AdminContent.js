const mongoose = require('mongoose');
const ADMIN_CONTENT_KINDS = ['trivia', 'riddle', 'dance', 'sing', 'group', 'karaoke', 'track'];
const adminContentSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  kind: { type: String, enum: ADMIN_CONTENT_KINDS, required: true, index: true },
  title: { type: String, trim: true, maxlength: 200 },
  statement: { type: String, trim: true, required: true, maxlength: 1000 },
  options: [{ type: String, trim: true, maxlength: 200 }],
  correctAnswer: mongoose.Schema.Types.Mixed,
  acceptedAnswers: [{ type: String, trim: true, maxlength: 200 }],
  explanation: { type: String, trim: true, maxlength: 1000 },
  category: { type: String, trim: true, maxlength: 80 },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  points: { type: Number, min: 0, max: 1000, default: 50 },
  timeLimit: { type: Number, min: 5, max: 600, default: 30 },
  minParticipants: { type: Number, min: 1, max: 200, default: 1 },
  maxParticipants: { type: Number, min: 1, max: 200, default: 200 },
  evaluationMethod: { type: String, enum: ['automatic', 'host', 'vote'], default: 'host' },
  artist: { type: String, trim: true, maxlength: 160 },
  genre: { type: String, trim: true, maxlength: 80 },
  resourceId: { type: String, trim: true, maxlength: 200 },
  sourceType: { type: String, enum: ['deezer', 'local', 'synthetic', 'external'], default: 'synthetic' },
  enabled: { type: Boolean, default: true, index: true }, archivedAt: { type: Date, default: null, index: true }
}, { timestamps: true });
adminContentSchema.index({ room: 1, kind: 1, enabled: 1, archivedAt: 1 });
adminContentSchema.index({ room: 1, statement: 1 });
module.exports = mongoose.model('AdminContent', adminContentSchema);
module.exports.ADMIN_CONTENT_KINDS = ADMIN_CONTENT_KINDS;
