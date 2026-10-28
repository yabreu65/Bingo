import { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { API_URL } from '../../config/api';

const noop = () => {};

/**
 * DeezerPlayer - Reproductor de previews de 30 segundos de Deezer
 * Para uso en challenges de baile y canto
 */
const DeezerPlayer = ({
  trackId,
  autoPlay = true,
  showControls = true,
  onEnded = noop,
  onUnavailable = noop,
  className = ''
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30); // Los previews son de 30 segundos
  const [previewUrl, setPreviewUrl] = useState(null);
  const [trackInfo, setTrackInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const audioRef = useRef(null);

  // Cargar información de la canción y URL del preview
  useEffect(() => {
    if (!trackId) {
      console.warn('⚠️ DeezerPlayer: No trackId provided');
      return;
    }

    const fetchTrackInfo = async () => {
      setLoading(true);
      setError(null);

      console.log(`🎵 DeezerPlayer: Fetching track ${trackId} from Deezer...`);

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(`${API_URL}/api/deezer/track/${trackId}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ DeezerPlayer: HTTP error ${response.status}:`, errorText);
          throw new Error('La música no está disponible ahora');
        }

        const data = await response.json();
        console.log('📦 DeezerPlayer: Response data:', data);

        if (data.success && data.track) {
          console.log('✅ DeezerPlayer: Track loaded successfully:', data.track.title);
          setTrackInfo(data.track);
          setPreviewUrl(data.track.preview);

          if (!data.track.preview) {
            console.warn('⚠️ DeezerPlayer: Track has no preview URL');
          throw new Error('La música no tiene un preview disponible');
          }
        } else {
          console.error('❌ DeezerPlayer: Invalid response format:', data);
          throw new Error('La música no está disponible ahora');
        }
      } catch (err) {
        const message = err.name === 'AbortError'
          ? 'La música tardó demasiado en responder'
          : 'La música no está disponible ahora';
        console.warn('Deezer preview unavailable:', err.message);
        setError(message);
        onUnavailable(message);
      } finally {
        window.clearTimeout(timeout);
        setLoading(false);
      }
    };

    fetchTrackInfo();
  }, [trackId, onUnavailable]);

  // Auto-play cuando el preview está listo
  useEffect(() => {
    if (previewUrl && autoPlay && audioRef.current) {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => setError('La música está lista. Presioná reproducir para iniciar.'));
    }
  }, [previewUrl, autoPlay]);

  // Actualizar tiempo actual
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      onEnded();
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onEnded]);

  // Controlar volumen
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => setError('No se pudo iniciar la música. Presioná reproducir nuevamente.'));
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0) {
      setIsMuted(false);
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = (currentTime / duration) * 100 || 0;

  if (loading) {
    return (
      <div className={`deezer-player loading ${className}`}>
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-12 w-12 bg-gray-300 rounded"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !previewUrl) {
    return (
      <div className={`deezer-player error ${className}`}>
        <div className="text-red-500 text-center py-4">
          {error || 'La música no está disponible ahora. El reto puede continuar sin música.'}
        </div>
      </div>
    );
  }

  return (
    <div className={`deezer-player ${className}`}>
      {/* Audio Element */}
      <audio ref={audioRef} src={previewUrl} preload="auto" />

      {/* Track Info */}
      {trackInfo && (
        <div className="track-info flex items-center gap-3 mb-3">
          {trackInfo.cover && (
            <img
              src={trackInfo.coverSmall}
              alt={trackInfo.title}
              className="w-16 h-16 rounded-lg object-cover shadow-md"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-gray-900 truncate">
              {trackInfo.title}
            </div>
            <div className="text-sm text-gray-600 truncate">
              {trackInfo.artist}
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="progress-bar mb-3">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{formatTime(currentTime)}</span>
          <span className="text-blue-600 font-medium">Preview 30s</span>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      {showControls && (
        <div className="controls flex items-center gap-4">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlayPause}
            className="play-button bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white p-3 rounded-full shadow-lg transition-all hover:scale-110"
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>

          {/* Volume Controls */}
          <div className="volume-controls flex items-center gap-2 flex-1">
            <button
              onClick={toggleMute}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
          </div>
        </div>
      )}

      {/* Deezer Attribution */}
      <div className="deezer-attribution text-xs text-gray-400 text-center mt-2">
        Powered by Deezer
      </div>
    </div>
  );
};

export default DeezerPlayer;
