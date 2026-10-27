import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useSocket } from '../../context/useSocket';
import SyncedMusicPlayer from '../Music/SyncedMusicPlayer';
import BingoCard from '../BingoCard/BingoCard';
import './WaitingRoom.css';

const WaitingRoom = ({ roomData, onGameStart }) => {
  const { joinRoom, startGame, onPlayerJoined, onGameStarted, markCell, onCellMarked, onNumberCalled, onCountdownTick } = useSocket();
  const [players, setPlayers] = useState(roomData.room?.players || []);
  const [copied, setCopied] = useState(false);
  const [myCard, setMyCard] = useState(roomData.bingoCard || null);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const intervalSec = roomData.room?.config?.timeBetweenNumbers || 30;

  useEffect(() => {
    // Join the Socket.io room with the current principal's capability.
    const credentials = roomData.isHost
      ? { hostCapability: roomData.hostCapability }
      : { playerCapability: roomData.playerCapability };
    joinRoom(roomData.roomCode, roomData.playerId, credentials);

    // Listen for new players joining
    const unsubscribePlayerJoined = onPlayerJoined((data) => {
      console.log('Player joined:', data);
      setPlayers(data.players);
    });

    // Listen for game start
    const unsubscribeGameStarted = onGameStarted((data) => {
      console.log('Game started:', data);
      onGameStart(data.gameId);
      setGameStarted(true);
    });

    return () => {
      if (unsubscribePlayerJoined) unsubscribePlayerJoined();
      if (unsubscribeGameStarted) unsubscribeGameStarted();
    };
  }, [
    joinRoom,
    onPlayerJoined,
    onGameStarted,
    onGameStart,
    roomData.roomCode,
    roomData.playerId,
    roomData.isHost,
    roomData.hostCapability,
    roomData.playerCapability
  ]);

  useEffect(() => {
    const unsubCell = onCellMarked((data) => {
      if (data.playerId === roomData.playerId) {
        setMyCard((prev) => {
          if (!prev) return prev;
          const already = prev.markedCells?.some((m) => Array.isArray(m) ? (m[0] === data.row && m[1] === data.col) : (m && m.row === data.row && m.col === data.col));
          if (already) return prev;
          const nextMarked = [...(prev.markedCells || []), [data.row, data.col]];
          return { ...prev, markedCells: nextMarked };
        });
      }
    });
    return () => { if (unsubCell) unsubCell(); };
  }, [onCellMarked, roomData.playerId]);

  useEffect(() => {
    const unsubCalled = onNumberCalled((data) => {
      setCalledNumbers((prev) => [data.number, ...prev]);
      setTimeLeft(intervalSec);
    });
    return () => { if (unsubCalled) unsubCalled(); };
  }, [onNumberCalled, intervalSec]);

  useEffect(() => {
    if (!gameStarted) return;
    if (timeLeft == null) return;
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev == null) return prev;
        const next = prev - 1;
        return next >= 0 ? next : 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [gameStarted, timeLeft]);

  useEffect(() => {
    const unsubCountdown = onCountdownTick((data) => {
      setCountdown(data.value);
      if (data.value <= 0) setCountdown(null);
    });
    return () => { if (unsubCountdown) unsubCountdown(); };
  }, [onCountdownTick]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomData.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = () => {
    if (players.length < 2) {
      toast.error('Se necesitan al menos 2 jugadores para comenzar');
      return;
    }
    startGame(roomData.roomCode, roomData.isHost ? roomData.hostCapability : undefined);
  };

  if (gameStarted && !roomData.isHost) {
    return (
      <div className="waiting-room">
        <div className="waiting-room-container">
          <div className="room-header">
            <h1>🎄 {roomData.room?.name || 'Sala de Bingo'} 🎅</h1>
            <div className="room-code-display">
              <div className="room-code-label">Código de Sala:</div>
              <div className="room-code-value">{roomData.roomCode}</div>
            </div>
          </div>
          {calledNumbers.length > 0 && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8 }}>
              <div style={{ background: '#1f2937', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '1.25rem', fontWeight: 700 }}>
                Último número: {calledNumbers[0]}
              </div>
              <div style={{ background: '#111827', color: '#93c5fd', padding: '8px 12px', borderRadius: 8, fontSize: '1rem', fontWeight: 600 }}>
                Próximo en: {timeLeft ?? intervalSec}s
              </div>
            </div>
          )}
          <div className="my-card-section" style={{ marginTop: 16 }}>
            <h3>🎴 Mi Cartón</h3>
            <BingoCard
              card={myCard}
              compact={false}
              interactive={true}
              onCellClick={(row, col, cell) => {
                if (cell === 'BINGO') return;
                if (!calledNumbers.includes(cell)) return;
                markCell(roomData.roomCode, roomData.playerId, row, col);
                setMyCard((prev) => {
                  if (!prev) return prev;
                  const already = prev.markedCells?.some((m) => Array.isArray(m) ? (m[0] === row && m[1] === col) : (m && m.row === row && m.col === col));
                  if (already) return prev;
                  const nextMarked = [...(prev.markedCells || []), [row, col]];
                  return { ...prev, markedCells: nextMarked };
                });
              }}
            />
          </div>
        </div>
        <SyncedMusicPlayer
          roomCode={roomData.roomCode}
          isHost={roomData.isHost}
          hostCapability={roomData.isHost ? roomData.hostCapability : undefined}
        />
      </div>
    );
  }

  return (
    <div className="waiting-room">
      <div className="waiting-room-container">
        <div className="room-header">
          <h1>🎄 {roomData.room?.name || 'Sala de Bingo'} 🎅</h1>
          <div className="room-code-display">
            <div className="room-code-label">Código de Sala:</div>
            <div className="room-code-value">{roomData.roomCode}</div>
            <button
              className={`copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopyCode}
            >
              {copied ? '✓ Copiado' : '📋 Copiar'}
            </button>
          </div>
          {roomData.isHost && (
            <div className="host-info">
              <span className="host-badge">👑 Anfitrión</span>
              <p>Comparte el código con los jugadores</p>
            </div>
          )}
        </div>
        {gameStarted && calledNumbers.length > 0 && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8 }}>
            <div style={{ background: '#1f2937', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '1.25rem', fontWeight: 700 }}>
              Último número: {calledNumbers[0]}
            </div>
            <div style={{ background: '#111827', color: '#93c5fd', padding: '8px 12px', borderRadius: 8, fontSize: '1rem', fontWeight: 600 }}>
              Próximo en: {timeLeft ?? intervalSec}s
            </div>
          </div>
        )}

        <div className="players-section">
          <h2>Jugadores ({players.filter(p => p.cardNumber != null).length}/{roomData.room.config?.maxPlayers || 50})</h2>
          <div className="players-grid">
            {players.filter(p => p.cardNumber != null).map((player, index) => (
              <div key={player._id || index} className="player-card">
                <div className="player-avatar">
                  {player.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="player-info">
                  <div className="player-name">{player.name}</div>
                  {player.isHost && <span className="mini-badge">👑</span>}
                  {player.isConnected && (
                    <span className="online-indicator">
                      <span className="dot"></span> Online
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Placeholder empty slots */}
            {players.filter(p => p.cardNumber != null).length < 4 && [...Array(4 - players.filter(p => p.cardNumber != null).length)].map((_, i) => (
              <div key={`empty-${i}`} className="player-card empty">
                <div className="player-avatar">?</div>
                <div className="player-info">
                  <div className="player-name">Esperando...</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="waiting-actions">
          {roomData.isHost ? (
            <>
              <button
                className="start-game-btn"
                onClick={handleStartGame}
                disabled={players.length < 2}
              >
                🎮 Iniciar Partida
              </button>
              {players.length < 2 && (
                <p className="min-players-hint">
                  Se necesitan al menos 2 jugadores para comenzar
                </p>
              )}
            </>
          ) : (
            <div className="waiting-message">
              <div className="waiting-spinner"></div>
              <p>Esperando a que el anfitrión inicie la partida...</p>
            </div>
          )}
        </div>

        <div className="room-config">
          <h3>⚙️ Configuración</h3>
          <div className="config-grid">
            <div className="config-item">
              <span className="config-label">Tiempo entre números:</span>
              <span className="config-value">{roomData.room.config?.timeBetweenNumbers || 30}s</span>
            </div>
            <div className="config-item">
              <span className="config-label">Frecuencia de desafíos:</span>
              <span className="config-value">Cada {roomData.room.config?.challengeFrequency || 3} números</span>
            </div>
            <div className="config-item">
              <span className="config-label">Modo de juego:</span>
              <span className="config-value">
                {roomData.room.config?.gameMode === 'line' && '📏 Línea'}
                {roomData.room.config?.gameMode === 'fourCorners' && '◻️ Cuatro Esquinas'}
                {roomData.room.config?.gameMode === 'centralCross' && '➕ Cruz Central'}
                {roomData.room.config?.gameMode === 'full' && '🎯 Cartón Completo'}
                {!roomData.room.config?.gameMode && '🎯 Cartón Completo'}
              </span>
            </div>
          </div>
        </div>

        {myCard && (
          <div className="my-card-section" style={{ marginTop: 16 }}>
            <h3>🎴 Mi Cartón</h3>
            <BingoCard
              card={myCard}
              compact={true}
              interactive={true}
              onCellClick={(row, col, cell) => {
                if (cell === 'BINGO') return;
                if (!calledNumbers.includes(cell)) return;
                markCell(roomData.roomCode, roomData.playerId, row, col);
                setMyCard((prev) => {
                  if (!prev) return prev;
                  const already = prev.markedCells?.some((m) => Array.isArray(m) ? (m[0] === row && m[1] === col) : (m && m.row === row && m.col === col));
                  if (already) return prev;
                  const nextMarked = [...(prev.markedCells || []), [row, col]];
                  return { ...prev, markedCells: nextMarked };
                });
              }}
            />
          </div>
        )}
      </div>

      {/* Synced Music Player */}
      <SyncedMusicPlayer
        roomCode={roomData.roomCode}
        isHost={roomData.isHost}
        hostCapability={roomData.isHost ? roomData.hostCapability : undefined}
      />
      {countdown != null && (
        <div className="countdown-overlay" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: '6rem', fontWeight: 800 }}>
          {countdown}
        </div>
      )}
    </div>
  );
};

export default WaitingRoom;
