import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import './VotingModal.css';

/**
 * Modal de Votación para Tie-Break
 * Permite votar por múltiples candidatos a la vez
 */
const TiebreakVotingModal = ({
  isOpen,
  candidates = [], // [{ performerId, performerName }]
  onVote, // (performerId, stars) => void
  votingDuration = 30
}) => {
  const [votes, setVotes] = useState({}); // { performerId: stars }
  const [hoveredStars, setHoveredStars] = useState({}); // { performerId: stars }
  const [timeLeft, setTimeLeft] = useState(votingDuration);

  // Timer de votación. These resets intentionally happen when the modal opens.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;

    setTimeLeft(votingDuration);
    setVotes({});
    setHoveredStars({});

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
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!isOpen) return null;

  const handleStarClick = (performerId, stars) => {
    if (timeLeft === 0) return;

    // Guardar voto localmente
    setVotes(prev => ({ ...prev, [performerId]: stars }));

    // Llamar callback
    if (onVote) {
      onVote(performerId, stars);
    }
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

  const allVoted = candidates.length > 0 &&
    candidates.every(c => votes[c.performerId] !== undefined);

  return (
    <div className="voting-modal-overlay pf-voting-modal-overlay" role="dialog" aria-modal="true" aria-label="Votación de desempate">
      <div className="voting-modal-content" style={{ maxWidth: '700px' }}>
        {/* Header */}
        <div className="voting-header">
          <h2>🗳️ Vota por cada candidato</h2>
          <div className="voting-timer">
            ⏱️ {timeLeft}s
          </div>
        </div>

        {/* Lista de Candidatos */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          maxHeight: '500px',
          overflowY: 'auto',
          padding: '10px'
        }}>
          {candidates.map((candidate) => {
            const hasVoted = votes[candidate.performerId] !== undefined;
            const selectedStars = votes[candidate.performerId] || 0;
            const hovered = hoveredStars[candidate.performerId] || 0;

            return (
              <div
                key={candidate.performerId}
                style={{
                  background: hasVoted
                    ? 'rgba(34, 197, 94, 0.1)'
                    : 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  padding: '20px',
                  border: hasVoted
                    ? '2px solid rgba(34, 197, 94, 0.5)'
                    : '2px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                {/* Nombre del candidato */}
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  marginBottom: '15px',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span>👤 {candidate.performerName}</span>
                  {hasVoted && <span style={{ color: '#22c55e', fontSize: '1rem' }}>✓ Votado</span>}
                </div>

                {/* Estrellas */}
                <div style={{
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'center',
                  marginBottom: '10px'
                }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: timeLeft === 0 ? 'not-allowed' : 'pointer',
                        opacity: timeLeft === 0 ? 0.5 : 1,
                        padding: '5px',
                        transition: 'transform 0.2s'
                      }}
                      onMouseEnter={() => {
                        if (timeLeft > 0) {
                          setHoveredStars(prev => ({
                            ...prev,
                            [candidate.performerId]: star
                          }));
                        }
                      }}
                      onMouseLeave={() => {
                        setHoveredStars(prev => ({
                          ...prev,
                          [candidate.performerId]: 0
                        }));
                      }}
                      onClick={() => handleStarClick(candidate.performerId, star)}
                      disabled={timeLeft === 0}
                      onMouseOver={(e) => {
                        if (timeLeft > 0) {
                          e.currentTarget.style.transform = 'scale(1.2)';
                        }
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      <Star
                        size={40}
                        fill={star <= (hovered || selectedStars) ? '#fbbf24' : 'none'}
                        color={star <= (hovered || selectedStars) ? '#fbbf24' : '#9ca3af'}
                      />
                    </button>
                  ))}
                </div>

                {/* Descripción */}
                {(hovered > 0 || selectedStars > 0) && (
                  <div style={{
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '0.9rem'
                  }}>
                    {getStarDescription(hovered || selectedStars)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="voting-footer" style={{ marginTop: '20px' }}>
          {allVoted ? (
            <p style={{ color: '#22c55e', fontWeight: 'bold' }}>
              ✅ Has votado por todos - Gracias!
            </p>
          ) : (
            <p style={{ color: '#9ca3af' }}>
              Votaste por {Object.keys(votes).length} de {candidates.length} candidatos
            </p>
          )}
          {timeLeft === 0 && (
            <p className="timeout-message">⏰ Tiempo agotado</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TiebreakVotingModal;
