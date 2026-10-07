import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { SONGS } from '../data/songs';
import { TRIVIA_QUESTIONS } from '../data/triviaQuestions';
import { DANCE_CHALLENGES, SING_CHALLENGES, GROUP_CHALLENGES } from '../data/challenges';
import {
  generateBingoCard,
  markNumber,
  checkLines,
  checkFullCard,
  checkFourCorners,
  checkCentralCross,
  countCompletedLines
} from '../utils/bingoCardGenerator';
// Puntos eliminados - sistema simplificado sin puntuación

const GameContext = createContext();

export const GameProvider = ({ children }) => {
  // ===== ESTADO PRINCIPAL =====
  const [gameState, setGameState] = useState('registration'); // registration, playing, paused, finished
  const [players, setPlayers] = useState([]);

  // ===== ESTADO DEL BINGO =====
  const [availableNumbers, setAvailableNumbers] = useState([]);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [currentNumber, setCurrentNumber] = useState(null);

  // ===== ESTADO DE CANCIONES =====
  const [availableSongs, setAvailableSongs] = useState([...SONGS]);
  const [currentSong, setCurrentSong] = useState(null);

  // ===== ESTADO DE TIMER =====
  const [timeRemaining, setTimeRemaining] = useState(30);
  const timerIntervalRef = useRef(null);
  const challengeTimeoutRef = useRef(null);

  // ===== ESTADO DE RETOS =====
  const [numbersSinceChallenge, setNumbersSinceChallenge] = useState(0);
  const [activeChallenge, setActiveChallenge] = useState(null);
  const [usedPlayers, setUsedPlayers] = useState([]);

  // ===== CONFIGURACIÓN =====
  const [config, setConfig] = useState({
    timeBetweenNumbers: 30, // segundos
    challengeFrequency: 4, // cada X números
    enabledChallengeTypes: {
      trivia: true,
      dance: true,
      sing: true,
      group: true
    },
    gameMode: 'full', // 'line', 'fourCorners', 'centralCross', 'full'
    soundEnabled: true
  });

  // ===== ESTADO DE TIEMPO =====
  const [gameStartTime, setGameStartTime] = useState(null);
  const [gameDuration, setGameDuration] = useState(0);

  // ===== FUNCIONES DE JUGADORES =====

  const addPlayer = useCallback((name) => {
    if (!name.trim()) {
      return { success: false, message: 'El nombre no puede estar vacío' };
    }

    if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return { success: false, message: 'Este jugador ya está registrado' };
    }

    // Generar un número de cartón basado en el número de jugadores actual (1-200)
    // Esto asegura que cada jugador tenga un cartón determinístico
    const cardNumber = (players.length % 200) + 1;
    const bingoCard = generateBingoCard(cardNumber);

    const newPlayer = {
      id: Date.now() + Math.random(),
      name: name.trim(),
      cardNumber: cardNumber, // Guardar el número de cartón
      bingoCard: bingoCard,
      stats: {
        triviaCorrect: 0,
        triviaAttempted: 0,
        challengesCompleted: 0,
        linesCompleted: 0,
        numbersMarked: 1, // BINGO space
        hasFourCorners: false,
        hasCentralCross: false,
        hasFullCard: false
      }
    };

    setPlayers(prev => [...prev, newPlayer]);
    return { success: true, message: 'Jugador agregado exitosamente' };
  }, [players]);

  const removePlayer = useCallback((playerId) => {
    setPlayers(prev => prev.filter(p => p.id !== playerId));
  }, []);

  // updatePlayerPoints eliminado - sin sistema de puntuación

  const updatePlayerStats = useCallback((playerId, statUpdates) => {
    setPlayers(prev => prev.map(player => {
      if (player.id === playerId) {
        return {
          ...player,
          stats: {
            ...player.stats,
            ...statUpdates
          }
        };
      }
      return player;
    }));
  }, []);

  // ===== FUNCIONES DEL JUEGO =====

  const initializeGame = useCallback(() => {
    // Inicializar números del bingo
    const numbers = [];
    for (let i = 1; i <= 75; i++) {
      numbers.push(i);
    }
    setAvailableNumbers(numbers);
    setCalledNumbers([]);
    setCurrentNumber(null);

    // Inicializar canciones
    setAvailableSongs([...SONGS]);
    setCurrentSong(null);

    // Resetear timer
    setTimeRemaining(config.timeBetweenNumbers);
    setNumbersSinceChallenge(0);
    setUsedPlayers([]);
    setActiveChallenge(null);

    // Iniciar tiempo del juego
    setGameStartTime(Date.now());
    setGameDuration(0);
  }, [config.timeBetweenNumbers]);

  const startGame = useCallback(() => {
    if (players.length < 2) {
      return { success: false, message: 'Se necesitan al menos 2 jugadores' };
    }

    initializeGame();
    setGameState('playing');
    return { success: true };
  }, [players.length, initializeGame]);

  const pauseGame = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setGameState('paused');
  }, []);

  const resumeGame = useCallback(() => {
    setGameState('playing');
  }, []);

  const stopGame = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (challengeTimeoutRef.current) {
      clearTimeout(challengeTimeoutRef.current);
      challengeTimeoutRef.current = null;
    }
    setGameState('registration');
    initializeGame();
    setCurrentNumber(null);
    setCurrentSong(null);
  }, [initializeGame]);

  // ===== FUNCIÓN DE LLAMAR NÚMERO =====

  const changeCurrentSong = useCallback(() => {
    const songPool = availableSongs.length > 0 ? availableSongs : SONGS;
    const randomIndex = Math.floor(Math.random() * songPool.length);
    const song = songPool[randomIndex];

    setAvailableSongs(songPool.filter((_, index) => index !== randomIndex));
    setCurrentSong(song);
  }, [availableSongs]);

  const getAchievementUpdates = useCallback((player) => {
    const { markedCells } = player.bingoCard;
    const updates = {};

    if (!player.stats.linesCompleted && checkLines(markedCells)) {
      updates.linesCompleted = countCompletedLines(markedCells);
    }

    if (!player.stats.hasFourCorners && checkFourCorners(markedCells)) {
      updates.hasFourCorners = true;
    }

    if (!player.stats.hasCentralCross && checkCentralCross(markedCells)) {
      updates.hasCentralCross = true;
    }

    if (!player.stats.hasFullCard && checkFullCard(markedCells)) {
      updates.hasFullCard = true;
    }

    return updates;
  }, []);

  const markNumberInAllCards = useCallback((number) => {
    setPlayers(prev => prev.map(player => {
      const newMarked = markNumber(
        player.bingoCard.matrix,
        player.bingoCard.markedCells,
        number
      );

      const updatedPlayer = {
        ...player,
        bingoCard: {
          ...player.bingoCard,
          markedCells: newMarked
        },
        stats: {
          ...player.stats,
          numbersMarked: newMarked.length,
          ...getAchievementUpdates({
            ...player,
            bingoCard: {
              ...player.bingoCard,
              markedCells: newMarked
            },
            stats: {
              ...player.stats,
              numbersMarked: newMarked.length
            }
          })
        }
      };

      return updatedPlayer;
    }));
  }, [getAchievementUpdates]);

  // ===== FUNCIONES DE RETOS =====

  const triggerChallenge = useCallback(() => {
    if (players.length === 0) return;

    // Seleccionar jugador
    let availablePlayers = players.filter(p => !usedPlayers.includes(p.id));
    if (availablePlayers.length === 0) {
      setUsedPlayers([]);
      availablePlayers = players;
    }

    const randomPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
    setUsedPlayers(prev => [...prev, randomPlayer.id]);

    // Seleccionar tipo de reto
    const enabledTypes = Object.entries(config.enabledChallengeTypes)
      .filter(([, enabled]) => enabled)
      .map(([type]) => type);

    if (enabledTypes.length === 0) return;

    const challengeType = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];

    let challenge;
    switch (challengeType) {
      case 'trivia':
      {
        challenge = {
          type: 'trivia',
          player: randomPlayer,
          data: TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)]
        };
        break;
      }
      case 'dance':
      {
        challenge = {
          type: 'dance',
          player: randomPlayer,
          data: DANCE_CHALLENGES[Math.floor(Math.random() * DANCE_CHALLENGES.length)]
        };
        break;
      }
      case 'sing':
      {
        challenge = {
          type: 'sing',
          player: randomPlayer,
          data: SING_CHALLENGES[Math.floor(Math.random() * SING_CHALLENGES.length)]
        };
        break;
      }
      case 'group':
      {
        challenge = {
          type: 'group',
          player: randomPlayer,
          data: GROUP_CHALLENGES[Math.floor(Math.random() * GROUP_CHALLENGES.length)]
        };
        break;
      }
      default:
        return;
    }

    setActiveChallenge(challenge);
    pauseGame();
  }, [players, usedPlayers, config.enabledChallengeTypes, pauseGame]);

  const completeChallenge = useCallback((success, selectedAnswer) => {
    if (!activeChallenge) return;

    const { type, player } = activeChallenge;

    let statUpdates = {};

    switch (type) {
      case 'trivia':
      {
        const isCorrect = selectedAnswer === activeChallenge.data.correct;

        statUpdates = {
          triviaCorrect: player.stats.triviaCorrect + (isCorrect ? 1 : 0),
          triviaAttempted: player.stats.triviaAttempted + 1
        };
        break;
      }

      case 'dance':
        statUpdates = {
          challengesCompleted: player.stats.challengesCompleted + 1
        };
        break;

      case 'sing':
        statUpdates = {
          challengesCompleted: player.stats.challengesCompleted + 1
        };
        break;

      case 'group':
        // Actualizar estadísticas a todos los jugadores
        players.forEach(p => {
          updatePlayerStats(p.id, {
            challengesCompleted: p.stats.challengesCompleted + 1
          });
        });
        break;
    }

    if (type !== 'group') {
      updatePlayerStats(player.id, statUpdates);
    }

    setActiveChallenge(null);
    resumeGame();
  }, [activeChallenge, players, updatePlayerStats, resumeGame]);

  const callNextNumber = useCallback(() => {
    if (availableNumbers.length === 0) {
      setGameState('finished');
      return;
    }

    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    const number = availableNumbers[randomIndex];

    setAvailableNumbers(prev => prev.filter((_, index) => index !== randomIndex));
    setCalledNumbers(prev => [number, ...prev]);
    setCurrentNumber(number);
    changeCurrentSong();
    markNumberInAllCards(number);
    setTimeRemaining(config.timeBetweenNumbers);

    const newCount = numbersSinceChallenge + 1;
    if (newCount >= config.challengeFrequency) {
      setNumbersSinceChallenge(0);
      challengeTimeoutRef.current = setTimeout(() => {
        challengeTimeoutRef.current = null;
        triggerChallenge();
      }, 1000);
    } else {
      setNumbersSinceChallenge(newCount);
    }
  }, [availableNumbers, numbersSinceChallenge, config, changeCurrentSong, markNumberInAllCards, triggerChallenge]);

  // closeChallenge eliminado - ahora es obligatorio completar

  // ===== EFECTOS =====

  // Timer del juego
  useEffect(() => {
    if (gameState === 'playing' && !activeChallenge) {
      const interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            callNextNumber();
            return config.timeBetweenNumbers;
          }
          return prev - 1;
        });
      }, 1000);

      timerIntervalRef.current = interval;

      return () => clearInterval(interval);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, [gameState, activeChallenge, config.timeBetweenNumbers, callNextNumber]);

  // Duración del juego
  useEffect(() => {
    if (gameState === 'playing' && gameStartTime) {
      const interval = setInterval(() => {
        setGameDuration(Date.now() - gameStartTime);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [gameState, gameStartTime]);

  // ===== VALOR DEL CONTEXTO =====

  const value = {
    // Estado
    gameState,
    players,
    currentNumber,
    calledNumbers,
    currentSong,
    timeRemaining,
    config,
    activeChallenge,
    gameDuration,

    // Funciones de jugadores
    addPlayer,
    removePlayer,

    // Funciones del juego
    startGame,
    pauseGame,
    resumeGame,
    stopGame,
    callNextNumber,

    // Funciones de retos
    triggerChallenge,
    completeChallenge,

    // Configuración
    setConfig,

    // Utilidades
    availableNumbers,
    getRankedPlayers: () => [...players] // Sin ordenamiento por puntos
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export default GameContext;
