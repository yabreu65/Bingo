import { lazy, Suspense, useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useGame } from './context/useGame';
import { useSocket } from './context/useSocket';
import Snowflakes from './components/UI/Snowflakes';
import { API_URL } from './config/api';
import { listenForTVAuthorization } from './utils/tvAuthorization';
import './App.css';

const STORAGE_KEY = 'bingo_session';

const RegistrationScreen = lazy(() => import('./components/Registration/RegistrationScreen'));
const GameScreen = lazy(() => import('./components/Game/GameScreen'));
const RoomSetup = lazy(() => import('./components/Room/RoomSetup'));
const CardSelection = lazy(() => import('./components/Room/CardSelection'));
const OrganizerDashboard = lazy(() => import('./components/Organizer/OrganizerDashboard'));
const PlayerCardView = lazy(() => import('./components/Player/PlayerCardView'));
const LandingPage = lazy(() => import('./components/Landing/LandingPage'));
const TVDisplay = lazy(() => import('./components/TVDisplay/TVDisplay'));
const QuickJoin = lazy(() => import('./components/Room/QuickJoin'));

const LoadingScreen = () => (
  <div className="app">
    <div className="reconnecting-screen">
      <div className="reconnecting-container">
        <div className="spinner-large"></div>
        <p>Cargando...</p>
      </div>
    </div>
  </div>
);

function App() {
  const { gameState } = useGame();
  const { socket } = useSocket();
  const [showLanding, setShowLanding] = useState(true);
  const [mode, setMode] = useState(null); // 'single' or 'multi'
  const [roomData, setRoomData] = useState(null);
  const [tvCapability, setTvCapability] = useState(null);
  const [cardSelected, setCardSelected] = useState(false);
  const [inWaitingRoom, setInWaitingRoom] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(true);
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [savedSessionData, setSavedSessionData] = useState(null);

  // Detectar parámetros de URL
  const urlParams = new URLSearchParams(window.location.search);
  const tvRoomCode = urlParams.get('tv');
  const quickJoinRoomCode = urlParams.get('room');

  // Receive the scoped TV credential without putting it in the URL.
  useEffect(() => {
    if (!tvRoomCode) return undefined;
    return listenForTVAuthorization(window, tvRoomCode, setTvCapability);
  }, [tvRoomCode]);

  // Listener global para cierre de sala
  useEffect(() => {
    if (!socket) return;

    const handleRoomClosed = () => {
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
        if (!session.isHost && typeof session.playerCapability !== 'string') {
          localStorage.removeItem(STORAGE_KEY);
          setIsReconnecting(false);
          toast.error('Esta sesión es anterior y ya no es válida. Volvé a unirte a la sala.');
          return;
        }

        console.log('📱 Loading saved session - socket will handle reconnection');

        // Verificar si tenemos un cartón guardado COMPLETO (con matrix)
        let hasCard = Boolean(session.bingoCard?.matrix && session.cardNumber);

        // Si tiene cardNumber pero NO tiene bingoCard.matrix, intentar recuperar del backend
        if (session.cardNumber && !session.bingoCard?.matrix && !session.isHost) {
          console.warn('⚠️ Incomplete session: has cardNumber but no bingoCard.matrix, recovering from backend...');
          try {
            // Intentar obtener el jugador del backend para recuperar el cartón
            const playerResponse = await fetch(`${API_URL}/api/players/${session.playerId}`, {
              headers: { 'x-player-capability': session.playerCapability }
            });
            if (playerResponse.ok) {
              const playerData = await playerResponse.json();
              if (playerData.player?.bingoCard?.matrix) {
                console.log('✅ Card recovered from backend');
                session.bingoCard = playerData.player.bingoCard;
                session.cardNumber = playerData.player.cardNumber;
                hasCard = Boolean(session.bingoCard?.matrix && session.cardNumber);
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
          hostCapability: session.isHost ? session.hostCapability : undefined,
          tvCapability: session.isHost ? session.tvCapability : undefined,
          playerCapability: session.isHost ? undefined : session.playerCapability,
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
        hostCapability: roomData.isHost ? roomData.hostCapability : undefined,
        tvCapability: roomData.isHost ? roomData.tvCapability : undefined,
        playerCapability: roomData.isHost ? undefined : roomData.playerCapability,
        cardNumber: roomData.cardNumber,
        bingoCard: roomData.bingoCard,
        // Guardar también el estado del juego para reconexión
        currentNumber: roomData.currentNumber,
        calledNumbers: roomData.calledNumbers,
        gameState: roomData.gameState,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      console.log('💾 Session saved:', {
        roomCode: session.roomCode,
        playerId: session.playerId,
        isHost: session.isHost
      });
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
        <Suspense fallback={<LoadingScreen />}>
          <TVDisplay roomCode={tvRoomCode.toUpperCase()} tvCapability={tvCapability} />
        </Suspense>
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
        <Suspense fallback={<LoadingScreen />}>
          <QuickJoin
            roomCode={quickJoinRoomCode.toUpperCase()}
            onJoinComplete={handleQuickJoinComplete}
          />
        </Suspense>
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
        <Suspense fallback={<LoadingScreen />}>
          <LandingPage onStartGame={handleStartFromLanding} />
        </Suspense>
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
          <Suspense fallback={<LoadingScreen />}>
            <RoomSetup onRoomReady={handleRoomReady} />
          </Suspense>
        </div>
      );
    }

    // Show card selection before waiting room
    if (!cardSelected) {
      return (
        <div className="app">
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <Snowflakes />
          <Suspense fallback={<LoadingScreen />}>
            <CardSelection roomData={roomData} onCardSelected={handleCardSelected} />
          </Suspense>
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
            <Suspense fallback={<LoadingScreen />}>
              <OrganizerDashboard roomData={roomData} />
            </Suspense>
          </div>
        );
      } else {
        return (
          <div className="app">
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
            <Snowflakes />
            <Suspense fallback={<LoadingScreen />}>
              <PlayerCardView roomData={roomData} />
            </Suspense>
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

      <Suspense fallback={<LoadingScreen />}>
        {gameState === 'registration' && <RegistrationScreen />}

        {(gameState === 'playing' || gameState === 'paused' || gameState === 'finished') && (
          <GameScreen />
        )}
      </Suspense>
    </div>
  );
}

export default App;
