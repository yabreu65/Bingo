"use client";
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { showError, showSuccess } from '../../utils/toastUtils';
import { useSocket } from '../../context/useSocket';
import { API_URL } from '../../config/api';
import { QRCodeSVG } from 'qrcode.react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RefreshCw, Users, Link as LinkIcon, Tv, X, Search, Crown, Mic, Music, Gift, Target, Clock, Video, Eye, CheckCircle, XCircle, Settings } from 'lucide-react';
import RecordingChallenge from '../Recording/RecordingChallenge';
import { getShareableUrl } from '../../utils/networkUtils';
import { createTVDisplayURL, openTVDisplay } from '../../utils/tvAuthorization';
import AdminCenter from './AdminCenter';
import './OrganizerDashboard.css';
import {
  CARD_MATRIX_VERSION,
  checkBingoWithCalledNumbers,
  generateBingoCard,
  getCardCell
} from '../../utils/bingoCardGenerator';

// --- Subcomponentes de UI ---

const DashboardSection = ({ title, children, className = '' }) => (
  <motion.section
    className={`bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700/50 rounded-2xl p-6 shadow-xl backdrop-blur-sm ${className}`}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    {title && <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 mb-4">{title}</h3>}
    {children}
  </motion.section>
);

const ActionButton = ({ icon, label, onClick, disabled = false, variant = 'primary', className = '' }) => {
  const baseClasses = 'flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 shadow-lg';
  const variants = {
    primary: 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white focus:ring-indigo-500 disabled:from-indigo-800/50 disabled:to-indigo-900/50 disabled:text-slate-500 shadow-indigo-500/50',
    secondary: 'bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-slate-200 focus:ring-slate-500 disabled:from-slate-800 disabled:to-slate-900 disabled:text-slate-600 shadow-slate-500/30',
    danger: 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white focus:ring-red-500 disabled:from-red-800/50 disabled:to-red-900/50 disabled:text-slate-500 shadow-red-500/50',
    success: 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white focus:ring-green-500 shadow-green-500/50',
    warning: 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white focus:ring-amber-500 shadow-amber-500/50',
  };
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variants[variant]} ${className}`}
      whileHover={{ scale: disabled ? 1 : 1.05, y: disabled ? 0 : -2 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
    >
      {icon}
      {label && <span>{label}</span>}
    </motion.button>
  );
};

const StatCard = ({ icon, title, value, color = 'indigo' }) => {
  const colorClasses = {
    indigo: 'from-indigo-600 to-indigo-500',
    purple: 'from-purple-600 to-purple-500',
    blue: 'from-blue-600 to-blue-500',
    green: 'from-green-600 to-green-500',
  };

  return (
    <motion.div
      className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700/50 p-5 rounded-2xl flex items-center gap-4 shadow-xl hover:shadow-2xl transition-all duration-300"
      whileHover={{ y: -4, scale: 1.02 }}
    >
      <div className={`bg-gradient-to-br ${colorClasses[color]} p-4 rounded-xl shadow-lg`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm text-slate-400 font-medium">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
      </div>
    </motion.div>
  );
};

const PlayerCard = ({ player, onKick, isManual = false, onViewCard }) => (
    <motion.div
      className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-800/60 to-slate-700/60 rounded-xl hover:from-slate-700/80 hover:to-slate-600/80 transition-all duration-300 border border-slate-600/30"
      whileHover={{ x: 4 }}
    >
        <div className="flex items-center gap-3">
            <div className="relative">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${
                  isManual
                    ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                    : 'bg-gradient-to-br from-indigo-500 to-purple-500'
                }`}>
                    {player.name?.charAt(0).toUpperCase() || player.playerName?.charAt(0).toUpperCase()}
                </div>
                {!isManual && (
                  <span className={`absolute -bottom-0.5 -right-0.5 block h-4 w-4 rounded-full border-2 border-slate-800 ${player.isConnected ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-red-500'}`} />
                )}
                {isManual && (
                  <span className="absolute -bottom-0.5 -right-0.5 text-xs">📄</span>
                )}
            </div>
            <div>
                <p className="font-semibold text-white flex items-center gap-2">
                    {player.name || player.playerName}
                    {player.isHost && <Crown size={16} className="text-yellow-400" />}
                    {isManual && <span className="text-xs bg-amber-600/30 text-amber-300 px-2 py-0.5 rounded">Manual</span>}
                </p>
                <p className="text-xs text-slate-400">
                    {player.cardNumber ? `Cartón #${player.cardNumber}` : 'Sin cartón'} {!isManual && `• Puntos: ${player.score || 0}`}
                </p>
            </div>
        </div>
        <div className="flex items-center gap-2">
            {isManual && onViewCard && (
                <motion.button
                    onClick={() => onViewCard(player)}
                    className="p-2 rounded-lg bg-amber-600/20 hover:bg-amber-600 text-amber-400 hover:text-white transition-all duration-300"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    title="Ver cartón y validar BINGO"
                >
                    <Eye size={18} />
                </motion.button>
            )}
            {!player.isHost && (
                <motion.button
                    onClick={() => onKick(isManual ? player.playerId : player._id)}
                    className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white transition-all duration-300"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <X size={18} />
                </motion.button>
            )}
        </div>
    </motion.div>
);

