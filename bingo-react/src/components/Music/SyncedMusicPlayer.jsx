import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import ReactPlayer from 'react-player';
import { useSocket } from '../../context/useSocket';
import './MusicPlayer.css';

const SyncedMusicPlayer = ({ roomCode, isHost, hostCapability, playlist = [], currentIndex: externalIndex = 0, onSongChange }) => {
  const { socket } = useSocket();
  const [currentIndex, setCurrentIndex] = useState(externalIndex);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const playerRef = useRef(null);
  const syncTimeoutRef = useRef(null);
  const [allowPlay, setAllowPlay] = useState(false);

  // Sincronizar índice externo con estado local
  useEffect(() => {
    setCurrentIndex(externalIndex);
  }, [externalIndex]);

  // Socket listeners para sincronización
  useEffect(() => {
    if (!socket) return;

    const handleMusicSync = (data) => {
      const { isPlaying, currentSongId, currentTime } = data;

      // Encontrar índice de la canción
      const songIndex = playlist.findIndex(song => song.id === currentSongId);
      if (songIndex !== -1 && songIndex !== currentIndex) {
        setCurrentIndex(songIndex);
      }

      if (allowPlay) {
        setPlaying(isPlaying);
      } else {
        setPlaying(false);
      }

      // Sincronizar tiempo del video
      if (playerRef.current && currentTime !== undefined) {
        playerRef.current.seekTo(currentTime, 'seconds');
      }
    };

    const handleVolumeSync = (data) => {
      setVolume(data.volume);
    };

    socket.on('music-sync', handleMusicSync);
    socket.on('music-volume-sync', handleVolumeSync);

    return () => {
      socket.off('music-sync', handleMusicSync);
      socket.off('music-volume-sync', handleVolumeSync);
    };
  }, [socket, playlist, currentIndex, allowPlay]);

  // Habilitar reproducción al llegar a 0 del countdown
  useEffect(() => {
    if (!socket) return;
    const handleCountdownTick = (data) => {
      if (data?.value <= 0) setAllowPlay(true);
    };
    socket.on('countdown-tick', handleCountdownTick);
    return () => socket.off('countdown-tick', handleCountdownTick);
  }, [socket]);

  const currentSong = playlist[currentIndex];

  // Emitir evento cuando la canción termina (solo el host)
  const handleEnded = () => {
    const nextIndex = (currentIndex + 1) % playlist.length;
    const nextSong = playlist[nextIndex];

    if (isHost && nextSong) {
      setCurrentIndex(nextIndex);
      socket?.emit('music-song-change', {
        roomCode,
        songId: nextSong.id,
        hostCapability
      });

      // Auto-play la siguiente canción si estaba reproduciendo
      if (playing) {
        socket?.emit('music-play', {
          roomCode,
          songId: nextSong.id,
          currentTime: 0,
          hostCapability
        });
      }
    }
  };

  const handleNext = () => {
    if (!isHost) return;

    const nextIndex = (currentIndex + 1) % playlist.length;
    const nextSong = playlist[nextIndex];

    setCurrentIndex(nextIndex);
    if (onSongChange) {
      onSongChange(nextIndex);
    }

    socket?.emit('music-song-change', {
      roomCode,
      songId: nextSong.videoId || nextSong.id,
      hostCapability
    });

    if (playing) {
      socket?.emit('music-play', {
        roomCode,
        songId: nextSong.videoId || nextSong.id,
        currentTime: 0,
        hostCapability
      });
    }
  };

  const handlePrevious = () => {
    if (!isHost) return;

    const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
    const prevSong = playlist[prevIndex];

    setCurrentIndex(prevIndex);
    if (onSongChange) {
      onSongChange(prevIndex);
    }

    socket?.emit('music-song-change', {
      roomCode,
      songId: prevSong.videoId || prevSong.id,
      hostCapability
    });

    if (playing) {
      socket?.emit('music-play', {
        roomCode,
        songId: prevSong.videoId || prevSong.id,
        currentTime: 0,
        hostCapability
      });
    }
  };

  const handlePlayPause = () => {
    if (!isHost) return;

    const newPlayingState = !playing;
    setPlaying(newPlayingState);

    if (newPlayingState) {
      socket?.emit('music-play', {
        roomCode,
        songId: currentSong.videoId || currentSong.id,
        currentTime: playerRef.current?.getCurrentTime() || 0,
        hostCapability
      });
      setMuted(false);
    } else {
      socket?.emit('music-pause', {
        roomCode,
        currentTime: playerRef.current?.getCurrentTime() || 0,
        hostCapability
      });
    }
  };

  const handleVolumeChange = (e) => {
    if (!isHost) return;

    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);

    // Debounce para no saturar el servidor
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      socket?.emit('music-volume-change', {
        roomCode,
        volume: newVolume,
        hostCapability
      });
    }, 200);
  };

  const handleToggleMute = () => {
    setMuted(!muted);
  };

  const handleSongSelect = (index) => {
    if (!isHost) return;

    const selectedSong = playlist[index];
    setCurrentIndex(index);
    if (onSongChange) {
      onSongChange(index);
    }
    setShowPlaylist(false);

    socket?.emit('music-song-change', {
      roomCode,
      songId: selectedSong.videoId || selectedSong.id,
      hostCapability
    });

    if (playing) {
      socket?.emit('music-play', {
        roomCode,
        songId: selectedSong.videoId || selectedSong.id,
        currentTime: 0,
        hostCapability
      });
    }
  };

  const handleShuffle = () => {
    // Disabled for now - shuffle is managed by the OrganizerDashboard
    toast.info('Para cambiar el playlist, usa el selector de modo musical en el Dashboard', {
      duration: 4000
    });
  };

  // Cleanup timeout on unmount para evitar memory leaks
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

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
            <h3>🎄 Música Navideña 🎅</h3>
            <button
              className="close-btn"
              onClick={() => setShowPlayer(false)}
            >
              ✕
            </button>
          </div>

          <div className="current-song">
            <div className="song-emoji">🎵</div>
            <div className="song-info">
              <div className="song-title">{currentSong?.title || 'Sin título'}</div>
              <div className="song-artist">{currentSong?.artist || 'Artista desconocido'}</div>
            </div>
          </div>

          {/* Player de YouTube (oculto) */}
          <div style={{ display: 'none' }}>
          <ReactPlayer
            ref={playerRef}
            url={`https://www.youtube.com/watch?v=${currentSong.videoId}`}
            playing={playing}
            volume={volume}
            muted={muted}
            onEnded={handleEnded}
            config={{
              youtube: {
                playerVars: {
                  autoplay: 1,
                  controls: 0,
                  modestbranding: 1
                }
              }
            }}
          />
          </div>

          {/* Controles */}
          <div className="player-controls">
            <button
              className="control-btn"
              onClick={handlePrevious}
              disabled={!isHost}
              title="Anterior"
            >
              ⏮️
            </button>
            <button
              className="control-btn play-btn"
              onClick={handlePlayPause}
              disabled={!isHost}
              title={playing ? "Pausar" : "Reproducir"}
            >
              {playing ? "⏸️" : "▶️"}
            </button>
            <button
              className="control-btn"
              onClick={handleNext}
              disabled={!isHost}
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
              disabled={!isHost}
            />
          </div>

          {/* Botones adicionales */}
          <div className="additional-controls">
            <button
              className="action-btn"
              onClick={handleShuffle}
              disabled={!isHost}
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

          {/* Indicador de modo */}
          <div className={`sync-indicator ${isHost ? 'host' : 'guest'}`}>
            {isHost ? '🎛️ Eres el DJ - Controla la música' : '🔗 Música sincronizada con el anfitrión'}
          </div>

          {/* Playlist */}
          {showPlaylist && (
            <div className="playlist-panel">
              <div className="playlist-header">
                <h4>Playlist Navideña</h4>
                <button onClick={() => setShowPlaylist(false)}>✕</button>
              </div>
              <div className="playlist-items">
                {playlist.map((song, index) => (
                  <div
                    key={index}
                    className={`playlist-item ${index === currentIndex ? 'active' : ''} ${!isHost ? 'disabled' : ''}`}
                    onClick={() => handleSongSelect(index)}
                    style={{ cursor: isHost ? 'pointer' : 'not-allowed' }}
                  >
                    <div className="playlist-emoji">🎵</div>
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

export default SyncedMusicPlayer;
