const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'El email es requerido'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Por favor ingresa un email válido']
  },

  password: {
    type: String,
    required: [true, 'La contraseña es requerida'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
    select: false // No incluir el password en las queries por defecto
  },

  name: {
    type: String,
    required: [true, 'El nombre es requerido'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [50, 'El nombre no puede exceder 50 caracteres']
  },

  role: {
    type: String,
    enum: ['player', 'host', 'admin'],
    default: 'player'
  },

  avatar: {
    type: String,
    default: null
  },

  // Estadísticas históricas del usuario
  stats: {
    totalGamesPlayed: {
      type: Number,
      default: 0
    },
    totalWins: {
      type: Number,
      default: 0
    },
    totalBingos: {
      type: Number,
      default: 0
    },
    totalLines: {
      type: Number,
      default: 0
    },
    totalChallengesCompleted: {
      type: Number,
      default: 0
    },
    totalPoints: {
      type: Number,
      default: 0
    },
    winRate: {
      type: Number,
      default: 0
    },
    favoriteGameMode: {
      type: String,
      enum: ['standard', 'fast', 'mega', null],
      default: null
    }
  },

  // Salas creadas (solo para hosts)
  roomsCreated: {
    type: Number,
    default: 0
  },

  // Settings de usuario
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    soundEffects: {
      type: Boolean,
      default: true
    },
    musicVolume: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1
    }
  },

  isActive: {
    type: Boolean,
    default: true
  },

  lastLogin: {
    type: Date,
    default: null
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Índices para optimizar queries
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

// Middleware para actualizar updatedAt antes de guardar
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Middleware para hashear password antes de guardar
userSchema.pre('save', async function(next) {
  // Solo hashear si el password fue modificado
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Generar salt y hashear password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Error al comparar contraseñas');
  }
};

// Método para calcular win rate
userSchema.methods.calculateWinRate = function() {
  if (this.stats.totalGamesPlayed === 0) {
    this.stats.winRate = 0;
  } else {
    this.stats.winRate = (this.stats.totalWins / this.stats.totalGamesPlayed) * 100;
  }
};

// Método para obtener objeto de usuario sin password
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Método estático para buscar por email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

const User = mongoose.model('User', userSchema);

module.exports = User;
