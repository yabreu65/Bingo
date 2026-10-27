const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  hostCapabilityHash: {
    type: String,
    select: false
  },
  players: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  gameState: {
    type: String,
    enum: ['waiting', 'playing', 'paused', 'finished'],
    default: 'waiting'
  },
  config: {
    timeBetweenNumbers: { type: Number, default: 30 },
    challengeFrequency: { type: Number, default: 3 },
    enabledChallengeTypes: {
      trivia: { type: Boolean, default: true },
      dance: { type: Boolean, default: true },
      sing: { type: Boolean, default: true },
      group: { type: Boolean, default: true }
    },
    gameMode: {
      type: String,
      enum: ['line', 'fourCorners', 'centralCross', 'full'],
      default: 'full'
    },
    tieBreakEnabled: { type: Boolean, default: false },
    maxPlayers: { type: Number, default: 50 }
  },
  currentGame: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  spotifyPlaylist: {
    id: String,
    name: String,
    uri: String
  },
  youtubePlaylist: {
    id: String,
    name: String
  },
  musicState: {
    currentSongId: { type: Number, default: null },
    isPlaying: { type: Boolean, default: false },
    volume: { type: Number, default: 0.5 },
    currentTime: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  // Jugadores manuales (con cartones impresos #186-200)
  manualPlayers: [{
    playerId: {
      type: String,
      required: true
    },
    playerName: {
      type: String,
      required: true,
      trim: true
    },
    cardNumber: {
      type: Number,
      required: true,
      min: 186,
      max: 200
    },
    assignedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Cartones reservados (para evitar duplicados)
  reservedCards: {
    type: [Number],
    default: []
  }
}, {
  timestamps: true
});

// Generar código único para la sala
roomSchema.statics.generateUniqueCode = async function() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;

  while (exists) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const room = await this.findOne({ code });
    exists = !!room;
  }

  return code;
};

module.exports = mongoose.model('Room', roomSchema);
