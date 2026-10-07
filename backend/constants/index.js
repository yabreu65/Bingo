/**
 * Game Constants
 * Valores de configuración centralizados para el juego
 */

const GAME_CONSTANTS = {
  // Configuración del Bingo
  BINGO_SIZE: 5,
  MAX_NUMBER: 75,
  MIN_NUMBER: 1,
  MAX_PLAYERS: 50,

  // Configuración de tiempo
  DEFAULT_INTERVAL: 30, // segundos entre números
  MIN_INTERVAL: 5,
  MAX_INTERVAL: 120,
  COUNTDOWN_DURATION: 3, // segundos de countdown antes de empezar

  // Configuración de retos/challenges
  CHALLENGE_FREQUENCY: 3, // cada cuántos números se lanza un reto
  MIN_CHALLENGE_FREQUENCY: 1,
  MAX_CHALLENGE_FREQUENCY: 10,
  CHALLENGE_DURATION: 30, // segundos para completar un reto

  // Watchdog
  WATCHDOG_CHECK_INTERVAL: 1000, // cada cuánto verifica el watchdog (ms)
  WATCHDOG_MAX_GAP_BUFFER: 5, // segundos extra de tolerancia para el watchdog

  // Reconexión
  RECONNECT_TIMEOUT: 30000, // 30 segundos para reconectar antes de desconectar jugador

  // Limpieza de salas inactivas
  ROOM_INACTIVITY_TIMEOUT: 6 * 60 * 60 * 1000, // 6 horas en milisegundos
  CLEANUP_CHECK_INTERVAL: 60 * 60 * 1000, // Revisar cada hora

  // Modos de juego
  GAME_MODES: {
    STANDARD: 'standard',
    FAST: 'fast',
    MEGA: 'mega'
  },

  // Estados del juego
  GAME_STATES: {
    WAITING: 'waiting',
    COUNTDOWN: 'countdown',
    PLAYING: 'playing',
    PAUSED: 'paused',
    FINISHED: 'finished'
  },

  // Tipos de Bingo
  BINGO_TYPES: {
    LINE: 'line',
    FULL_CARD: 'full-card',
    FOUR_CORNERS: 'four-corners',
    CENTRAL_CROSS: 'central-cross'
  },

  // Tipos de retos
  CHALLENGE_TYPES: {
    DANCE: 'dance',
    SING: 'sing',
    TRIVIA: 'trivia',
    GROUP: 'group',
    KARAOKE: 'karaoke'
  },

  // Puntuación
  POINTS: {
    NUMBER_MARKED: 10,
    LINE_COMPLETED: 100,
    FOUR_CORNERS: 150,
    CENTRAL_CROSS: 150,
    FULL_CARD: 500,
    CHALLENGE_COMPLETED: 50,
    TRIVIA_CORRECT: 30,
    KARAOKE_COMPLETED: 75,
    FIRST_BINGO_BONUS: 200
  },

  // Niveles
  LEVELS: [
    { name: '⭐ Novato', stars: 1, minPoints: 0 },
    { name: '⭐⭐ Aprendiz', stars: 2, minPoints: 500 },
    { name: '⭐⭐⭐ Competente', stars: 3, minPoints: 1500 },
    { name: '⭐⭐⭐⭐ Experto', stars: 4, minPoints: 3000 },
    { name: '⭐⭐⭐⭐⭐ Maestro', stars: 5, minPoints: 5000 },
    { name: '🏆 Leyenda', stars: 6, minPoints: 10000 }
  ]
};

/**
 * Challenge Pools
 * Pools de retos con IDs de Deezer
 */
