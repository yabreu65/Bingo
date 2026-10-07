import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useGame } from './context/useGame';
import { useSocket } from './context/SocketContext';
import RegistrationScreen from './components/Registration/RegistrationScreen';
import GameScreen from './components/Game/GameScreen';
import RoomSetup from './components/Room/RoomSetup';
import CardSelection from './components/Room/CardSelection';
import WaitingRoom from './components/Room/WaitingRoom';
import OrganizerDashboard from './components/Organizer/OrganizerDashboard';
import PlayerCardView from './components/Player/PlayerCardView';
import LandingPage from './components/Landing/LandingPage';
import TVDisplay from './components/TVDisplay/TVDisplay';
import QuickJoin from './components/Room/QuickJoin';
import Snowflakes from './components/UI/Snowflakes';
import { API_URL } from './config/api';
import './App.css';

const STORAGE_KEY = 'bingo_session';

function App() {
  const { gameState } = useGame();
  const { socket } = useSocket();
  const [showLanding, setShowLanding] = useState(true);
  const [mode, setMode] = useState(null); // 'single' or 'multi'
  const [roomData, setRoomData] = useState(null);
  const [cardSelected, setCardSelected] = useState(false);
  const [inWaitingRoom, setInWaitingRoom] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(true);
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [savedSessionData, setSavedSessionData] = useState(null);

  // Detectar parámetros de URL
  const urlParams = new URLSearchParams(window.location.search);
  const tvRoomCode = urlParams.get('tv');
  const quickJoinRoomCode = urlParams.get('room');

  // Listener global para cierre de sala
  useEffect(() => {
    if (!socket) return;

    const handleRoomClosed = (data) => {
      // Limpiar localStorage
      localStorage.removeItem('bingo_session');

      // Mostrar notificación
      toast.error('La sala ha sido cerrada por el anfitrión', {
        duration: 5000,
        icon: '🚪'
      });

      // Redirigir a inicio después de 2 segundos
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    };

    socket.on('room-closed', handleRoomClosed);

    return () => {
      socket.off('room-closed', handleRoomClosed);
    };
  }, [socket]);

  // Cargar sesión guardada directamente - el socket manejará la reconexión
  useEffect(() => {
    const loadSavedSession = async () => {
      try {
        // NO cargar sesión si hay parámetros de URL (QR o TV)
        if (tvRoomCode || quickJoinRoomCode) {
          console.log('🔗 URL params detected, skipping session load');
          setIsReconnecting(false);
          return;
        }

        const savedSession = localStorage.getItem(STORAGE_KEY);
        if (!savedSession) {
          setIsReconnecting(false);
          return;
        }

        const session = JSON.parse(savedSession);

        // Verificar que la sesión tenga los datos necesarios
        if (!session.roomCode || !session.playerId) {
          localStorage.removeItem(STORAGE_KEY);
          setIsReconnecting(false);
          return;
        }

        console.log('📱 Loading saved session - socket will handle reconnection');

        // Verificar si tenemos un cartón guardado COMPLETO (con matrix)
        const hasCard = session.bingoCard?.matrix && session.cardNumber;

        // Si tiene cardNumber pero NO tiene bingoCard.matrix, intentar recuperar del backend
        if (session.cardNumber && !session.bingoCard?.matrix && !session.isHost) {
          console.warn('⚠️ Incomplete session: has cardNumber but no bingoCard.matrix, recovering from backend...');
          try {
            // Intentar obtener el jugador del backend para recuperar el cartón
            const playerResponse = await fetch(`${API_URL}/api/players/${session.playerId}`);
            if (playerResponse.ok) {
              const playerData = await playerResponse.json();
              if (playerData.player?.bingoCard?.matrix) {
                console.log('✅ Card recovered from backend');
                session.bingoCard = playerData.player.bingoCard;
                session.cardNumber = playerData.player.cardNumber;
                // Actualizar localStorage con los datos recuperados
                localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
              } else {
                console.error('❌ Player has no card in backend, cleaning session');
                localStorage.removeItem(STORAGE_KEY);
                setIsReconnecting(false);
                toast.error('No se pudo recuperar tu cartón, por favor vuelve a seleccionarlo');
                return;
              }
            } else {
              console.error('❌ Could not fetch player from backend, cleaning session');
              localStorage.removeItem(STORAGE_KEY);
              setIsReconnecting(false);
              toast.error('Sesión corrupta, por favor vuelve a seleccionar tu cartón');
              return;
            }
          } catch (err) {
            console.error('Error recovering card:', err);
            localStorage.removeItem(STORAGE_KEY);
            setIsReconnecting(false);
            toast.error('Error al recuperar tu cartón, por favor vuelve a seleccionarlo');
            return;
          }
        }

        // Si NO tiene cartón, necesitamos obtener los datos de la sala para CardSelection
        let roomInfo = null;
        if (!hasCard && !session.isHost) {
          try {
            const roomResponse = await fetch(`${API_URL}/api/rooms/${session.roomCode}`);
            if (roomResponse.ok) {
              const roomDataFromAPI = await roomResponse.json();
              roomInfo = roomDataFromAPI.room;
            }
          } catch (err) {
            console.error('Error fetching room data:', err);
          }
        }

        // Cargar la sesión directamente desde localStorage
        // El socket se encargará de reconectar y sincronizar los datos
        setMode('multi');
        setRoomData({
          roomCode: session.roomCode,
          playerId: session.playerId,
          playerName: session.playerName || 'Jugador',
          isHost: session.isHost || false,
          cardNumber: session.cardNumber || null,
          bingoCard: session.bingoCard || null,
          // Restaurar también el estado del juego
          currentNumber: session.currentNumber || null,
          calledNumbers: session.calledNumbers || [],
          gameState: session.gameState || 'waiting',
          room: roomInfo // Datos de la sala para CardSelection
        });

        // Solo marcar como seleccionado si realmente tiene cartón o es host
        if (hasCard || session.isHost) {
          setCardSelected(true);
          setInWaitingRoom(true);
          toast.loading('Reconectando...', { duration: 2000 });
        } else {
          // Si no tiene cartón, ir a selección de cartón
          setCardSelected(false);
          setInWaitingRoom(false);
        }

        setShowLanding(false);
        setIsReconnecting(false);
      } catch (error) {
        console.error('Error loading session:', error);
        localStorage.removeItem(STORAGE_KEY);
        setIsReconnecting(false);
      }
    };

    loadSavedSession();
  }, [tvRoomCode, quickJoinRoomCode]);

  // Guardar sesión cuando cambia roomData
  useEffect(() => {
    if (roomData && mode === 'multi') {
      const session = {
        roomCode: roomData.roomCode,
        playerId: roomData.playerId,
        playerName: roomData.playerName,
        isHost: roomData.isHost,
        cardNumber: roomData.cardNumber,
        bingoCard: roomData.bingoCard,
        // Guardar también el estado del juego para reconexión
        currentNumber: roomData.currentNumber,
        calledNumbers: roomData.calledNumbers,
        gameState: roomData.gameState,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      console.log('💾 Session saved:', session);
    }
  }, [roomData, mode]);

  const handleStartFromLanding = () => {
    setShowLanding(false);
    setMode('multi');
  };

  const handleModeSelection = (selectedMode) => {
    setMode(selectedMode);
  };

  const handleRoomReady = (data) => {
    setRoomData(data);
    if (data.isHost) {
      setCardSelected(true);
      setInWaitingRoom(true);
    } else {
      setCardSelected(false);
    }
  };

  const handleCardSelected = (data) => {
    setRoomData(data);
    setCardSelected(true);
    setInWaitingRoom(true);
  };

  const handleGameStart = (gameId) => {
    setInWaitingRoom(false);
    // The game will start through the GameContext
  };

  const handleLeaveRoom = () => {
    localStorage.removeItem(STORAGE_KEY);
    setMode(null);
    setRoomData(null);
    setCardSelected(false);
    setInWaitingRoom(false);
  };

  // Función para continuar con la sesión guardada
  const handleContinueSession = () => {
    if (!savedSessionData) return;

    const { restoredRoomData, data } = savedSessionData;

    setMode('multi');
    setRoomData(restoredRoomData);

    if (data.player.cardNumber) {
      setCardSelected(true);
      setInWaitingRoom(true);
    } else if (data.player.isHost) {
      setCardSelected(true);
      setInWaitingRoom(true);
    } else {
      setCardSelected(false);
    }

    setShowReconnectPrompt(false);
    setSavedSessionData(null);
  };

  // Función para empezar una nueva sesión
  const handleNewSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    setShowReconnectPrompt(false);
    setSavedSessionData(null);
    setShowLanding(true);
  };

  // Vista de TV - Pantalla para mostrar en televisor
  // URL de ejemplo: http://192.168.1.39:5173/?tv=ABC123
  if (tvRoomCode) {
    return (
      <div className="app">
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <TVDisplay roomCode={tvRoomCode.toUpperCase()} />
      </div>
    );
  }

  // Quick Join - Acceso directo a sala mediante QR
  // URL de ejemplo: http://192.168.1.39:5173/?room=ABC123
  if (quickJoinRoomCode && !roomData) {
    const handleQuickJoinComplete = (data) => {
      setRoomData(data);
      setMode('multi');
      setCardSelected(true);
      setInWaitingRoom(true);
      setShowLanding(false);
      // Limpiar el parámetro room de la URL sin recargar
      window.history.replaceState({}, '', window.location.pathname);
    };

    return (
      <div className="app">
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Snowflakes />
        <QuickJoin
          roomCode={quickJoinRoomCode.toUpperCase()}
          onJoinComplete={handleQuickJoinComplete}
        />
      </div>
    );
  }

  // Mostrar pantalla de reconexión
  if (isReconnecting) {
    return (
      <div className="app">
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Snowflakes />
        <div className="reconnecting-screen">
          <div className="reconnecting-container">
            <div className="spinner-large"></div>
            <h2>Reconectando...</h2>
            <p>Recuperando tu sesión</p>
          </div>
        </div>
      </div>
    );
  }

  // Mostrar prompt de confirmación de reconexión
  if (showReconnectPrompt && savedSessionData) {
    const playerName = savedSessionData.restoredRoomData.playerName;
    const roomCode = savedSessionData.restoredRoomData.roomCode;

    return (
      <div className="app">
        <Snowflakes />
        <div className="reconnect-prompt-screen">
          <div className="reconnect-prompt-container">
            <h1 className="christmas-title">🎄 Bingo Navideño 🎅</h1>
            <div className="reconnect-content">
              <div className="info-icon">👋</div>
              <h2>¡Bienvenido de nuevo!</h2>
              <p className="session-info">
                Encontramos una sesión activa de <strong>{playerName}</strong> en la sala <strong>{roomCode}</strong>
              </p>
              <p className="session-question">¿Qué te gustaría hacer?</p>

              <div className="reconnect-buttons">
                <button
                  className="reconnect-button continue"
                  onClick={handleContinueSession}
                >
                  <div className="button-icon">✓</div>
                  <div className="button-text">
                    <h3>Continuar Sesión</h3>
                    <p>Volver a {playerName}</p>
                  </div>
                </button>

                <button
                  className="reconnect-button new-session"
                  onClick={handleNewSession}
                >
                  <div className="button-icon">+</div>
                  <div className="button-text">
                    <h3>Nueva Sesión</h3>
                    <p>Jugar como otro jugador</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Landing page - professional Christmas-themed welcome screen
  if (showLanding) {
    return (
      <div className="app">
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <LandingPage onStartGame={handleStartFromLanding} />
      </div>
    );
  }

  // Mode selection screen
  if (!mode) {
    return (
      <div className="app">
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Snowflakes />
        <div className="mode-selection-screen">
          <div className="mode-selection-container">
            <h1 className="christmas-title">🎄 Bingo Navideño 🎅</h1>
            <p className="subtitle">Selecciona el modo de juego</p>

            <div className="mode-buttons">
              <button
                className="mode-button single-mode"
                onClick={() => handleModeSelection('single')}
              >
                <div className="mode-icon">🎮</div>
                <h2>Un Solo Jugador</h2>
                <p>Juega en modo local sin conexión</p>
              </button>

              <button
                className="mode-button multi-mode"
                onClick={() => handleModeSelection('multi')}
              >
                <div className="mode-icon">🌐</div>
                <h2>Multijugador</h2>
                <p>Crea o únete a una sala online</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multiplayer flow
  if (mode === 'multi') {
    if (!roomData) {
      return (
        <div className="app">
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <Snowflakes />
          <RoomSetup onRoomReady={handleRoomReady} />
        </div>
      );
    }

    // Show card selection before waiting room
    if (!cardSelected) {
      return (
        <div className="app">
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <Snowflakes />
          <CardSelection roomData={roomData} onCardSelected={handleCardSelected} />
        </div>
      );
    }

    if (inWaitingRoom) {
      // Show Organizer Dashboard for host, Player Card for regular players
      if (roomData.isHost) {
        return (
          <div className="app">
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
            <Snowflakes />
            <OrganizerDashboard roomData={roomData} />
          </div>
        );
      } else {
        return (
          <div className="app">
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
            <Snowflakes />
            <PlayerCardView roomData={roomData} />
          </div>
        );
      }
    }
  }

  // Single player flow (original)
  return (
    <div className="app">
      <Snowflakes />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#333',
            color: '#fff',
            padding: '16px',
            borderRadius: '8px',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10B981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#EF4444',
              secondary: '#fff',
            },
          },
        }}
      />

      {gameState === 'registration' && <RegistrationScreen />}

      {(gameState === 'playing' || gameState === 'paused' || gameState === 'finished') && (
        <GameScreen />
      )}
    </div>
  );
}

export default App;
