import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useSocket } from '../../context/useSocket';
import ChallengeModal from '../Challenges/ChallengeModal';
import TiebreakVotingModal from '../Voting/TiebreakVotingModal';
import './PlayerCardView.css';

const STORAGE_KEY = 'bingo_session';

const PlayerCardView = ({ roomData }) => {
  const { socket } = useSocket();
  const [currentNumber, setCurrentNumber] = useState(roomData.currentNumber || null);
  const [calledNumbers, setCalledNumbers] = useState(roomData.calledNumbers || []);
  const [markedCells, setMarkedCells] = useState(
    roomData.bingoCard?.markedCells?.map(cell =>
      Array.isArray(cell) ? { row: cell[0], col: cell[1] } : cell
    ) || []
  );
  const [gameState, setGameState] = useState(roomData.gameState || 'waiting');
  const [activeEvent, setActiveEvent] = useState(null);
  const [activeChallenge, setActiveChallenge] = useState(null);

  // Estados para votación de tie-break
  const [tiebreakVoting, setTiebreakVoting] = useState(null); // { candidates, votingDuration, message }

  // Guardar estado del juego en localStorage cuando cambia
  useEffect(() => {
    const savedSession = localStorage.getItem(STORAGE_KEY);
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        // Actualizar solo los datos del juego, mantener los datos de la sesión
        const updatedSession = {
          ...session,
          currentNumber,
          calledNumbers,
          gameState,
          bingoCard: {
            ...session.bingoCard,
            markedCells
          }
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession));
      } catch (err) {
        console.error('Error updating session in localStorage:', err);
      }
    }
  }, [currentNumber, calledNumbers, gameState, markedCells]);


  function handleNumberCalled(data) {
    setCurrentNumber(data.number);
    setCalledNumbers((prev) => [...prev, data.number]);
  }

  function handleGameStateChanged(data) {
    setGameState(data.state);
  }

  function handleGameStateUpdate(data) {
    console.log('🔄 Game state update received:', data);

    // Actualizar estado del juego
    if (data.gameState) {
      setGameState(data.gameState);
    }

    // Actualizar número actual
    if (data.currentNumber !== undefined) {
      setCurrentNumber(data.currentNumber);
    }

    // Actualizar números cantados
    if (data.calledNumbers) {
      setCalledNumbers(data.calledNumbers);
    }

    // Actualizar celdas marcadas si es nuestro jugador
    if (data.playerData && data.playerData.playerId === roomData.playerId) {
      if (data.playerData.markedCells) {
        const cells = data.playerData.markedCells.map(cell =>
          Array.isArray(cell) ? { row: cell[0], col: cell[1] } : cell
        );
        setMarkedCells(cells);
      }
    }

    // Restaurar challenge activo si hay uno
    if (data.activeChallenge) {
      setActiveChallenge(data.activeChallenge);
    }

    // Restaurar tie-break si está activo
    if (data.tieBreak && data.tieBreak.active) {
      // Si está en votación, mostrar modal
      if (data.tieBreak.status === 'voting') {
        setTiebreakVoting({
          candidates: data.tieBreak.candidates || [],
          votingDuration: 30
        });
      }
    }

    toast.success('Estado sincronizado correctamente');
  }

  function handleEvent(data) {
    setActiveEvent(data);
    setTimeout(() => setActiveEvent(null), 8000); // Ocultar después de 8 segundos
  }

  function handleCellMarked(data) {
    if (data.playerId === roomData.playerId) {
      setMarkedCells((prev) => [...prev, { row: data.row, col: data.col }]);
    }
  }

  function handleChallengeTriggered(data) {
    console.log('🎯 PlayerCardView: Challenge triggered:', data);
    setActiveChallenge(data);
  }

  function handleChallengeComplete() {
    console.log('🎯 PlayerCardView: Challenge complete');
    setActiveChallenge(null);
  }

  // Handlers para tie-break voting
  function handleTiebreakVotingStarted(data) {
    console.log('🗳️ Tie-break voting started:', data);
    setTiebreakVoting(data);
  }

  function handleTiebreakVoteConfirmed(data) {
    console.log('✅ Vote confirmed:', data);
    toast.success(`Voto registrado para ${data.performerId}`);
  }

  function handleTiebreakResults(data) {
    console.log('🏆 Tie-break results:', data);
    setTiebreakVoting(null);
    toast.success('Votación finalizada');
  }

  useEffect(() => {
    if (!socket) return;

    // Función para sincronizar estado
    const syncGameState = () => {
      console.log('🔄 Requesting game state sync...');
      socket.emit('sync-game-state', {
        roomCode: roomData.roomCode,
        playerId: roomData.playerId
      }, (syncResponse) => {
        if (syncResponse?.success) {
          console.log('✅ Game state synced for player:', syncResponse.data);
          // Forzar actualización inmediata de estados críticos
          if (syncResponse.data.calledNumbers) {
            setCalledNumbers(syncResponse.data.calledNumbers);
          }
          if (syncResponse.data.currentNumber !== undefined) {
            setCurrentNumber(syncResponse.data.currentNumber);
          }

          // Actualizar celdas marcadas
          if (syncResponse.data.playerData?.markedCells) {
            const cells = syncResponse.data.playerData.markedCells.map(cell =>
              Array.isArray(cell) ? { row: cell[0], col: cell[1] } : cell
            );
            setMarkedCells(cells);
            console.log('✅ Marked cells restored:', cells.length);
          }

          // Actualizar estado del juego
          if (syncResponse.data.gameState) {
            setGameState(syncResponse.data.gameState);
          }
        } else {
          console.error('❌ Sync failed:', syncResponse?.error);
        }
      });
    };

    // Join the Socket.io room and request sync
    socket.emit('join-room', {
      roomCode: roomData.roomCode,
      playerId: roomData.playerId
    }, (response) => {
      if (response?.success) {
        console.log('✅ Joined room successfully');
        syncGameState();
      }
    });

    // Re-sincronizar cuando el socket se reconecta (importante para iPhone)
    const handleReconnect = () => {
      console.log('📱 Socket reconnected, re-syncing game state...');
      setTimeout(() => {
        syncGameState();
      }, 500); // Pequeño delay para asegurar que join-room se completó
    };

    socket.on('connect', handleReconnect);

    // Listen for game events
    socket?.on('number-called', handleNumberCalled);
    socket?.on('game-state-changed', handleGameStateChanged);
    socket?.on('game-state-update', handleGameStateUpdate);
    socket?.on('launch-event', handleEvent);
    socket?.on('cell-marked', handleCellMarked);
    socket?.on('challenge-triggered', handleChallengeTriggered);
    socket?.on('challenge-complete', handleChallengeComplete);
    socket?.on('bingo-claimed', (data) => {
      if (data.playerId === roomData.playerId) {
        toast.success('BINGO reclamado, validando...');
      }
    });
    socket?.on('bingo-verified', (data) => {
      if (data.playerId === roomData.playerId) {
        toast.success('¡BINGO verificado!');
      } else {
        toast('Otro jugador cantó BINGO', { icon: '🎉' });
      }
      setGameState('finished');
    });
    socket?.on('bingo-rejected', (data) => {
      if (data.playerId === roomData.playerId) {
        toast.error('BINGO rechazado');
      }
    });

    // Tie-break voting events
    socket?.on('tiebreak-voting-started', handleTiebreakVotingStarted);
    socket?.on('tiebreak-vote-confirmed', handleTiebreakVoteConfirmed);
    socket?.on('tiebreak-results', handleTiebreakResults);

    return () => {
      socket?.off('number-called', handleNumberCalled);
      socket?.off('game-state-changed', handleGameStateChanged);
      socket?.off('game-state-update', handleGameStateUpdate);
      socket?.off('launch-event', handleEvent);
      socket?.off('cell-marked', handleCellMarked);
      socket?.off('challenge-triggered', handleChallengeTriggered);
      socket?.off('challenge-complete', handleChallengeComplete);
      socket?.off('bingo-claimed');
      socket?.off('bingo-verified');
      socket?.off('bingo-rejected');
      socket?.off('tiebreak-voting-started', handleTiebreakVotingStarted);
      socket?.off('tiebreak-vote-confirmed', handleTiebreakVoteConfirmed);
      socket?.off('tiebreak-results', handleTiebreakResults);
    };
  }, [socket]);

  const handleTiebreakVote = (performerId, stars) => {
    console.log(`⭐ Voting for ${performerId}: ${stars} stars`);
    socket?.emit('cast-tiebreak-vote', {
      roomCode: roomData.roomCode,
      voterId: roomData.playerId,
      performerId,
      stars
    });
  };

  const handleCellClick = (row, col, value) => {
    if (value === 'BINGO') return;

    // Verificar si el número ha sido cantado
    if (!calledNumbers.includes(value)) {
      toast.error('Este número aún no ha sido cantado');
      return;
    }

    // Verificar si ya está marcada
    const isMarked = markedCells.some((cell) => cell.row === row && cell.col === col);
    if (isMarked) {
      return;
    }

    // Marcar celda
    setMarkedCells((prev) => [...prev, { row, col }]);
    socket?.emit('mark-cell', {
      roomCode: roomData.roomCode,
      playerId: roomData.playerId,
      row,
      col
    });
  };

  const isCellMarked = (row, col) => {
    return markedCells.some((cell) => cell.row === row && cell.col === col);
  };

  const handleClaimBingo = () => {
    if (confirm('¿Cantar BINGO?')) {
      socket?.emit('claim-bingo', {
        roomCode: roomData.roomCode,
        playerId: roomData.playerId,
        bingoType: 'full'
      });
    }
  };

  if (!roomData.bingoCard?.matrix) {
    return (
      <div className="player-card-view">
        <div className="no-card-message">
          <h2>⏳ Esperando...</h2>
          <p>Aún no has seleccionado un cartón</p>
        </div>
      </div>
    );
  }

  const card = roomData.bingoCard.matrix;

  return (
    <div className="player-card-view">
      {/* Header */}
      <div className="player-header">
        <div className="player-info-header">
          <h2>🎄 {roomData.playerName || 'Jugador'} 🎅</h2>
          <p>Sala: #{roomData.roomCode} | Cartón #{roomData.cardNumber}</p>
        </div>
        <div className="game-status">
          <span className={`status-badge ${gameState}`}>
            {gameState === 'waiting' && '⏸️ En Espera'}
            {gameState === 'playing' && '▶️ En Juego'}
            {gameState === 'paused' && '⏸️ Pausado'}
            {gameState === 'finished' && '🏁 Finalizado'}
          </span>
        </div>
      </div>

      {/* Current Number Display */}
      {gameState === 'playing' && (
        <div className="current-number-player">
          <div className="number-label">Número actual:</div>
          <div className="number-value">{currentNumber || '--'}</div>
        </div>
      )}

      {/* Event Alert */}
      {activeEvent && (
        <div className={`event-banner ${activeEvent.type}`}>
          <div className="event-icon">
            {activeEvent.type === 'challenge' && '🧨'}
            {activeEvent.type === 'trivia' && '❓'}
            {activeEvent.type === 'prize' && '🎁'}
          </div>
          <div className="event-text">{activeEvent.text}</div>
        </div>
      )}

      {/* Bingo Card */}
      <div className="player-bingo-card">
        <div className="bingo-card-header">
          <span>B</span>
          <span>I</span>
          <span>N</span>
          <span>G</span>
          <span>O</span>
        </div>
        <div className="bingo-card-grid">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="bingo-card-row">
              {[0, 1, 2, 3, 4].map((col) => {
                const value = card[col]?.[row];
                const marked = value === 'BINGO' || isCellMarked(row, col);
                const wasCalled = calledNumbers.includes(value);

                return (
                  <div
                    key={`${row}-${col}`}
                    className={`bingo-card-cell ${marked ? 'marked' : ''} ${
                      wasCalled && !marked ? 'available' : ''
                    }`}
                    onClick={() => handleCellClick(row, col, value)}
                  >
                    {value === 'BINGO' ? '★' : value}
                    {marked && <div className="mark-overlay">✓</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Called Numbers History */}
      <div className="called-numbers-section">
        <h3>Números cantados ({calledNumbers.length}):</h3>
        <div className="called-numbers-grid">
          {calledNumbers.slice(-15).reverse().map((num) => (
            <span key={num} className="called-number">
              {num}
            </span>
          ))}
        </div>
      </div>

      {/* Bingo Button */}
      {gameState === 'playing' && (
        <button className="bingo-claim-btn" onClick={handleClaimBingo}>
          🎉 ¡CANTAR BINGO!
        </button>
      )}

      {/* Waiting Message */}
      {gameState === 'waiting' && (
        <div className="waiting-message-player">
          <div className="spinner"></div>
          <p>Esperando que el organizador inicie el juego...</p>
        </div>
      )}

      {/* Tie-break Voting Modal */}
      {tiebreakVoting && (
        <TiebreakVotingModal
          isOpen={true}
          candidates={tiebreakVoting.candidates || []}
          onVote={handleTiebreakVote}
          votingDuration={tiebreakVoting.votingDuration || 30}
          myPlayerId={roomData.playerId}
        />
      )}

      {/* Challenge Modal - Solo para trivias */}
      {activeChallenge && activeChallenge.type === 'trivia' && (
        <ChallengeModal
          externalActiveChallenge={activeChallenge}
          externalCompleteChallenge={(success, answer) => {
            const answerData = {
              success,
              answer,
              correct: activeChallenge?.data?.correct,
              isCorrect: answer === activeChallenge?.data?.correct,
              type: activeChallenge?.type
            };
            console.log('🎯 Completing challenge:', answerData);

            // Para trivias, emitir evento especial con la respuesta
            if (activeChallenge?.type === 'trivia') {
              const triviaData = {
                roomCode: roomData.roomCode,
                playerId: roomData.playerId,
                answer: answer,
                correct: activeChallenge?.data?.correct
              };
              console.log('📤 Emitting trivia-answered:', triviaData);
              socket?.emit('trivia-answered', triviaData);
            } else {
              // Para otros tipos de challenges
              socket?.emit('challenge-complete', {
                roomCode: roomData.roomCode,
                playerId: roomData.playerId,
                type: activeChallenge?.type
              });
            }

            // No cerrar inmediatamente para trivias, esperar el evento del servidor
            if (activeChallenge?.type !== 'trivia') {
              setActiveChallenge(null);
            }
          }}
          externalGameId={roomData.gameId}
          externalRoomCode={roomData.roomCode}
          externalPlayerId={roomData.playerId}
          externalPlayerName={roomData.playerName}
        />
      )}
    </div>
  );
};

export default PlayerCardView;