const CHALLENGE_POOLS = {
  dance: [
    { text: 'Baila Thriller', deezerId: '555639' },
    { text: 'Baila como robot', deezerId: '3135556' },
    { text: 'Baila Uptown Funk', deezerId: '92734438' },
    { text: 'Baila Despacito', deezerId: '623698142' },
    { text: 'Baila salsa: Vivir Mi Vida', deezerId: '68771815' },
    { text: 'Baila salsa: La Rebelión', deezerId: '6123964' },
    { text: 'Baila merengue: Suavemente', deezerId: '3135012761' },
    { text: 'Baila bachata: Obsesión', deezerId: '64848628' },
    { text: 'Baila reggaeton: Gasolina', deezerId: '3165861441' },
    { text: 'Baila reggaeton: Con Calma', deezerId: '619949882' }
  ],
  sing: [
    { text: 'Canta Thriller', deezerId: '555639' },
    { text: 'Canta Bohemian Rhapsody', deezerId: '9997018' },
    { text: 'Canta I Will Survive', deezerId: '975366' },
    { text: 'Canta Vivir Mi Vida', deezerId: '68771815' },
    { text: 'Canta All I Want for Christmas', deezerId: '62710442' },
    { text: 'Canta Feliz Navidad', deezerId: '991049' }
  ],
  group: [
    { text: 'Todos bailan en círculo', deezerId: '92734438' },
    { text: 'Todos cantan juntos', deezerId: '68771815' },
    { text: 'Batalla de baile grupal', deezerId: '3165861441' },
    { text: 'Foto grupal bailando', deezerId: '619949882' }
  ],
  trivia: [
    
    {
      question: '¿Cuántas letras tiene la palabra BINGO?',
      options: ['4 letras', '5 letras', '6 letras', '7 letras'],
      correct: 1
    },
    {
      question: '¿Qué instrumento lidera la salsa tradicional?',
      options: ['Guitarra', 'Piano', 'Trompeta', 'Batería'],
      correct: 2
    },
    {
      question: '¿En qué país nació el merengue?',
      options: ['Cuba', 'Puerto Rico', 'República Dominicana', 'Venezuela'],
      correct: 2
    },
    {
      question: '¿Qué significa la O en BINGO?',
      options: ['Números 1-15', 'Números 16-30', 'Números 46-60', 'Números 61-75'],
      correct: 3
    },
    {
      question: '¿Cuál es el baile tradicional de Venezuela?',
      options: ['Salsa', 'Joropo', 'Tango', 'Cumbia'],
      correct: 1
    },
    {
      question: '¿Qué artista es conocido como "El Rey del Reggaeton"?',
      options: ['Don Omar', 'Daddy Yankee', 'Wisin', 'J Balvin'],
      correct: 1
    },
    {
      question: '¿En qué década se popularizó la salsa?',
      options: ['Años 50', 'Años 60', 'Años 70', 'Años 80'],
      correct: 2
    },
    {
      question: '¿Cuál es el instrumento principal en el merengue?',
      options: ['Acordeón', 'Tambora', 'Güira', 'Todos los anteriores'],
      correct: 3
    },
    {
      question: '¿Quién canta "La Vida Es Un Carnaval"?',
      options: ['Celia Cruz', 'Gloria Estefan', 'Shakira', 'Olga Tañón'],
      correct: 0
    },
    {
      question: '¿Cuántos números tiene un cartón completo de bingo?',
      options: ['15 números', '24 números', '25 números', '30 números'],
      correct: 1
    }
  ],
  karaoke: [
    { id: 'karaoke-001', title: 'La Vida Es Un Carnaval', artist: 'Celia Cruz', localFile: 'la-vida-es-un-carnaval.mp4' },
    { id: 'karaoke-002', title: 'El Africano', artist: 'Wilfrido Vargas', localFile: 'el-africano.mp4' },
    { id: 'karaoke-003', title: 'El Meneaito', artist: 'Gaby', localFile: 'el-meneaito.mp4' },
    { id: 'karaoke-004', title: 'Mayonesa', artist: 'Chocolate', localFile: 'mayonesa.mp4' },
    { id: 'karaoke-005', title: 'Aserejé', artist: 'Las Ketchup', localFile: 'asereje.mp4' },
    { id: 'karaoke-006', title: 'Macarena', artist: 'Los del Río', localFile: 'macarena.mp4' },
    { id: 'karaoke-007', title: 'La Flaca', artist: 'Jarabe de Palo', localFile: 'la-flaca.mp4' },
    { id: 'karaoke-008', title: 'De Música Ligera', artist: 'Soda Stereo', localFile: 'de-musica-ligera.mp4' },
    { id: 'karaoke-009', title: 'El Polvorete', artist: 'Vicente Fernández', localFile: 'el-polvorete.mp4' },
    { id: 'karaoke-010', title: 'Caballo Viejo', artist: 'Simón Díaz', localFile: 'caballo-viejo.mp4' },
    { id: 'karaoke-011', title: 'Veneka', artist: 'Rawayana & Akapellah', localFile: 'veneka.mp4' },
    { id: 'karaoke-012', title: 'Colgando de un Hilito', artist: 'Traditional', localFile: 'colgando-de-un-hilito.mp4' }
  ]
};

/**
 * Error Messages
 * Mensajes de error estandarizados
 */
const ERROR_MESSAGES = {
  ROOM_NOT_FOUND: 'Sala no encontrada',
  GAME_NOT_FOUND: 'Juego no encontrado',
  PLAYER_NOT_FOUND: 'Jugador no encontrado',
  ROOM_FULL: 'La sala está llena',
  GAME_ALREADY_STARTED: 'El juego ya ha comenzado',
  INVALID_ROOM_CODE: 'Código de sala inválido',
  UNAUTHORIZED: 'No autorizado para esta acción',
  INVALID_CARD_NUMBER: 'Número de cartón inválido',
  NUMBER_ALREADY_CALLED: 'Este número ya fue cantado',
  INVALID_BINGO_CLAIM: 'Reclamación de bingo inválida',
  CHALLENGE_EXPIRED: 'El reto ha expirado'
};

/**
 * Success Messages
 * Mensajes de éxito estandarizados
 */
const SUCCESS_MESSAGES = {
  ROOM_CREATED: 'Sala creada exitosamente',
  PLAYER_JOINED: 'Jugador unido a la sala',
  GAME_STARTED: 'Juego iniciado',
  NUMBER_CALLED: 'Número cantado',
  BINGO_VALID: '¡Bingo válido!',
  CHALLENGE_COMPLETED: 'Reto completado',
  ROOM_CLOSED: 'Sala cerrada'
};

module.exports = {
  GAME_CONSTANTS,
  CHALLENGE_POOLS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
};