const ManualPlayerModal = ({ isOpen, onClose, onAssign, formData, setFormData, availableCards }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-700 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
            📄 Asignar Cartón Impreso
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Nombre del jugador
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: María López"
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Número de cartón (186-200)
            </label>
            <select
              value={formData.cardNumber || ''}
              onChange={(e) => setFormData({ ...formData, cardNumber: Number(e.target.value) })}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
            >
              <option value="">Selecciona un cartón...</option>
              {availableCards.map(num => (
                <option key={num} value={num}>
                  Cartón #{num}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-2">
              {availableCards.length} cartones disponibles
            </p>
          </div>

          <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4">
            <p className="text-amber-300 text-sm">
              💡 <strong>Nota:</strong> Estos cartones están impresos y reservados para jugadores sin conexión. Asegúrate de entregar el cartón físico al jugador.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold text-white transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onAssign}
            disabled={!formData.name.trim() || !formData.cardNumber}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 rounded-xl font-semibold text-white transition-all shadow-lg"
          >
            Asignar Cartón
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const ManualBingoValidator = ({ isOpen, onClose, player, calledNumbers, gameMode, onConfirmBingo }) => {
  if (!isOpen || !player) return null;

  // Generar cartón del jugador manual
  const cardData = generateBingoCard(player.cardNumber);
  const matrix = cardData.matrix;

  // Verificar si hay BINGO
  const { hasBingo, pattern, markedCells } = checkBingoWithCalledNumbers(matrix, calledNumbers, gameMode);

  // Crear set de celdas marcadas para búsqueda rápida
  const markedSet = new Set(markedCells.map(([r, c]) => `${r},${c}`));

  const getCellColor = (row, col) => {
    const isMarked = markedSet.has(`${row},${col}`);
    if (row === 2 && col === 2) return 'bg-yellow-500'; // FREE space
    return isMarked ? 'bg-green-600' : 'bg-slate-700';
  };

  const letters = ['B', 'I', 'N', 'G', 'O'];
  const letterColors = {
    B: 'bg-red-600',
    I: 'bg-blue-600',
    N: 'bg-green-600',
    G: 'bg-orange-600',
    O: 'bg-purple-600'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 max-w-2xl w-full border border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-2xl font-bold text-white flex items-center gap-2">
              <Eye size={28} className="text-amber-400" />
              Validar BINGO - {player.playerName}
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              Cartón #{player.cardNumber} (Impreso)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Estado del BINGO */}
        <div className={`mb-6 p-4 rounded-xl border-2 ${hasBingo ? 'bg-green-900/30 border-green-500' : 'bg-red-900/30 border-red-500'}`}>
          <div className="flex items-center gap-3">
            {hasBingo ? (
              <>
                <CheckCircle size={32} className="text-green-400" />
                <div>
                  <p className="text-green-300 font-bold text-lg">¡BINGO VÁLIDO!</p>
                  <p className="text-green-400 text-sm">Patrón: {pattern}</p>
                </div>
              </>
            ) : (
              <>
                <XCircle size={32} className="text-red-400" />
                <div>
                  <p className="text-red-300 font-bold text-lg">BINGO NO VÁLIDO</p>
                  <p className="text-red-400 text-sm">El cartón no cumple con el patrón requerido</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Header B-I-N-G-O */}
        <div className="grid grid-cols-5 gap-2 mb-2">
          {letters.map(letter => (
            <div
              key={letter}
              className={`${letterColors[letter]} text-white font-bold text-2xl py-3 rounded-lg text-center shadow-lg`}
            >
              {letter}
            </div>
          ))}
        </div>

        {/* Cartón 5x5 */}
        <div className="grid grid-cols-5 gap-2 mb-6">
          {Array.from({ length: 5 }, (_, rowIdx) =>
            Array.from({ length: 5 }, (_, colIdx) => {
              const cell = getCardCell(matrix, rowIdx, colIdx, CARD_MATRIX_VERSION);
              const isMarked = markedSet.has(`${rowIdx},${colIdx}`);
              const isFree = cell === 'BINGO';

              return (
                <motion.div
                  key={`${rowIdx}-${colIdx}`}
                  className={`${getCellColor(rowIdx, colIdx)} rounded-lg p-4 flex items-center justify-center text-white font-bold text-xl relative shadow-lg aspect-square`}
                  whileHover={{ scale: 1.05 }}
                >
                  {isFree ? (
                    <span className="text-sm font-black">FREE</span>
                  ) : (
                    <span>{cell}</span>
                  )}
                  {isMarked && !isFree && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 border-4 border-white rounded-full opacity-70"></div>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>

        {/* Información adicional */}
        <div className="bg-slate-700/50 rounded-lg p-4 mb-4">
          <p className="text-slate-300 text-sm mb-2">
            <strong>Números cantados:</strong> {calledNumbers.length} números
          </p>
          <p className="text-slate-300 text-sm mb-2">
            <strong>Celdas marcadas:</strong> {markedCells.length} de 25
          </p>
          <p className="text-slate-300 text-sm">
            <strong>Modo de juego:</strong> {gameMode === 'full' ? 'Cartón completo' : gameMode === 'line' ? 'Línea' : gameMode === 'fourCorners' ? '4 Esquinas' : 'Cruz Central'}
          </p>
        </div>

        {/* Leyenda */}
        <div className="flex gap-4 mb-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-600 rounded"></div>
            <span className="text-slate-300">Marcado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-slate-700 rounded"></div>
            <span className="text-slate-300">No marcado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded"></div>
            <span className="text-slate-300">FREE</span>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold text-white transition-all"
          >
            Cerrar
          </button>
          {hasBingo && (
            <button
              onClick={() => onConfirmBingo(player)}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 rounded-xl font-semibold text-white transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <CheckCircle size={20} />
              Confirmar BINGO
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};


// --- Componente Principal del Dashboard ---

const normalizeRoomState = (room, roomCode) => ({
  ...(room || {}),
  code: room?.code || roomCode || '',
  config: room?.config || {},
  players: Array.isArray(room?.players) ? room.players : []
});

export default function OrganizerDashboard({ roomData }) {
  const { socket, joinRoom } = useSocket();

  // Estados del componente con valores por defecto seguros
  const [roomState, setRoomState] = useState(() => normalizeRoomState(roomData.room, roomData.roomCode));
  const [gameState, setGameState] = useState(roomData.room?.gameStarted ? 'playing' : 'waiting');
  const [currentNumber, setCurrentNumber] = useState(null);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [nextNumberIn, setNextNumberIn] = useState(roomState?.config?.timeBetweenNumbers || 30);
  const [searchPlayer, setSearchPlayer] = useState('');
  const [showRecording, setShowRecording] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState(null);
  const [activeVoting, setActiveVoting] = useState(null);
  const [recordingCompleted, setRecordingCompleted] = useState(false);
  const tieBreakOn = !!roomState?.config?.tieBreakEnabled;

  // Estados para jugadores manuales (cartones impresos)
  const [manualPlayers, setManualPlayers] = useState([]);
  const [availableCards, setAvailableCards] = useState([]);
  const [showManualPlayerModal, setShowManualPlayerModal] = useState(false);
  const [manualPlayerForm, setManualPlayerForm] = useState({ name: '', cardNumber: null });

  // Estados para validador de BINGO manual
  const [showBingoValidator, setShowBingoValidator] = useState(false);
  const [validatingPlayer, setValidatingPlayer] = useState(null);
  const [showAdminCenter, setShowAdminCenter] = useState(false);

  // Conectar al socket room cuando el componente se monta
  useEffect(() => {
    if (!socket || !roomData) return;

    console.log('🎮 Dashboard joining room:', roomState.code);
    joinRoom(roomState.code, roomData.playerId, roomData.hostCapability, (response) => {
      if (response?.success) {
        console.log('✅ Dashboard joined room successfully');

        // Sincronizar estado del dashboard después de conectar
        console.log('🔄 Requesting dashboard state sync...');
        socket.emit('sync-dashboard', {
          roomCode: roomState.code,
          hostCapability: roomData.hostCapability
        }, (syncResponse) => {
          if (syncResponse?.success) {
            console.log('✅ Dashboard state synced:', syncResponse.data);

            // Actualizar todos los estados con los datos sincronizados
            const { room, gameState: newGameState, currentNumber: syncedNumber, calledNumbers: syncedNumbers } = syncResponse.data;

            if (room) setRoomState((previous) => normalizeRoomState(room, previous.code));
            if (newGameState) setGameState(newGameState);
            if (syncedNumber !== undefined) setCurrentNumber(syncedNumber);
            if (syncedNumbers) setCalledNumbers(syncedNumbers);

            toast.success('Dashboard sincronizado correctamente');
          } else {
            console.error('❌ Failed to sync dashboard state:', syncResponse?.error);
          }
        });
      } else {
        console.error('❌ Failed to join room:', response?.error);
      }
    });

    // NO emitir leave-room en cleanup para permitir reconexión
    // El organizador debe poder cerrar y volver al dashboard
    return () => {
      console.log('🎮 Dashboard component unmounting (but NOT leaving room for reconnection)');
    };
  }, [joinRoom, socket, roomState.code, roomData]);

  // Efectos para la comunicación con el socket
  useEffect(() => {
    if (!socket) return;

    const handleRoomUpdate = (updatedRoom) => {
      setRoomState((previous) => normalizeRoomState(updatedRoom, previous.code));
    };
    const handleNumberCalled = (data) => {
      setCurrentNumber(data.number);
      setCalledNumbers(prev => [data.number, ...prev]);
      setNextNumberIn(roomState.config?.timeBetweenNumbers || 30);
    };
    const handleGameStateChanged = (data) => {
        setGameState(data.state);
    };
    const handleGameStarted = (data) => {
        setGameState('playing');
        setCurrentNumber(data.firstCalledNumber);
        setCalledNumbers([data.firstCalledNumber]);
    };
    const handleGameReset = () => {
        setGameState('waiting');
        setCurrentNumber(null);
        setCalledNumbers([]);
        setNextNumberIn(roomState.config?.timeBetweenNumbers || 30);
    };
    const handlePlayerJoined = (data) => {
        console.log('Player joined:', data);
        setRoomState(prev => ({ ...prev, players: data.players }));
        toast.success(`${data.players.find(p => p._id === data.playerId)?.name || 'Un jugador'} se ha unido`);
    };
    const handlePlayerLeft = (data) => {
        console.log('Player left:', data);
        setRoomState(prev => ({ ...prev, players: data.players }));
        toast.info(`Un jugador se ha desconectado`);
    };
    const handleChallengeTriggered = (data) => {
        console.log('Challenge triggered:', data);
        setActiveChallenge(data);
    };
    const handleChallengeCompleted = () => {
        console.log('Challenge completed');
        setActiveChallenge(null);
        setShowRecording(false);
    };
    const handleVotingStarted = (data) => setActiveVoting(data);
    const handleVotingResults = () => setActiveVoting(null);
    const handleBingoVerified = (data) => {
        setGameState('finished');
        const p = roomState.players.find(p => p._id === data.playerId);
        toast.success(`BINGO: ${p?.name || 'Jugador'}`);
    };

    socket.on('room-updated', handleRoomUpdate);
    socket.on('number-called', handleNumberCalled);
    socket.on('game-started', handleGameStarted);
    socket.on('game-state-changed', handleGameStateChanged);
    socket.on('game-reset', handleGameReset);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('player-left', handlePlayerLeft);
    socket.on('challenge-triggered', handleChallengeTriggered);
    socket.on('challenge-completed', handleChallengeCompleted);
    socket.on('votingStarted', handleVotingStarted);
    socket.on('votingResults', handleVotingResults);
    socket.on('bingo-verified', handleBingoVerified);

    return () => {
      socket.off('room-updated', handleRoomUpdate);
      socket.off('number-called', handleNumberCalled);
      socket.off('game-started', handleGameStarted);
      socket.off('game-state-changed', handleGameStateChanged);
      socket.off('game-reset', handleGameReset);
      socket.off('player-joined', handlePlayerJoined);
      socket.off('player-left', handlePlayerLeft);
      socket.off('challenge-triggered', handleChallengeTriggered);
      socket.off('challenge-completed', handleChallengeCompleted);
      socket.off('votingStarted', handleVotingStarted);
      socket.off('votingResults', handleVotingResults);
      socket.off('bingo-verified', handleBingoVerified);
    };
  }, [socket, roomState.config?.timeBetweenNumbers, roomState.players]);

  // Efecto para el temporizador visual
  useEffect(() => {
    let timer;
    if (gameState === 'playing' && nextNumberIn > 0) {
      timer = setInterval(() => {
        setNextNumberIn(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState, nextNumberIn]);

  // --- Handlers de Acciones ---
  const handleStartGame = () => {
    if (roomState.players.filter(p => p.isConnected).length < 1) { // Permitir iniciar con 1 jugador para pruebas
      showError('Se necesita al menos 1 jugador conectado para comenzar');
      return;
    }
    console.log('🎮 Starting game for room:', roomState.code);
    socket?.emit('start-game', { roomCode: roomState.code, hostCapability: roomData.hostCapability });
  };
  
  const handlePauseGame = () => {
      if (gameState === 'playing') {
        socket?.emit('pause-game', { roomCode: roomState.code, hostCapability: roomData.hostCapability });
      } else {
        socket?.emit('resume-game', { roomCode: roomState.code, hostCapability: roomData.hostCapability });
      }
  };

  const handleResetGame = () => {
      if (window.confirm('¿Estás seguro de reiniciar el juego? Esto reiniciará los números pero mantendrá la sala activa.')) {
          console.log('🔄 Resetting game for room:', roomState.code);
          socket?.emit('reset-game', { roomCode: roomState.code, hostCapability: roomData.hostCapability });
          setGameState('waiting');
          setCurrentNumber(null);
          setCalledNumbers([]);
      }
  };

  const handleToggleTieBreak = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomState.code}/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-room-host-capability': roomData.hostCapability
        },
        body: JSON.stringify({ config: { ...roomState.config, tieBreakEnabled: !tieBreakOn } })
      });
      const data = await res.json();
      if (res.ok && data?.room) {
        setRoomState(data.room);
        showSuccess(!tieBreakOn ? 'Desempate activado' : 'Desempate desactivado');
      } else {
        showError(data?.error, 'Error actualizando configuración');
      }
    } catch (e) {
      showError(e, 'Error de red');
    }
  };

  const handleFinishGame = () => {
      if (window.confirm('¿Estás seguro de finalizar y cerrar la sala? Todos los jugadores serán desconectados y la sala será eliminada.')) {
          console.log('🛑 Closing room:', roomState.code);
          socket?.emit('close-room', { roomCode: roomState.code, hostCapability: roomData.hostCapability });
          // Limpiar localStorage
          localStorage.clear();
          // Redirigir a la página principal
          toast.success('Sala cerrada exitosamente');
          setTimeout(() => {
              window.location.href = '/';
          }, 1000);
      }
  };

  const handleKickPlayer = (playerId) => {
      if (window.confirm('¿Estás seguro de expulsar a este jugador?')) {
          socket?.emit('kick-player', { roomCode: roomState.code, playerId, hostCapability: roomData.hostCapability });
      }
  };
  
  const handleLaunchEvent = (eventType) => {
      socket?.emit('launch-event', {
        roomCode: roomState.code,
        type: eventType,
        hostCapability: roomData.hostCapability
      });
      toast.success(`Lanzando ${eventType}...`);
  };

  const handleStartVoting = () => {
    if (!activeChallenge) return;
    const performerId = activeChallenge.player?.id || activeChallenge.player?._id || activeChallenge.player;
    socket?.emit('startVoting', {
      roomCode: roomState.code,
      challengeType: activeChallenge.type,
      performerId: performerId?.toString(),
      hostCapability: roomData.hostCapability
    });
  };

  const handleEndVoting = () => {
    if (!activeVoting) return;
    socket?.emit('endVoting', {
      roomCode: roomState.code,
      voteId: activeVoting.voteId,
      hostCapability: roomData.hostCapability
    });
  };

  const handleToggleRecording = () => {
      setShowRecording(!showRecording);
      setRecordingCompleted(false);
  };

  const handleRecordingComplete = (recording) => {
      console.log('✅ Grabación completada:', recording);
      setRecordingCompleted(true);
      toast.success('¡Grabación guardada exitosamente!');
      setTimeout(() => {
          setShowRecording(false);
          setRecordingCompleted(false);
      }, 3000);
  };

  const handleRecordingError = (error) => {
      console.error('❌ Error en grabación:', error);
      showError(error, 'Error al grabar');
  };

  // --- Handlers para Jugadores Manuales ---
  const fetchManualPlayers = useCallback(async () => {
    try {
      const [playersRes, cardsRes] = await Promise.all([
        fetch(`${API_URL}/api/rooms/${roomState.code}/manual-players`),
        fetch(`${API_URL}/api/rooms/${roomState.code}/available-manual-cards`)
      ]);

      const playersData = await playersRes.json();
      const cardsData = await cardsRes.json();

      if (playersData.success) {
        setManualPlayers(playersData.data.manualPlayers || []);
      }
      if (cardsData.success) {
        setAvailableCards(cardsData.data.available || []);
      }
    } catch (error) {
      console.error('Error fetching manual players:', error);
    }
  }, [roomState.code]);

  // Efecto para cargar jugadores manuales
  useEffect(() => {
    if (roomState.code) {
      setTimeout(() => fetchManualPlayers(), 0);
    }
  }, [roomState.code, fetchManualPlayers]);

  const handleAssignManualCard = async () => {
    if (!manualPlayerForm.name.trim() || !manualPlayerForm.cardNumber) {
      showError('Completa todos los campos');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomState.code}/assign-manual-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-room-host-capability': roomData.hostCapability
        },
        body: JSON.stringify({
          playerName: manualPlayerForm.name.trim(),
          cardNumber: manualPlayerForm.cardNumber
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showSuccess(data.data.message || 'Cartón asignado correctamente');
        setManualPlayerForm({ name: '', cardNumber: null });
        setShowManualPlayerModal(false);
        await fetchManualPlayers(); // Refrescar lista
      } else {
        showError(data.error, 'Error al asignar cartón');
      }
    } catch (error) {
      showError(error, 'Error de red');
    }
  };

  const handleRemoveManualPlayer = async (playerId) => {
    if (!window.confirm('¿Estás seguro de eliminar este jugador manual?')) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomState.code}/manual-players/${playerId}`, {
        method: 'DELETE',
        headers: { 'x-room-host-capability': roomData.hostCapability }
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showSuccess(data.data.message || 'Jugador eliminado');
        await fetchManualPlayers(); // Refrescar lista
      } else {
        showError(data.error, 'Error al eliminar jugador');
      }
    } catch (error) {
      showError(error, 'Error de red');
    }
  };

  const handleViewManualCard = (player) => {
    setValidatingPlayer(player);
    setShowBingoValidator(true);
  };

  const handleConfirmManualBingo = (player) => {
    // Emitir evento de BINGO verificado para jugador manual
    socket?.emit('verify-bingo-manual', {
      roomCode: roomState.code,
      playerName: player.playerName,
      cardNumber: player.cardNumber,
      playerId: player.playerId,
      hostCapability: roomData.hostCapability
    }, (response) => {
      if (!response?.success) {
        showError(response?.error || 'No se pudo verificar el bingo manual', 'Error al verificar BINGO');
        return;
      }

      showSuccess(`¡BINGO confirmado para ${response.playerName}!`);
      setShowBingoValidator(false);
      setValidatingPlayer(null);
    });
  };

  // --- Lógica de Renderizado ---
  const filteredPlayers = roomState.players.filter(p =>
    p.name?.toLowerCase().includes(searchPlayer.toLowerCase())
  ).sort((a, b) => b.isConnected - a.isConnected);

  const shareableBaseUrl = getShareableUrl();
  const joinUrl = `${shareableBaseUrl}/?room=${roomState.code}`;
  const tvUrl = createTVDisplayURL(shareableBaseUrl, roomState.code);

  const copyToClipboard = (text, message) => {
    navigator.clipboard.writeText(text);
    toast.success(message, { icon: '📋' });
  };

  const handleOpenTV = () => {
    if (!roomData.tvCapability) {
      showError('La sesión del anfitrión no tiene credencial para abrir la TV.');
      return;
    }
    openTVDisplay(
      window,
      tvUrl,
      roomState.code,
      roomData.tvCapability,
      () => showError('El navegador bloqueó la ventana de TV. Permití las ventanas emergentes y probá de nuevo.')
    );
  };

  const gameStatusMap = {
      waiting: { text: 'En Espera', color: 'bg-yellow-500' },
      playing: { text: 'En Juego', color: 'bg-green-500' },
      paused: { text: 'Pausado', color: 'bg-orange-500' },
      finished: { text: 'Finalizado', color: 'bg-red-500' },
  };
  const currentStatus = gameStatusMap[gameState] || { text: 'Desconocido', color: 'bg-slate-500' };

  return (
    <div className="organizer-dashboard min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-200 p-4 lg:p-6 font-sans relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-600 rounded-full filter blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-600 rounded-full filter blur-3xl"></div>
      </div>

      <div className="max-w-screen-2xl mx-auto relative z-10 space-y-6">

        {/* HEADER COMPLETO */}
        <motion.header
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <h1 className="text-4xl lg:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              🎵 Bingo Bailable
            </h1>
            <p className="text-slate-400 mt-2 text-lg">
              Sala: <span className="font-mono text-indigo-400 font-bold text-xl">{roomState.code}</span>
            </p>
          </div>
          <ActionButton
            icon={<Settings size={18} />}
            label={showAdminCenter ? 'Cerrar administración' : 'Centro de Administración'}
            onClick={() => setShowAdminCenter(current => !current)}
            variant="secondary"
            className="!w-auto"
          />
          <motion.div
            className={`flex items-center gap-3 px-6 py-3 rounded-full text-white font-bold text-lg ${currentStatus.color} shadow-xl`}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <span className="w-3 h-3 rounded-full bg-white animate-pulse shadow-lg"></span>
            {currentStatus.text}
          </motion.div>
        </motion.header>

        {showAdminCenter && (
          <AdminCenter
            roomData={roomData}
            room={roomState}
            onClose={() => setShowAdminCenter(false)}
            onRoomUpdated={(updatedRoom) => setRoomState(previous => normalizeRoomState(updatedRoom, previous.code))}
          />
        )}

        {/* STATS CARDS - FILA COMPLETA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Users size={28} className="text-white" />}
            title="Jugadores Activos"
            value={`${roomState.players.filter(p => p.isConnected).length} / ${roomState.players.length}`}
            color="indigo"
          />
          <StatCard
            icon={<Clock size={28} className="text-white" />}
            title="Próximo Número"
            value={`${nextNumberIn}s`}
            color="purple"
          />
          <StatCard
            icon={<Music size={28} className="text-white" />}
            title="Música Activa"
            value="Playlist A"
            color="blue"
          />
          <StatCard
            icon={<Target size={28} className="text-white" />}
            title="Números Cantados"
            value={calledNumbers.length}
            color="green"
          />
        </div>

        {/* LAYOUT PRINCIPAL - 2 COLUMNAS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* COLUMNA IZQUIERDA - JUEGO (8 COLUMNAS) */}
          <div className="lg:col-span-8 space-y-6">

            {/* Número Cantado - MUY GRANDE */}
            <DashboardSection className="text-center py-12 bg-gradient-to-br from-indigo-900/60 to-purple-900/60 border-2 border-indigo-500/40">
              <p className="text-slate-300 mb-4 text-lg font-bold uppercase tracking-widest">
                Número Cantado
              </p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentNumber}
                  initial={{ opacity: 0, scale: 0.5, rotateY: -180 }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                  exit={{ opacity: 0, scale: 0.5, rotateY: 180 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className="text-[8rem] lg:text-[11rem] font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-300 via-purple-300 to-pink-300 tracking-tighter font-mono"
                  style={{ textShadow: '0 0 80px rgba(99, 102, 241, 0.6)', lineHeight: '1' }}
                >
                  {currentNumber || '--'}
                </motion.div>
              </AnimatePresence>
              {gameState === 'playing' && (
                <motion.p
                  className="text-indigo-300 mt-4 text-sm font-semibold"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  ⏱️ Siguiente número en {nextNumberIn} segundos
                </motion.p>
              )}
            </DashboardSection>

            {/* Eventos Especiales - HORIZONTAL debajo del número */}
            <DashboardSection title="🎮 Eventos Especiales">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <ActionButton
                  icon={<Target size={22} />}
                  label="Lanzar Reto"
                  onClick={() => handleLaunchEvent('challenge')}
                  variant="secondary"
                  className="!py-4"
                />
                <ActionButton
                  icon={<Mic size={22} />}
                  label="Lanzar Trivia"
                  onClick={() => handleLaunchEvent('trivia')}
                  variant="secondary"
                  className="!py-4"
                />
                <ActionButton
                  icon={<Target size={22} />}
                  label="Lanzar Adivinanza"
                  onClick={() => handleLaunchEvent('riddle')}
                  variant="secondary"
                  className="!py-4"
                />
                <ActionButton
                  icon={<Music size={22} />}
                  label="Lanzar Baile"
                  onClick={() => handleLaunchEvent('dance')}
                  variant="secondary"
                  className="!py-4"
                />
                <ActionButton
                  icon={<Mic size={22} />}
                  label="Lanzar Canto"
                  onClick={() => handleLaunchEvent('sing')}
                  variant="secondary"
                  className="!py-4"
                />
                <ActionButton
                  icon={<Users size={22} />}
                  label="Lanzar Grupal"
                  onClick={() => handleLaunchEvent('group')}
                  variant="secondary"
                  className="!py-4"
                />
                <ActionButton
                  icon={<Music size={22} />}
                  label="Lanzar Karaoke"
                  onClick={() => handleLaunchEvent('karaoke')}
                  variant="secondary"
                  className="!py-4"
                />
                <ActionButton
                  icon={<Gift size={22} />}
                  label="Dar Premio"
                  onClick={() => handleLaunchEvent('prize')}
                  variant="secondary"
                  className="!py-4"
                />
                <ActionButton
                  icon={<Video size={22} />}
                  label={showRecording ? "Ocultar Grabación" : "Grabar Actuación"}
                  onClick={handleToggleRecording}
                  variant={showRecording ? "warning" : "primary"}
                  className="!py-4"
                />
              </div>

              {/* Información del challenge activo */}
              {activeChallenge && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-4 bg-indigo-900/30 rounded-lg border border-indigo-500/30"
                >
                  <p className="text-indigo-300 font-semibold">
                    🎯 Challenge Activo: {activeChallenge.type === 'karaoke' ? '🎤 Karaoke' : activeChallenge.type === 'dance' ? '💃 Baile' : activeChallenge.type}
                  </p>
                  <p className="text-slate-300 text-sm mt-1">
                    Jugador: {activeChallenge.player?.name || 'Desconocido'}
                  </p>
                  {!activeVoting && (
                    <ActionButton
                      icon={<Gift size={18} />}
                      label="Abrir votación"
                      onClick={handleStartVoting}
                      variant="success"
                      className="mt-3"
                    />
                  )}
                  {activeVoting && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-slate-300 text-sm">
                        Votación: {activeVoting.votesReceived || 0}/{activeVoting.totalVoters || 0}
                      </span>
                      <ActionButton
                        label="Cerrar votación"
                        onClick={handleEndVoting}
                        variant="warning"
                        className="!w-auto"
                      />
                    </div>
                  )}
                </motion.div>
              )}

              {/* Componente de Grabación */}
              {showRecording && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4"
                >
                  {activeChallenge && (activeChallenge.type === 'karaoke' || activeChallenge.type === 'dance') ? (
                    <RecordingChallenge
                      gameId={roomState.gameId || 'temp-game'}
                      roomCode={roomState.code}
                      playerId={activeChallenge.player?._id || roomData.playerId}
                      playerName={activeChallenge.player?.name || 'Jugador'}
                      hostCapability={roomData.hostCapability}
                      challengeType={activeChallenge.type}
                      challengeText={activeChallenge.data?.text || activeChallenge.data || 'Challenge'}
                      onRecordingComplete={handleRecordingComplete}
                      onRecordingError={handleRecordingError}
                    />
                  ) : (
                    <div className="p-6 bg-yellow-900/30 rounded-lg border border-yellow-500/30 text-center">
                      <p className="text-yellow-300 font-semibold">
                        ⚠️ No hay challenge de karaoke o baile activo
                      </p>
                      <p className="text-slate-300 text-sm mt-2">
                        Lanza un reto de karaoke o baile para poder grabar
                      </p>
                    </div>
                  )}

                  {recordingCompleted && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-4 p-4 bg-green-900/30 rounded-lg border border-green-500/30 text-center"
                    >
                      <p className="text-green-300 font-bold text-lg">
                        ✅ ¡Grabación guardada exitosamente!
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </DashboardSection>

            {/* Controles del Juego - HORIZONTAL */}
            <DashboardSection title="⚡ Controles del Juego">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ActionButton
                  icon={<Play size={24} />}
                  label="Iniciar"
                  onClick={handleStartGame}
                  disabled={gameState === 'playing'}
                  variant="success"
                  className="!py-5"
                />
                <ActionButton
                  icon={<Pause size={24} />}
                  label={gameState === 'paused' ? 'Reanudar' : 'Pausar'}
                  onClick={handlePauseGame}
                  disabled={gameState === 'waiting'}
                  variant="warning"
                  className="!py-5"
                />
                <ActionButton
                  icon={<RefreshCw size={24} />}
                  label="Reiniciar"
                  onClick={handleResetGame}
                  disabled={gameState === 'waiting'}
                  variant="secondary"
                  className="!py-5"
                />
                <ActionButton
                  icon={<X size={24} />}
                  label="Finalizar Sala"
                  onClick={handleFinishGame}
                  variant="danger"
                  className="!py-5"
                />
              </div>
            </DashboardSection>

            <DashboardSection title="⚙️ Configuración">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">Desempate por baile</span>
                  <span className={`px-2 py-1 rounded ${tieBreakOn ? 'bg-green-600 text-white' : 'bg-slate-600 text-white'}`}>{tieBreakOn ? 'Activado' : 'Desactivado'}</span>
                </div>
                <ActionButton
                  icon={<RefreshCw size={18} />}
                  label={tieBreakOn ? 'Desactivar' : 'Activar'}
                  onClick={handleToggleTieBreak}
                  variant={tieBreakOn ? 'secondary' : 'primary'}
                  className="w-auto min-w-[110px] !px-3 !py-2"
                />
              </div>
            </DashboardSection>

            {/* Historial de Números */}
            <DashboardSection title="📋 Historial de Números">
              <div className="flex flex-wrap gap-3 max-h-[280px] overflow-y-auto pr-2">
                {calledNumbers.length > 0 ? (
                  calledNumbers.map((num, index) => (
                    <motion.div
                      key={num}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.03 }}
                      className="w-14 h-14 flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl font-bold text-lg text-white shadow-xl hover:scale-110 transition-transform cursor-default"
                    >
                      {num}
                    </motion.div>
                  ))
                ) : (
                  <p className="text-slate-400 italic w-full text-center py-10 text-base">
                    Aún no se han cantado números. ¡Inicia el juego!
                  </p>
                )}
              </div>
            </DashboardSection>
          </div>

          {/* COLUMNA DERECHA - ACCESO Y JUGADORES (4 COLUMNAS) */}
          <div className="lg:col-span-4 space-y-6">

            {/* Acceso a la Sala */}
            <DashboardSection title="🎪 Acceso">
              <div className="bg-white p-3 rounded-xl w-full max-w-[180px] mx-auto shadow-2xl">
                <QRCodeSVG value={joinUrl} size="100%" />
              </div>
              <p className="text-center text-xs text-slate-400 mt-2 mb-3">
                Escanea o comparte
              </p>
              <div className="space-y-2">
                <ActionButton
                  icon={<LinkIcon size={16} />}
                  label="Copiar URL"
                  onClick={() => copyToClipboard(joinUrl, 'URL copiada!')}
                  variant="primary"
                  className="!py-2.5 !text-sm"
                />
                <ActionButton
                  icon={<Tv size={16} />}
                  label="Abrir TV"
                  onClick={handleOpenTV}
                  variant="success"
                  className="!py-2.5 !text-sm"
                />
              </div>
            </DashboardSection>

            {/* Jugadores */}
            <DashboardSection title="👥 Jugadores" className="flex flex-col max-h-[600px]">
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchPlayer}
                  onChange={(e) => setSearchPlayer(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="p-2 bg-indigo-900/30 rounded-lg border border-indigo-500/30 text-center">
                  <p className="text-indigo-300 font-semibold text-xs">
                    🟢 {filteredPlayers.filter(p => p.isConnected).length} en línea
                  </p>
                </div>
                <div className="p-2 bg-amber-900/30 rounded-lg border border-amber-500/30 text-center">
                  <p className="text-amber-300 font-semibold text-xs">
                    📄 {manualPlayers.length} manuales
                  </p>
                </div>
              </div>

              <ActionButton
                icon={<Users size={18} />}
                label="Asignar Cartón Impreso"
                onClick={() => setShowManualPlayerModal(true)}
                variant="warning"
                className="!py-2.5 !text-sm mb-3"
              />

              <div className="space-y-2 overflow-y-auto flex-grow pr-1">
                {/* Jugadores en línea */}
                {filteredPlayers.length > 0 && (
                  <>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider px-1 mb-1">
                      Jugadores en línea
                    </p>
                    {filteredPlayers.map(player => (
                      <PlayerCard key={player._id} player={player} onKick={handleKickPlayer} isManual={false} />
                    ))}
                  </>
                )}

                {/* Jugadores manuales */}
                {manualPlayers.length > 0 && (
                  <>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider px-1 mb-1 mt-3">
                      Jugadores con cartones impresos
                    </p>
                    {manualPlayers.map(player => (
                      <PlayerCard
                        key={player.playerId}
                        player={player}
                        onKick={handleRemoveManualPlayer}
                        onViewCard={handleViewManualCard}
                        isManual={true}
                      />
                    ))}
                  </>
                )}

                {/* Sin jugadores */}
                {filteredPlayers.length === 0 && manualPlayers.length === 0 && (
                  <div className="text-center py-8">
                    <Users size={40} className="mx-auto text-slate-600 mb-3" />
                    <p className="text-slate-400 text-sm">Sin jugadores</p>
                  </div>
                )}
              </div>
            </DashboardSection>
          </div>
        </div>

        {/* Modal de Asignación de Cartón Manual */}
        <ManualPlayerModal
          isOpen={showManualPlayerModal}
          onClose={() => setShowManualPlayerModal(false)}
          onAssign={handleAssignManualCard}
          formData={manualPlayerForm}
          setFormData={setManualPlayerForm}
          availableCards={availableCards}
        />

        {/* Modal de Validación de BINGO Manual */}
        <ManualBingoValidator
          isOpen={showBingoValidator}
          onClose={() => {
            setShowBingoValidator(false);
            setValidatingPlayer(null);
          }}
          player={validatingPlayer}
          calledNumbers={calledNumbers}
          gameMode={roomState.config?.gameMode || 'full'}
          onConfirmBingo={handleConfirmManualBingo}
        />
      </div>
    </div>
  );
}
