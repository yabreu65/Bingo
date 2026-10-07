import { useState, useEffect } from 'react';
import { Star, Trophy, Sparkles, Music, Heart } from 'lucide-react';
import './SpecialRankings.css';

/**
 * Pantalla de Rankings Especiales
 * Muestra los premios especiales al final del juego
 */
const SpecialRankings = ({
  rankings,
  winner,
  onClose
}) => {
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const renderAward = (title, icon, performance, color) => {
    if (!performance) return null;

    return (
      <div className={`award-card ${color}`}>
        <div className="award-icon">{icon}</div>
        <div className="award-title">{title}</div>
        <div className="award-winner">
          <Trophy size={20} />
          <span>{performance.performerName}</span>
        </div>
        <div className="award-challenge">{performance.challengeText}</div>
        <div className="award-stars">
          {Array(5).fill(0).map((_, i) => (
            <Star
              key={i}
              size={16}
              fill={i < Math.round(performance.averageStars) ? 'currentColor' : 'none'}
              className={i < Math.round(performance.averageStars) ? 'star-filled' : 'star-empty'}
            />
          ))}
          <span className="stars-value">{performance.averageStars.toFixed(1)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="special-rankings-overlay">
      {showConfetti && <div className="confetti-container"></div>}

      <div className="special-rankings-content">
        {/* Header */}
        <div className="rankings-header">
          <h1>🏆 RESULTADOS FINALES 🏆</h1>
        </div>

        {/* Ganador del Bingo */}
        {winner && (
          <div className="main-winner">
            <Trophy size={48} className="trophy-icon" />
            <h2>🎉 GANADOR DEL BINGO</h2>
            <div className="winner-name">{winner.name}</div>
            <div className="winner-score">{winner.score} puntos</div>
          </div>
        )}

        <div className="divider"></div>

        {/* Premios Especiales */}
        <div className="special-awards">
          <h2>🌟 PREMIOS ESPECIALES</h2>

          <div className="awards-grid">
            {/* Mejor Cantante (Karaoke) */}
            {renderAward(
              '🎤 Mejor Cantante',
              '🎤',
              rankings?.bestKaraoke,
              'award-karaoke'
            )}

            {/* Mejor Bailarín */}
            {renderAward(
              '💃 Mejor Bailarín',
              '💃',
              rankings?.bestDance,
              'award-dance'
            )}

            {/* Mejor Cantante (Sing) */}
            {renderAward(
              '🎵 Mejor Vocalista',
              '🎵',
              rankings?.bestSing,
              'award-sing'
            )}

            {/* Más Divertido */}
            {renderAward(
              '😂 Más Divertido',
              '😂',
              rankings?.funniest,
              'award-funny'
            )}

            {/* Mejor Grupal */}
            {renderAward(
              '👥 Mejor Grupal',
              '👥',
              rankings?.bestGroup,
              'award-group'
            )}
          </div>
        </div>

        {/* Top 3 Actuaciones */}
        {rankings?.top3 && rankings.top3.length > 0 && (
          <>
            <div className="divider"></div>
            <div className="top-performances">
              <h2>⭐ TOP 3 ACTUACIONES</h2>
              <div className="top3-list">
                {rankings.top3.map((performance, index) => (
                  <div key={index} className={`top3-item rank-${index + 1}`}>
                    <div className="rank-badge">{index + 1}</div>
                    <div className="top3-info">
                      <div className="top3-name">{performance.performerName}</div>
                      <div className="top3-challenge">{performance.challengeText}</div>
                    </div>
                    <div className="top3-stars">
                      <Star size={20} fill="currentColor" />
                      <span>{performance.averageStars.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Estadísticas */}
        {rankings?.totalVotings > 0 && (
          <div className="rankings-stats">
            <Sparkles size={20} />
            <span>Total de actuaciones: {rankings.totalVotings}</span>
          </div>
        )}

        {/* Botones */}
        <div className="rankings-actions">
          <button className="btn-close-rankings" onClick={onClose}>
            Cerrar ✖️
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpecialRankings;
