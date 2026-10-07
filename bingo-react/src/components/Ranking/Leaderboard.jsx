import { useGame } from '../../context/useGame';
import './Leaderboard.css';

const Leaderboard = () => {
  const { getRankedPlayers } = useGame();
  const players = getRankedPlayers();

  return (
    <div className="leaderboard">
      {players.length === 0 ? (
        <p className="no-data">No hay jugadores registrados</p>
      ) : (
        <div className="leaderboard-table">
          {players.map((player, index) => {
            const triviaPercentage = player.stats.triviaAttempted > 0
              ? Math.round((player.stats.triviaCorrect / player.stats.triviaAttempted) * 100)
              : 0;

            return (
              <div key={player.id} className={`leaderboard-item rank-${index + 1}`}>
                {/* Player Info */}
                <div className="player-main-info">
                  <div className="player-name-large">
                    {player.name}
                  </div>
                </div>

                {/* Stats */}
                <div className="player-stats-detail">
                  <div className="stat-item">
                    <span className="stat-icon">🧠</span>
                    <span className="stat-value">{triviaPercentage}%</span>
                    <span className="stat-label">Aciertos</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-icon">🎯</span>
                    <span className="stat-value">{player.stats.challengesCompleted}</span>
                    <span className="stat-label">Retos</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-icon">📊</span>
                    <span className="stat-value">{player.stats.linesCompleted}</span>
                    <span className="stat-label">Líneas</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-icon">🎴</span>
                    <span className="stat-value">{player.stats.numbersMarked}/25</span>
                    <span className="stat-label">Números</span>
                  </div>
                </div>

                {/* Achievements */}
                <div className="achievements">
                  {player.stats.hasFourCorners && <span className="achievement" title="4 Esquinas">🔷</span>}
                  {player.stats.hasCentralCross && <span className="achievement" title="Cruz Central">✝️</span>}
                  {player.stats.hasFullCard && <span className="achievement" title="Cartón Completo">🎉</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
