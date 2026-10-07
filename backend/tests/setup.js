/**
 * Jest Setup File
 * Configuración global para todos los tests
 */

// Configurar timeout global
jest.setTimeout(10000);

// Mock de logger para evitar output durante tests
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logRoomEvent: jest.fn(),
  logGameEvent: jest.fn(),
  logSocketEvent: jest.fn(),
  logError: jest.fn(),
  logAuthEvent: jest.fn()
}));

// Variables globales para tests
global.testUtils = {
  // Helper para crear mock de jugador
  createMockPlayer: (overrides = {}) => ({
    _id: 'player-123',
    name: 'Test Player',
    isHost: false,
    isConnected: true,
    cardNumber: 1,
    bingoCard: {
      matrix: [
        [1, 2, 3, 4, 5],
        [16, 17, 18, 19, 20],
        [31, 'BINGO', 33, 34, 35],
        [46, 47, 48, 49, 50],
        [61, 62, 63, 64, 65]
      ],
      markedCells: []
    },
    stats: {
      points: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      numbersMarked: 0,
      challengesCompleted: 0,
      bingosAchieved: 0
    },
    ...overrides
  }),

  // Helper para crear mock de sala
  createMockRoom: (overrides = {}) => ({
    _id: 'room-123',
    code: 'TEST01',
    hostName: 'Test Host',
    gameState: 'waiting',
    players: [],
    currentGame: null,
    config: {
      timeBetweenNumbers: 30,
      challengeFrequency: 3,
      maxPlayers: 50
    },
    ...overrides
  }),

  // Helper para crear mock de juego
  createMockGame: (overrides = {}) => ({
    _id: 'game-123',
    room: 'room-123',
    startTime: new Date(),
    endTime: null,
    availableNumbers: Array.from({ length: 75 }, (_, i) => i + 1),
    calledNumbers: [],
    currentNumber: null,
    numbersSinceChallenge: 0,
    activeChallenge: null,
    usedPlayers: [],
    save: jest.fn().mockResolvedValue(this),
    ...overrides
  })
};

// Limpiar después de cada test
afterEach(() => {
  jest.clearAllMocks();
});
