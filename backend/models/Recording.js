const mongoose = require('mongoose');

const RecordingSchema = new mongoose.Schema({
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true,
    index: true
  },
  roomCode: {
    type: String,
    required: true,
    index: true
  },
  playerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  playerName: {
    type: String,
    required: true
  },
  challengeType: {
    type: String,
    enum: ['karaoke', 'dance'],
    required: true
  },
  challengeText: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    required: true,
    unique: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    default: 'video/webm'
  },
  fileSize: {
    type: Number,
    required: true
  },
  duration: {
    type: Number,
    default: 30
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Índice compuesto para búsquedas eficientes
RecordingSchema.index({ roomCode: 1, uploadedAt: -1 });
RecordingSchema.index({ playerId: 1, uploadedAt: -1 });
RecordingSchema.index({ challengeType: 1 });

// Métodos estáticos
RecordingSchema.statics.getGameRecordings = async function(roomCode) {
  return this.find({ roomCode })
    .sort({ uploadedAt: -1 })
    .lean();
};

RecordingSchema.statics.getPlayerRecordings = async function(playerId) {
  return this.find({ playerId })
    .sort({ uploadedAt: -1 })
    .lean();
};

RecordingSchema.statics.getRecordingsByType = async function(roomCode, challengeType) {
  return this.find({ roomCode, challengeType })
    .sort({ uploadedAt: -1 })
    .lean();
};

RecordingSchema.statics.deleteOldRecordings = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return this.deleteMany({
    uploadedAt: { $lt: cutoffDate }
  });
};

RecordingSchema.statics.getTopRecordings = async function(roomCode, limit = 10) {
  return this.find({ roomCode })
    .sort({ likes: -1, views: -1 })
    .limit(limit)
    .lean();
};

// Métodos de instancia
RecordingSchema.methods.incrementViews = async function() {
  this.views += 1;
  return this.save();
};

RecordingSchema.methods.incrementLikes = async function() {
  this.likes += 1;
  return this.save();
};

RecordingSchema.methods.decrementLikes = async function() {
  if (this.likes > 0) {
    this.likes -= 1;
    return this.save();
  }
  return this;
};

// Middleware pre-remove para limpiar archivos
RecordingSchema.pre('remove', async function(next) {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    const filepath = path.join(__dirname, '../uploads/recordings', this.filename);
    await fs.unlink(filepath);
    next();
  } catch (error) {
    console.error('Error deleting file:', error);
    next(error);
  }
});

// Virtual para URL del archivo
RecordingSchema.virtual('url').get(function() {
  return `/api/recordings/${this._id}/stream`;
});

// Virtual para duración formateada
RecordingSchema.virtual('formattedDuration').get(function() {
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual para tamaño formateado
RecordingSchema.virtual('formattedSize').get(function() {
  const sizeInMB = (this.fileSize / (1024 * 1024)).toFixed(2);
  return `${sizeInMB} MB`;
});

// Incluir virtuals en JSON
RecordingSchema.set('toJSON', { virtuals: true });
RecordingSchema.set('toObject', { virtuals: true });

const Recording = mongoose.model('Recording', RecordingSchema);

module.exports = Recording;
