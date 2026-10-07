import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import './VotingModal.css';

/**
 * Modal de Votación
 * Permite a los jugadores votar la actuación de otro jugador
 */
const VotingModal = ({
  isOpen,
  performerName,
  challengeType,
  challengeText,
  onVote,
  votingDuration = 15,
  myPlayerId,
  performerId
}) => {
  const [selectedStars, setSelectedStars] = useState(0);
  const [hoveredStars, setHoveredStars] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(votingDuration);

  // Timer de votación
  useEffect(() => {
    if (!isOpen) return;

    setTimeLeft(votingDuration);
    setHasVoted(false);
    setSelectedStars(0);

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, votingDuration]);

  // No mostrar si el modal no está abierto
  if (!isOpen) return null;

  // Verificar si el jugador actual es el performer
  const isPerformer = myPlayerId === performerId;

  const handleStarClick = (stars) => {
    if (hasVoted || isPerformer) return;

    setSelectedStars(stars);
    setHasVoted(true);

    // Llamar callback de votación
    if (onVote) {
      onVote(stars);
    }
  };

  const getChallengeLabel = (type) => {
    const labels = {
      karaoke: '🎤 Karaoke',
      dance: '💃 Baile',
      sing: '🎤 Canto',
      group: '👥 Grupal',
      trivia: '🧠 Trivia'
    };
    return labels[type] || 'Challenge';
  };

  const getStarDescription = (stars) => {
    const descriptions = {
      1: 'Malo',
      2: 'Regular',
      3: 'Bien',
      4: 'Muy Bien',
      5: 'Increíble'
    };
    return descriptions[stars] || '';
  };

  return (
    <div className="voting-modal-overlay">
      <div className="voting-modal-content">
        {/* Header */}
        <div className="voting-header">
          <h2>⭐ ¡Vota la Actuación!</h2>
          <div className="voting-timer">
            ⏱️ {timeLeft}s
          </div>
        </div>

        {/* Performer Info */}
        <div className="voting-performer">
          <div className="performer-name">👤 {performerName}</div>
          <div className="challenge-badge">{getChallengeLabel(challengeType)}</div>
          {challengeText && (
            <div className="challenge-text">{challengeText}</div>
          )}
        </div>

        {/* Stars */}
        {isPerformer ? (
          <div className="voting-waiting">
            <p>🎭 Eres el artista</p>
            <p className="text-sm">Espera a que tus compañeros voten...</p>
          </div>
        ) : hasVoted ? (
          <div className="voting-confirmed">
            <div className="vote-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={48}
                  className={star <= selectedStars ? 'star-filled' : 'star-empty'}
                  fill={star <= selectedStars ? 'currentColor' : 'none'}
                />
              ))}
            </div>
            <p className="vote-description">{getStarDescription(selectedStars)}</p>
            <div className="vote-success">
              ✅ Voto registrado - Gracias!
            </div>
          </div>
        ) : (
          <div className="voting-stars">
            <p className="voting-question">¿Qué tal estuvo?</p>
            <div className="stars-container">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  className={`star-button ${star <= (hoveredStars || selectedStars) ? 'active' : ''}`}
                  onMouseEnter={() => setHoveredStars(star)}
                  onMouseLeave={() => setHoveredStars(0)}
                  onClick={() => handleStarClick(star)}
                  disabled={timeLeft === 0}
                >
                  <Star
                    size={64}
                    fill={star <= (hoveredStars || selectedStars) ? 'currentColor' : 'none'}
                  />
                </button>
              ))}
            </div>
            <div className="star-labels">
              {hoveredStars > 0 && (
                <p className="star-description">{getStarDescription(hoveredStars)}</p>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {!isPerformer && (
          <div className="voting-footer">
            {timeLeft === 0 && !hasVoted && (
              <p className="timeout-message">⏰ Tiempo agotado</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VotingModal;
