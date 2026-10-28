import { useState, useEffect, useRef } from 'react';
import LocalMediaPlayer from './LocalMediaPlayer';
import { MUSIC_PLAYLISTS, shufflePlaylist } from '../../config/musicPlaylists';
import './MusicPlayer.css';

const MusicPlayer = ({ onSongChange, syncMode = false, currentSongId = null }) => {
  const [playlist, setPlaylist] = useState(() => shufflePlaylist());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false); // Empieza pausado para evitar autoplay bloqueado
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const playerRef = useRef(null);

  // En modo sync, derivar la canción del servidor sin duplicar estado local.
  const syncedIndex = syncMode && currentSongId
    ? playlist.findIndex(song => song.id === currentSongId)
    : -1;
  const activeIndex = syncedIndex >= 0 ? syncedIndex : currentIndex;
  const currentSong = playlist[activeIndex];

  // Notificar cambio de canción
  useEffect(() => {
    if (currentSong && onSongChange) {
      onSongChange(currentSong);
    }
  }, [currentSong, onSongChange]);

  const handleEnded = () => {
    // Avanzar a la siguiente canción
    const nextIndex = (currentIndex + 1) % playlist.length;
    setCurrentIndex(nextIndex);
  };

  const handleNext = () => {
    if (!syncMode) {
      const nextIndex = (currentIndex + 1) % playlist.length;
      setCurrentIndex(nextIndex);
    }
  };

  const handlePrevious = () => {
    if (!syncMode) {
      const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
      setCurrentIndex(prevIndex);
    }
  };

  const handlePlayPause = () => {
    if (!syncMode) {
      setPlaying(!playing);
      if (!playing) {
        setMuted(false); // Asegurar que no esté silenciado al reproducir
      }
    }
  };

  const handleVolumeChange = (e) => {
    setVolume(parseFloat(e.target.value));
  };

  const handleToggleMute = () => {
    setMuted(!muted);
  };

  const handleSongSelect = (index) => {
    if (!syncMode) {
      setCurrentIndex(index);
      setShowPlaylist(false);
    }
  };

  const handleShuffle = () => {
    if (!syncMode) {
      const shuffled = shufflePlaylist();
      setPlaylist(shuffled);
      setCurrentIndex(0);
    }
  };

  if (!currentSong) {
    return null;
  }

  return (
    <div className="music-player-container">
      {/* Botón flotante para mostrar/ocultar player */}
      <button
        className="music-toggle-btn"
        onClick={() => setShowPlayer(!showPlayer)}
        title={showPlayer ? "Ocultar reproductor" : "Mostrar reproductor"}
      >
        {playing ? "🎵" : "🎵"}
      </button>

      {/* Player expandido */}
      {showPlayer && (
        <div className="music-player">
          <div className="music-header">
            <h3>🎵 Música Bailable 💃</h3>
            <button
              className="close-btn"
              onClick={() => setShowPlayer(false)}
            >
              ✕
            </button>
          </div>

          <div className="current-song">
            <div className="song-emoji">{currentSong.emoji}</div>
            <div className="song-info">
              <div className="song-title">{currentSong.title}</div>
              <div className="song-artist">{currentSong.artist}</div>
            </div>
          </div>

          <LocalMediaPlayer
              ref={playerRef}
              song={currentSong}
              playing={playing}
              volume={volume}
              muted={muted}
              onEnded={handleEnded}
          />

          {/* Controles */}
          <div className="player-controls">
            <button
              className="control-btn"
              onClick={handlePrevious}
              disabled={syncMode}
              title="Anterior"
            >
              ⏮️
            </button>
            <button
              className="control-btn play-btn"
              onClick={handlePlayPause}
              disabled={syncMode}
              title={playing ? "Pausar" : "Reproducir"}
            >
              {playing ? "⏸️" : "▶️"}
            </button>
            <button
              className="control-btn"
              onClick={handleNext}
              disabled={syncMode}
              title="Siguiente"
            >
              ⏭️
            </button>
          </div>

          {/* Volumen */}
          <div className="volume-control">
            <button
              className="volume-btn"
              onClick={handleToggleMute}
              title={muted ? "Activar sonido" : "Silenciar"}
            >
              {muted ? "🔇" : volume > 0.5 ? "🔊" : volume > 0 ? "🔉" : "🔈"}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="volume-slider"
            />
          </div>

          {/* Botones adicionales */}
          <div className="additional-controls">
            <button
              className="action-btn"
              onClick={handleShuffle}
              disabled={syncMode}
              title="Aleatorio"
            >
              🔀 Aleatorio
            </button>
            <button
              className="action-btn"
              onClick={() => setShowPlaylist(!showPlaylist)}
              title="Ver playlist"
            >
              📋 Playlist ({playlist.length})
            </button>
          </div>

          {/* Modo sincronizado */}
          {syncMode && (
            <div className="sync-indicator">
              🔗 Música sincronizada con el anfitrión
            </div>
          )}

          {/* Playlist */}
          {showPlaylist && (
            <div className="playlist-panel">
              <div className="playlist-header">
                <h4>Playlist Bailable</h4>
                <button onClick={() => setShowPlaylist(false)}>✕</button>
              </div>
              <div className="playlist-items">
                {playlist.map((song, index) => (
                  <div
                    key={song.id}
                    className={`playlist-item ${index === currentIndex ? 'active' : ''}`}
                    onClick={() => handleSongSelect(index)}
                  >
                    <div className="playlist-emoji">{song.emoji}</div>
                    <div className="playlist-info">
                      <div className="playlist-title">{song.title}</div>
                      <div className="playlist-artist">{song.artist}</div>
                    </div>
                    {index === currentIndex && (
                      <div className="now-playing">▶️</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MusicPlayer;
