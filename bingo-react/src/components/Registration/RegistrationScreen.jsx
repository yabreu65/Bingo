import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import MusicPlayer from '../Music/MusicPlayer';
import './RegistrationScreen.css';

const RegistrationScreen = () => {
  const { players, addPlayer, removePlayer, startGame } = useGame();
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');

  const handleAddPlayer = () => {
    const result = addPlayer(playerName);

    if (result.success) {
      setPlayerName('');
      setError('');
    } else {
      setError(result.message);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddPlayer();
    }
  };

  const handleStartGame = () => {
    const result = startGame();
    if (!result.success) {
      setError(result.message);
    }
  };

  return (
    <div className="registration-screen">
      <div className="registration-container">
        <h1>🎄 Bingo Bailable Navideño 🎅</h1>
        <p className="subtitle">¡Registra a todos los jugadores!</p>

        <div className="input-group">
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Nombre del jugador"
            maxLength={30}
            className="player-input"
          />
          <button onClick={handleAddPlayer} className="btn btn-add">
            Agregar Jugador
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="players-list">
          <h3>👥 Jugadores Registrados</h3>
          {players.length === 0 ? (
            <p className="no-players">No hay jugadores registrados</p>
          ) : (
            <div className="players-items">
              {players.map((player, index) => (
                <div key={player.id} className="player-item">
                  <span>{index + 1}. {player.name}</span>
                  <button
                    onClick={() => removePlayer(player.id)}
                    className="btn-remove"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="player-count">
            {players.length} jugador{players.length !== 1 ? 'es' : ''} registrado{players.length !== 1 ? 's' : ''}
          </div>
        </div>

        <button
          onClick={handleStartGame}
          className="btn btn-start"
          disabled={players.length < 2}
        >
          🎮 Iniciar Juego
        </button>
      </div>

      {/* Music Player */}
      <MusicPlayer
        autoPlay={true}
        onSongChange={(song) => console.log('Now playing:', song.title)}
      />
    </div>
  );
};

export default RegistrationScreen;
