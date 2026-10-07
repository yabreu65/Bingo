import { Star } from 'lucide-react';
import './VotingResults.css';

/**
 * Componente que muestra los resultados de una votación
 */
const VotingResults = ({
  performerName,
  challengeType,
  averageStars,
  totalVotes,
  bonusPoints,
  distribution,
  onContinue
}) => {
  const getChallengeEmoji = (type) => {
    const emojis = {
      karaoke: '🎤',
      dance: '💃',
      sing: '🎤',
      group: '👥',
      trivia: '🧠'
    };
    return emojis[type] || '🎯';
  };

  const getPercentage = (count) => {
    if (totalVotes === 0) return 0;
    return Math.round((count / totalVotes) * 100);
  };

  const renderStars = (count) => {
    return Array(5).fill(0).map((_, i) => (
      <Star
        key={i}
        size={20}
        fill={i < Math.round(averageStars) ? 'currentColor' : 'none'}
        className={i < Math.round(averageStars) ? 'star-filled' : 'star-empty'}
      />
    ));
  };

  return (
    <div className="voting-results-overlay">
      <div className="voting-results-content">
        {/* Header con confeti */}
        <div className="results-header">
          <h2>📊 RESULTADOS DE LA VOTACIÓN</h2>
        </div>

        {/* Performer */}
        <div className="results-performer">
          <div className="performer-name">
            {getChallengeEmoji(challengeType)} {performerName}
          </div>
        </div>

        {/* Score Principal */}
        <div className="results-score">
          <div className="score-stars">
            {renderStars(averageStars)}
          </div>
          <div className="score-average">
            {averageStars.toFixed(1)} / 5.0
          </div>
          <div className="score-percentage">
            {Math.round((averageStars / 5) * 100)}%
          </div>
        </div>

        {/* Distribución de Votos */}
        <div className="results-distribution">
          <h3>📊 Detalle de votos:</h3>
          <div className="distribution-bars">
            {[5, 4, 3, 2, 1].map((stars) => {
              const key = ['five', 'four', 'three', 'two', 'one'][5 - stars];
              const count = distribution[key] || 0;
              const percentage = getPercentage(count);

              return (
                <div key={stars} className="distribution-row">
                  <div className="dist-label">
                    {Array(stars).fill(0).map((_, i) => (
                      <Star key={i} size={16} fill="currentColor" />
                    ))}
                    <span>({stars})</span>
                  </div>
                  <div className="dist-bar-container">
                    <div
                      className="dist-bar"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="dist-count">
                    {count} {count === 1 ? 'voto' : 'votos'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Puntos Bonus */}
        <div className="results-bonus">
          <div className="bonus-label">🎉 Puntos Bonus</div>
          <div className="bonus-points">+{bonusPoints} pts</div>
        </div>

        {/* Total de Votos */}
        <div className="results-summary">
          Total de votos: <strong>{totalVotes}</strong>
        </div>

        {/* Botón Continuar */}
        <button className="btn-continue" onClick={onContinue}>
          Continuar Juego ➡️
        </button>
      </div>
    </div>
  );
};

export default VotingResults;
