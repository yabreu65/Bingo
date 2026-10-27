import { useEffect, useState, useCallback, useRef } from 'react';
import { SocketContext } from './SocketContextValue';
import io from 'socket.io-client';
import { getBackendUrl } from '../config/api';

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [currentRoom, setCurrentRoom] = useState(null);
  const socketRef = useRef(null);
  const roomDataRef = useRef(null); // Store room/player info for reconnection

  useEffect(() => {
    // Prevenir doble conexión en StrictMode
    if (socketRef.current) {
      console.log('⚠️ Socket already initialized, skipping...');
      return;
    }

    // Usar la configuración centralizada para obtener la URL del backend
    const backendUrl = getBackendUrl();
    console.log('🔌 Socket.IO connecting to:', backendUrl);

    const newSocket = io(backendUrl, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000, // Reducido para móviles
      reconnectionAttempts: 15, // Más intentos
      timeout: 5000, // Reducido de 20s a 5s para detectar desconexión más rápido
      withCredentials: true,
      upgrade: true, // Intentar upgrade a websocket
      rememberUpgrade: true, // Recordar que se hizo upgrade
      autoConnect: true
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket connected:', newSocket.id);
      setConnected(true);
      setIsReconnecting(false);
      setReconnectAttempt(0);

      // Auto-rejoin room after reconnection
      if (roomDataRef.current) {
        const { roomCode, playerId, hostCapability, playerCapability } = roomDataRef.current;
        console.log('🔄 Auto-rejoining room after reconnection:', roomCode);
        const joinPayload = { roomCode, playerId };
        if (hostCapability) joinPayload.hostCapability = hostCapability;
        if (playerCapability) joinPayload.playerCapability = playerCapability;
        newSocket.emit('join-room', joinPayload, (response) => {
          if (response?.success) {
            console.log('✅ Successfully rejoined room');

            // Sincronizar estado del juego después de reconectar
            console.log('🔄 Requesting game state sync...');
            newSocket.emit('sync-game-state', { roomCode, playerId }, (syncResponse) => {
              if (syncResponse?.success) {
                console.log('✅ Game state synced:', syncResponse.data);
                // El backend ya emitirá 'game-state-update' que los componentes escucharán
              } else {
                console.error('❌ Failed to sync game state:', syncResponse?.error);
              }
            });
          } else {
            console.error('❌ Failed to rejoin room:', response?.error);
          }
        });
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setConnected(false);

      // Solo mostrar reconectando si fue desconexión inesperada
      if (reason !== 'io client disconnect') {
        setIsReconnecting(true);
      }
    });

    newSocket.on('reconnect_attempt', (attempt) => {
      console.log(`🔄 Reconnection attempt ${attempt}`);
      setReconnectAttempt(attempt);
      setIsReconnecting(true);
    });

    newSocket.on('reconnect_failed', () => {
      console.error('❌ Reconnection failed after maximum attempts');
      setIsReconnecting(false);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log(`✅ Reconnected after ${attemptNumber} attempts`);
      setIsReconnecting(false);
    });

    newSocket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      setIsReconnecting(true);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    // Sistema de Heartbeat MÁS AGRESIVO para móviles
    let missedPongs = 0;
    const MAX_MISSED_PONGS = 2;

    newSocket.on('pong', () => {
      missedPongs = 0; // Reset contador cuando recibimos respuesta
    });

    const heartbeatInterval = setInterval(() => {
      if (newSocket.connected) {
        missedPongs++;

        // Si no hemos recibido respuesta después de varios pings, forzar reconexión
        if (missedPongs >= MAX_MISSED_PONGS) {
          console.warn('⚠️ Too many missed pongs, forcing reconnect...');
          missedPongs = 0;
          newSocket.disconnect();
          setTimeout(() => newSocket.connect(), 1000);
        } else {
          newSocket.emit('ping', { timestamp: Date.now() });
        }
      } else {
        // Si no está conectado, intentar reconectar
        console.log('🔄 Not connected, attempting to reconnect...');
        newSocket.connect();
      }
    }, 15000); // Ping cada 15 segundos (más agresivo)

    // Detectar cuando la página vuelve a estar visible (móviles) - MÁS AGRESIVO
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📱 Page became visible, forcing connection check...');

        // FORZAR reconexión inmediatamente
        if (!newSocket.connected) {
          console.log('🔄 Not connected, forcing reconnect NOW...');
          newSocket.connect();
        } else {
          // Aunque parezca conectado, forzar re-join para asegurar
          if (roomDataRef.current) {
            console.log('🔄 Forcing rejoin to ensure connection...');

            // Desconectar y reconectar para forzar un rejoin limpio
            newSocket.disconnect();
            setTimeout(() => {
              newSocket.connect();
            }, 500);
          }
        }

        // Reset contador de pongs perdidos
        missedPongs = 0;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Wake Lock API para prevenir sleep en móviles
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('🔒 Wake Lock activated');

          wakeLock.addEventListener('release', () => {
            console.log('🔓 Wake Lock released');
          });
        }
      } catch (err) {
        console.log('Wake Lock not supported or failed:', err);
      }
    };

    // Re-adquirir wake lock cuando la página vuelve a estar visible
    const handleWakeLockVisibilityChange = async () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleWakeLockVisibilityChange);
    requestWakeLock(); // Activar al inicio

    return () => {
      console.log('🔌 Closing socket connection');
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleWakeLockVisibilityChange);

      // Liberar wake lock
      if (wakeLock !== null) {
        wakeLock.release().then(() => {
          wakeLock = null;
        });
      }

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  // Room Management
  const joinRoom = useCallback((roomCode, playerId, credentialsOrHostCapability, callback) => {
    if (!socket) {
      console.error('Socket not initialized');
      return;
    }
    const credentials = typeof credentialsOrHostCapability === 'string'
      ? { hostCapability: credentialsOrHostCapability }
      : credentialsOrHostCapability && typeof credentialsOrHostCapability === 'object'
        ? {
          hostCapability: credentialsOrHostCapability.hostCapability,
          playerCapability: credentialsOrHostCapability.playerCapability
        }
        : {};
    const completion = typeof credentialsOrHostCapability === 'function'
      ? credentialsOrHostCapability
      : callback;
    console.log('📥 Joining room:', roomCode);
    const joinPayload = { roomCode, playerId };
    if (credentials.hostCapability) joinPayload.hostCapability = credentials.hostCapability;
    if (credentials.playerCapability) joinPayload.playerCapability = credentials.playerCapability;
    if (completion) {
      socket.emit('join-room', joinPayload, completion);
    } else {
      socket.emit('join-room', joinPayload);
    }
    setCurrentRoom(roomCode);
    // Keep only the current principal's capability for reconnecting this socket.
    roomDataRef.current = { roomCode, playerId, ...credentials };
  }, [socket]);

  const leaveRoom = useCallback(() => {
    if (!socket || !currentRoom) return;
    console.log('📤 Leaving room:', currentRoom);
    socket.emit('leave-room', { roomCode: currentRoom });
    setCurrentRoom(null);
    // Clear stored room data
    roomDataRef.current = null;
  }, [socket, currentRoom]);

  // Game Actions
  const startGame = useCallback((roomCode, hostCapability) => {
    if (!socket) return;
    const retainedCapability = roomDataRef.current?.roomCode === roomCode
      ? roomDataRef.current.hostCapability
      : undefined;
    console.log('🎮 Starting game in room:', roomCode);
    socket.emit('start-game', {
      roomCode,
      hostCapability: hostCapability || retainedCapability
    });
  }, [socket]);

  const callNumber = useCallback((roomCode, number, hostCapability) => {
    if (!socket) return;
    const retainedCapability = roomDataRef.current?.roomCode === roomCode
      ? roomDataRef.current.hostCapability
      : undefined;
    console.log('🔢 Calling number:', number);
    socket.emit('call-number', { roomCode, number, hostCapability: hostCapability || retainedCapability });
  }, [socket]);

  const markCell = useCallback((roomCode, playerId, row, col) => {
    if (!socket) return;
    socket.emit('mark-cell', { roomCode, playerId, row, col });
  }, [socket]);

  const claimBingo = useCallback((roomCode, playerId, bingoType) => {
    if (!socket) return;
    console.log('🎉 Claiming bingo:', bingoType);
    socket.emit('claim-bingo', { roomCode, playerId, bingoType });
  }, [socket]);

  const submitChallengeAnswer = useCallback((roomCode, playerId, challengeId, answer) => {
    if (!socket) return;
    socket.emit('challenge-answer', { roomCode, playerId, challengeId, answer });
  }, [socket]);

  const completeDanceChallenge = useCallback((roomCode, playerId, challengeId) => {
    if (!socket) return;
    socket.emit('challenge-complete', { roomCode, playerId, challengeId, type: 'dance' });
  }, [socket]);

  const completeSingChallenge = useCallback((roomCode, playerId, challengeId) => {
    if (!socket) return;
    socket.emit('challenge-complete', { roomCode, playerId, challengeId, type: 'sing' });
  }, [socket]);

  const completeGroupChallenge = useCallback((roomCode, playerId, challengeId) => {
    if (!socket) return;
    socket.emit('challenge-complete', { roomCode, playerId, challengeId, type: 'group' });
  }, [socket]);

  // Listener Setup
  const onPlayerJoined = useCallback((callback) => {
    if (!socket) return;
    socket.on('player-joined', callback);
    return () => socket.off('player-joined', callback);
  }, [socket]);

  const onPlayerLeft = useCallback((callback) => {
    if (!socket) return;
    socket.on('player-left', callback);
    return () => socket.off('player-left', callback);
  }, [socket]);

  const onGameStarted = useCallback((callback) => {
    if (!socket) return;
    socket.on('game-started', callback);
    return () => socket.off('game-started', callback);
  }, [socket]);

  const onNumberCalled = useCallback((callback) => {
    if (!socket) return;
    socket.on('number-called', callback);
    return () => socket.off('number-called', callback);
  }, [socket]);

  const onCountdownTick = useCallback((callback) => {
    if (!socket) return;
    socket.on('countdown-tick', callback);
    return () => socket.off('countdown-tick', callback);
  }, [socket]);

  const onCellMarked = useCallback((callback) => {
    if (!socket) return;
    socket.on('cell-marked', callback);
    return () => socket.off('cell-marked', callback);
  }, [socket]);

  const onBingoClaimed = useCallback((callback) => {
    if (!socket) return;
    socket.on('bingo-claimed', callback);
    return () => socket.off('bingo-claimed', callback);
  }, [socket]);

  const onBingoVerified = useCallback((callback) => {
    if (!socket) return;
    socket.on('bingo-verified', callback);
    return () => socket.off('bingo-verified', callback);
  }, [socket]);

  const onBingoRejected = useCallback((callback) => {
    if (!socket) return;
    socket.on('bingo-rejected', callback);
    return () => socket.off('bingo-rejected', callback);
  }, [socket]);

  const onGameFinished = useCallback((callback) => {
    if (!socket) return;
    socket.on('game-finished', callback);
    return () => socket.off('game-finished', callback);
  }, [socket]);

  const onChallengeTriggered = useCallback((callback) => {
    if (!socket) return;
    socket.on('challenge-triggered', callback);
    return () => socket.off('challenge-triggered', callback);
  }, [socket]);

  const onChallengeResult = useCallback((callback) => {
    if (!socket) return;
    socket.on('challenge-result', callback);
    return () => socket.off('challenge-result', callback);
  }, [socket]);

  const value = {
    socket,
    connected,
    isReconnecting,
    reconnectAttempt,
    currentRoom,
    // Room actions
    joinRoom,
    leaveRoom,
    // Game actions
    startGame,
    callNumber,
    markCell,
    claimBingo,
    // Challenge actions
    submitChallengeAnswer,
    completeDanceChallenge,
    completeSingChallenge,
    completeGroupChallenge,
    // Event listeners
    onPlayerJoined,
    onPlayerLeft,
    onGameStarted,
    onNumberCalled,
    onCountdownTick,
    onCellMarked,
    onBingoClaimed,
    onBingoVerified,
    onBingoRejected,
    onGameFinished,
    onChallengeTriggered,
    onChallengeResult
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
