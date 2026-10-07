import { useState } from 'react';
import { useGame } from '../../context/useGame';
import BingoCard from '../BingoCard/BingoCard';
import ChallengeModal from '../Challenges/ChallengeModal';
import Leaderboard from '../Ranking/Leaderboard';
import Modal from '../UI/Modal';
import Confetti from '../UI/Confetti';
import MusicPlayer from '../Music/MusicPlayer';
import { formatDuration } from '../../utils/exportResults';
import './GameScreen.css';

const GameScreen = () => {
  const {
    gameState,
    players,
    currentNumber,
    calledNumbers,
    currentSong,
    timeRemaining,
    config,
    pauseGame,
    resumeGame,
    stopGame,
    triggerChallenge,
    getRankedPlayers
  } = useGame();

  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAllCards, setShowAllCards] = useState(false);
  const [selectedPlayerCard, setSelectedPlayerCard] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const progressPercentage = (timeRemaining / config.timeBetweenNumbers) * 100;
  const rankedPlayers = getRankedPlayers();

  const handlePause = () => {
    if (gameState === 'playing') {
      pauseGame();
    } else if (gameState === 'paused') {
      resumeGame();
    }
  };

  const handleStop = () => {
    if (confirm('¿Estás seguro de que quieres detener el juego?')) {
      stopGame();
    }
  };

  return (
    <div className="game-screen">
      {/* Header */}
      <div className="game-header">
        <h1>🎄 Bingo Bailable Navideño 🎅</h1>
      </div>

      {/* Controles */}
      <div className="game-controls">
        <button
          className="btn-control btn-play"
          onClick={gameState === 'paused' ? resumeGame : null}
          disabled={gameState === 'playing'}
        >
          {gameState === 'paused' ? '▶️ Reanudar' : '▶️ En Juego'}
        </button>
        <button
          className="btn-control btn-pause"
          onClick={handlePause}
          disabled={gameState !== 'playing' && gameState !== 'paused'}
        >
          ⏸️ Pausar
        </button>
        <button
          className="btn-control btn-stop"
          onClick={handleStop}
        >
          ⏹️ Detener
        </button>
        <button
          className="btn-control btn-challenge"
          onClick={triggerChallenge}
          disabled={gameState !== 'playing'}
        >
          🎯 Reto Manual
        </button>
        <button
          className="btn-control btn-ranking"
          onClick={() => setShowLeaderboard(true)}
        >
          📊 Ver Ranking
        </button>
        <button
          className="btn-control btn-cards"
          onClick={() => setShowAllCards(true)}
        >
          🎴 Ver Cartones
        </button>
      </div>

      {/* Main Content */}
      <div className="game-main">
        {/* Left Section */}
        <div className="game-left">
          {/* Número Actual */}
          <div className="current-number-section">
            <div className="current-number-label">Número Actual</div>
            <div className="current-number" key={currentNumber}>
              {currentNumber || '--'}
            </div>

            <div className="timer-section">
              <div className="timer-label">⏱️ Tiempo restante</div>
              <div className="timer-display">{timeRemaining}</div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Canción Actual */}
          <div className="current-song-section">
            <div className="song-label">🎵 Canción Actual</div>
            <div className="song-display">{currentSong || '--'}</div>
          </div>

          {/* Historial */}
          <div className="history-section">
            <h3>📋 Últimos 20 Números</h3>
            <div className="progress-info">
              {calledNumbers.length}/75 números cantados
            </div>
            <div className="history-numbers">
              {calledNumbers.slice(0, 20).map((number) => {
                let letter = '';
                if (number <= 15) letter = 'B';
                else if (number <= 30) letter = 'I';
                else if (number <= 45) letter = 'N';
                else if (number <= 60) letter = 'G';
                else letter = 'O';

                return (
                  <div
                    key={number}
                    className={`history-number history-${letter}`}
                    title={`${letter}-${number}`}
                  >
                    {number}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Section - Players Panel */}
        <div className="players-panel">
          <h3>👥 Jugadores ({players.length})</h3>
          <div className="players-list-game">
            {rankedPlayers.map((player, index) => (
              <div key={player.id} className="player-game-item">
                <div className="player-info">
                  <div className="player-rank">#{index + 1}</div>
                  <div className="player-details">
                    <div className="player-name">
                      {player.name}
                    </div>
                  </div>
                </div>
                <button
                  className="btn-view-card"
                  onClick={() => setSelectedPlayerCard(player)}
                >
                  🎴
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Challenge Modal */}
      <ChallengeModal />

      {/* Leaderboard Modal */}
      <Modal
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        title="📊 Tabla de Clasificación"
        size="large"
      >
        <Leaderboard />
      </Modal>

      {/* View All Cards Modal */}
      <Modal
        isOpen={showAllCards}
        onClose={() => setShowAllCards(false)}
        title="🎴 Cartones de Todos los Jugadores"
        size="large"
      >
        <div className="all-cards-grid">
          {players.map(player => (
            <div key={player.id} className="card-preview">
              <h4>{player.name}</h4>
              <BingoCard
                card={player.bingoCard}
                compact={true}
              />
            </div>
          ))}
        </div>
      </Modal>

      {/* View Single Player Card */}
      <Modal
        isOpen={!!selectedPlayerCard}
        onClose={() => setSelectedPlayerCard(null)}
        title={`🎴 Cartón de ${selectedPlayerCard?.name}`}
      >
        {selectedPlayerCard && (
          <div>
            <BingoCard card={selectedPlayerCard.bingoCard} />
            <div className="card-stats">
              <p>📊 Números marcados: {selectedPlayerCard.stats.numbersMarked}/25</p>
              <p>⭐ Líneas completadas: {selectedPlayerCard.stats.linesCompleted}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Confetti Effect */}
      <Confetti trigger={showConfetti} onComplete={() => setShowConfetti(false)} />

      {/* Music Player */}
      <MusicPlayer
        autoPlay={gameState === 'playing'}
        onSongChange={(song) => console.log('Now playing:', song.title)}
      />
    </div>
  );
};

export default GameScreen;
