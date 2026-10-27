const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  availableNumbers: [Number],
  calledNumbers: [Number],
  currentNumber: Number,
  currentSong: String,
  timeRemaining: {
    type: Number,
    default: 30
  },
  numbersSinceChallenge: {
    type: Number,
    default: 0
  },
  activeChallenge: {
    type: {
      type: String,
      enum: ['trivia', 'dance', 'sing', 'group', 'karaoke']
    },
    // Acepta tanto ObjectId (jugadores digitales) como String (jugadores manuales)
    player: mongoose.Schema.Types.Mixed,
    data: mongoose.Schema.Types.Mixed,
    startTime: Date,
    duration: Number,
    text: String,
    deezerId: String,
    karaokeId: String,
    title: String,
    artist: String,
    localFile: String,
    voteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vote'
    }
  },
  // Votación activa
  activeVoting: {
    voteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vote'
    },
    challengeType: String,
    // Acepta tanto ObjectId (jugadores digitales) como String (jugadores manuales)
    performerId: mongoose.Schema.Types.Mixed,
    performerName: String,
    startTime: Date,
    votesReceived: Number,
    totalVoters: Number
  },
  // Historial de votaciones completadas
  completedVotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vote'
  }],
  // Array que acepta tanto ObjectIds (jugadores digitales) como Strings (jugadores manuales)
  usedPlayers: [mongoose.Schema.Types.Mixed],
  availableSongs: [String],
  gameEvents: [{
    type: {
      type: String,
      enum: ['number_called', 'challenge_completed', 'line_completed', 'bingo', 'player_joined', 'player_left']
    },
    // Acepta tanto ObjectId (jugadores digitales) como String (jugadores manuales)
    player: mongoose.Schema.Types.Mixed,
    data: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  startTime: Date,
  endTime: Date,
  duration: Number,
  winners: [{
    // Acepta tanto ObjectId (jugadores digitales) como String (jugadores manuales)
    player: mongoose.Schema.Types.Mixed,
    playerName: String,
    cardNumber: Number,
    isManualPlayer: Boolean,
    achievement: String,
    timestamp: Date
  }],
  tieBreakActive: {
    type: Boolean,
    default: false
  },
  // Acepta tanto ObjectIds (jugadores digitales) como Strings (jugadores manuales)
  tieCandidates: [mongoose.Schema.Types.Mixed],
  tieWindowEnds: Date,
  tieBreakStatus: {
    type: String,
    enum: ['waiting-for-voting', 'voting', null],
    default: null
  },
  tieBreakCurrentPerformer: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  tieBreakVotes: [{
    voterId: mongoose.Schema.Types.Mixed,
    performerId: mongoose.Schema.Types.Mixed,
    stars: { type: Number, min: 1, max: 5 },
    timestamp: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['active', 'paused', 'finished'],
    default: 'active'
  },
  // Pools disponibles para challenges sin repetición
  availablePools: {
    trivia: [mongoose.Schema.Types.Mixed],
    dance: [mongoose.Schema.Types.Mixed],
    karaoke: [mongoose.Schema.Types.Mixed]
  },
  lastChallengeType: {
    type: String,
    enum: ['trivia', 'dance', 'karaoke'],
    default: null
  }
}, {
  timestamps: true
});

// Inicializar números disponibles al crear el juego
// Los availablePools se inicializan desde gameHandlers al crear el juego
gameSchema.pre('save', function(next) {
  if (this.isNew && this.availableNumbers.length === 0) {
    this.availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
  }
  next();
});

module.exports = mongoose.model('Game', gameSchema);
