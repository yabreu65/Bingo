/**
 * EJEMPLO DE INTEGRACIÓN DEL SISTEMA DE VOTACIÓN
 *
 * Este ejemplo muestra cómo integrar el sistema de votación
 * en tu componente principal del juego (GameScreen, OrganizerDashboard, etc.)
 */

import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import VotingModal from '../components/Voting/VotingModal';
import VotingResults from '../components/Voting/VotingResults';
import SpecialRankings from '../components/Voting/SpecialRankings';

const GameScreenExample = () => {
  const socket = useSocket();

  // Estados del juego existentes
  const [roomCode, setRoomCode] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  const [myPlayerName, setMyPlayerName] = useState('');
  const [activeChallenge, setActiveChallenge] = useState(null);
  const [gameWinner, setGameWinner] = useState(null);

  // Estados para votación (NUEVOS)
  const [votingData, setVotingData] = useState(null);
  const [votingResults, setVotingResults] = useState(null);
  const [showRankings, setShowRankings] = useState(false);
  const [specialRankings, setSpecialRankings] = useState(null);

  // Socket listeners para votación (NUEVOS)
  useEffect(() => {
    if (!socket) return;

    // Cuando empieza una votación
    socket.on('votingStarted', (data) => {
      console.log('🗳️ Votación iniciada:', data);
      setVotingData(data);
    });

    // Confirmación de voto
    socket.on('voteConfirmed', (data) => {
      console.log('✅ Voto confirmado:', data);
      // Opcional: Mostrar notificación
    });

    // Update de votación en progreso
    socket.on('votingUpdate', (data) => {
      console.log(`📊 Votos: ${data.votesReceived}/${data.totalVoters}`);
      // Opcional: Actualizar UI con progreso
    });

    // Resultados de la votación
    socket.on('votingResults', (results) => {
      console.log('📊 Resultados:', results);
      setVotingData(null); // Cerrar modal de votación
      setVotingResults(results); // Mostrar resultados
    });

    // Rankings especiales
    socket.on('specialRankings', (rankings) => {
      console.log('🏆 Rankings especiales:', rankings);
      setSpecialRankings(rankings);
      setShowRankings(true);
    });

    return () => {
      socket.off('votingStarted');
      socket.off('voteConfirmed');
      socket.off('votingUpdate');
      socket.off('votingResults');
      socket.off('specialRankings');
    };
  }, [socket]);

  // Función para completar un challenge (MODIFICADA)
  const handleChallengeCompleted = (challengeData) => {
    console.log('✅ Challenge completado:', challengeData);

    // Tu lógica existente para completar el challenge...
    setActiveChallenge(null);

    // NUEVO: Iniciar votación para challenges que no sean trivia
    const votableTypes = ['karaoke', 'dance', 'sing', 'group'];
    if (votableTypes.includes(challengeData.type)) {
      // Pequeño delay para que el usuario vea que completó el challenge
      setTimeout(() => {
        socket.emit('startVoting', {
          roomCode: roomCode,
          challengeType: challengeData.type,
          challengeText: challengeData.text || challengeData.data,
          performerId: challengeData.player.id,
          performerName: challengeData.player.name
        });
      }, 1000);
    }
  };

  // Función para votar (NUEVA)
  const handleVote = (stars) => {
    if (!votingData) return;

    console.log(`⭐ Votando ${stars} estrellas`);

    socket.emit('castVote', {
      voteId: votingData.voteId,
      voterId: myPlayerId,
      voterName: myPlayerName,
      stars: stars
    });
  };

  // Función para continuar después de ver resultados (NUEVA)
  const handleContinueAfterVoting = () => {
    console.log('➡️ Continuando el juego...');
    setVotingResults(null);

    // Aquí puedes agregar lógica adicional
    // Por ejemplo: llamar el siguiente número, etc.
  };

  // Función para cuando termina el juego (MODIFICADA)
  const handleGameEnd = (winner) => {
    console.log('🏁 Juego terminado. Ganador:', winner);
    setGameWinner(winner);

    // NUEVO: Obtener rankings especiales
    socket.emit('getSpecialRankings', { roomCode });
  };

  // Función para cerrar rankings (NUEVA)
  const handleCloseRankings = () => {
    setShowRankings(false);
    setSpecialRankings(null);

    // Opcional: Redirigir a lobby, reiniciar juego, etc.
  };

  return (
    <div className="game-screen">
      {/* Tu UI existente del juego */}
      <div className="game-content">
        {/* Cartón de bingo, números, etc. */}
      </div>

      {/* Challenge Modal (existente) */}
      {activeChallenge && (
        <ChallengeModal
          challenge={activeChallenge}
          onComplete={handleChallengeCompleted}
        />
      )}

      {/* NUEVO: Modal de Votación */}
      {votingData && (
        <VotingModal
          isOpen={true}
          performerName={votingData.performerName}
          challengeType={votingData.challengeType}
          challengeText={votingData.challengeText}
          onVote={handleVote}
          votingDuration={votingData.votingDuration}
          myPlayerId={myPlayerId}
          performerId={votingData.performerId}
        />
      )}

      {/* NUEVO: Resultados de Votación */}
      {votingResults && (
        <VotingResults
          performerName={votingResults.performerName}
          challengeType={votingResults.challengeType}
          averageStars={votingResults.averageStars}
          totalVotes={votingResults.totalVotes}
          bonusPoints={votingResults.bonusPoints}
          distribution={votingResults.distribution}
          onContinue={handleContinueAfterVoting}
        />
      )}

      {/* NUEVO: Rankings Especiales */}
      {showRankings && specialRankings && (
        <SpecialRankings
          rankings={specialRankings}
          winner={gameWinner}
          onClose={handleCloseRankings}
        />
      )}
    </div>
  );
};

export default GameScreenExample;

/**
 * NOTAS IMPORTANTES:
 *
 * 1. Asegúrate de tener los datos del jugador actual (myPlayerId, myPlayerName)
 * 2. El roomCode debe estar disponible en el componente
 * 3. Los challenges de tipo 'trivia' NO activan votación
 * 4. Solo karaoke, dance, sing y group activan votación
 * 5. El performer (quien hizo el challenge) NO puede votarse a sí mismo
 * 6. La votación dura 15 segundos por defecto
 * 7. Los resultados se muestran automáticamente después de la votación
 * 8. Los rankings especiales solo se muestran al final del juego
 */
