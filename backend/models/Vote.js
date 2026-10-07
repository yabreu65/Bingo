const mongoose = require('mongoose');

/**
 * Schema de Votación para Challenges
 * Guarda las votaciones de los jugadores después de cada challenge
 */
const VoteSchema = new mongoose.Schema({
  // Identificadores
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

  // Datos del challenge votado
  challengeType: {
    type: String,
    enum: ['dance', 'sing', 'karaoke', 'group', 'trivia'],
    required: true
  },

  challengeText: {
    type: String,
    required: true
  },

  // Jugador que realizó el challenge
  performerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },

  performerName: {
    type: String,
    required: true
  },

  // Datos de la votación
  votes: [{
    voterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true
    },
    voterName: {
      type: String,
      required: true
    },
    stars: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    votedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Resultados calculados
  totalVotes: {
    type: Number,
    default: 0
  },

  averageStars: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },

  bonusPoints: {
    type: Number,
    default: 0
  },

  // Distribución de votos (cuántos votos de cada estrella)
  distribution: {
    one: { type: Number, default: 0 },
    two: { type: Number, default: 0 },
    three: { type: Number, default: 0 },
    four: { type: Number, default: 0 },
    five: { type: Number, default: 0 }
  },

  // Estado
  isComplete: {
    type: Boolean,
    default: false
  },

  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Índices compuestos para búsquedas rápidas
VoteSchema.index({ gameId: 1, performerId: 1 });
VoteSchema.index({ roomCode: 1, createdAt: -1 });

// Método para calcular estadísticas
VoteSchema.methods.calculateStats = function() {
  if (this.votes.length === 0) {
    return {
      totalVotes: 0,
      averageStars: 0,
      bonusPoints: 0
    };
  }

  const totalStars = this.votes.reduce((sum, vote) => sum + vote.stars, 0);
  const average = totalStars / this.votes.length;
  const bonus = Math.round(average * 10); // 4.5 estrellas = 45 puntos

  // Calcular distribución
  const dist = {
    one: 0,
    two: 0,
    three: 0,
    four: 0,
    five: 0
  };

  this.votes.forEach(vote => {
    if (vote.stars === 1) dist.one++;
    else if (vote.stars === 2) dist.two++;
    else if (vote.stars === 3) dist.three++;
    else if (vote.stars === 4) dist.four++;
    else if (vote.stars === 5) dist.five++;
  });

  this.totalVotes = this.votes.length;
  this.averageStars = Math.round(average * 10) / 10; // Redondear a 1 decimal
  this.bonusPoints = bonus;
  this.distribution = dist;

  return {
    totalVotes: this.totalVotes,
    averageStars: this.averageStars,
    bonusPoints: this.bonusPoints,
    distribution: this.distribution
  };
};

// Método para agregar un voto
VoteSchema.methods.addVote = function(voterId, voterName, stars) {
  // Verificar que no haya votado ya
  const alreadyVoted = this.votes.some(v => v.voterId.toString() === voterId.toString());
  if (alreadyVoted) {
    throw new Error('Este jugador ya votó');
  }

  // Verificar que no se vote a sí mismo
  if (voterId.toString() === this.performerId.toString()) {
    throw new Error('No puedes votarte a ti mismo');
  }

  this.votes.push({
    voterId,
    voterName,
    stars,
    votedAt: new Date()
  });

  // Recalcular estadísticas
  this.calculateStats();
};

// Método estático para obtener mejores performances por tipo
VoteSchema.statics.getBestPerformances = async function(gameId) {
  const votes = await this.find({
    gameId,
    isComplete: true
  }).sort({ averageStars: -1 });

  const best = {
    karaoke: null,
    dance: null,
    sing: null,
    group: null,
    overall: null
  };

  // Mejor karaoke
  best.karaoke = votes.find(v => v.challengeType === 'karaoke');

  // Mejor baile
  best.dance = votes.find(v => v.challengeType === 'dance');

  // Mejor canto
  best.sing = votes.find(v => v.challengeType === 'sing');

  // Mejor grupal
  best.group = votes.find(v => v.challengeType === 'group');

  // Mejor en general (sin importar tipo)
  best.overall = votes.length > 0 ? votes[0] : null;

  return best;
};

const Vote = mongoose.model('Vote', VoteSchema);

module.exports = Vote;
