const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null para jugadores invitados
  },
  name: {
    type: String,
    trim: true,
    // Solo requerido si no hay usuario autenticado (invitado)
    required: function() {
      return !this.user;
    }
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  isHost: {
    type: Boolean,
    default: false
  },
  socketId: {
    type: String
  },
  cardNumber: {
    type: Number,
    min: 1,
    max: 200
  },
  bingoCard: {
    matrix: {
      type: Array,
      default: []
    },
    markedCells: {
      type: Array,
      default: []
    }
  },
  stats: {
    points: { type: Number, default: 0 },
    level: {
      name: { type: String, default: '⭐ Novato' },
      stars: { type: Number, default: 1 }
    },
    triviaCorrect: { type: Number, default: 0 },
    triviaAttempted: { type: Number, default: 0 },
    triviaStreak: { type: Number, default: 0 },
    challengesCompleted: { type: Number, default: 0 },
    linesCompleted: { type: Number, default: 0 },
    numbersMarked: { type: Number, default: 1 },
    hasFourCorners: { type: Boolean, default: false },
    hasCentralCross: { type: Boolean, default: false },
    hasFullCard: { type: Boolean, default: false }
  },
  photos: [{
    url: String,
    challengeType: String,
    timestamp: Date
  }],
  isConnected: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

/**
 * Virtual para obtener el nombre de visualización del jugador
 * Si tiene usuario autenticado, usa el nombre del usuario
 * Si es invitado, usa el nombre guardado en el documento
 */
playerSchema.virtual('displayName').get(function() {
  if (this.user && this.user.name) {
    return this.user.name;
  }
  return this.name;
});

/**
 * Asegurar que los virtuals se incluyan en JSON
 */
playerSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

/**
 * Pre-save hook para sincronizar el nombre del usuario
 * Si el jugador tiene usuario autenticado, actualiza el nombre
 */
playerSchema.pre('save', async function(next) {
  if (this.isModified('user') && this.user) {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(this.user);
      if (user) {
        this.name = user.name;
      }
    } catch (error) {
      console.error('Error al sincronizar nombre de usuario:', error);
    }
  }
  next();
});

module.exports = mongoose.model('Player', playerSchema);
