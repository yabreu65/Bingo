import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const LocalMediaPlayer = forwardRef(function LocalMediaPlayer({
  song,
  playing = false,
  volume = 0.5,
  muted = false,
  controls = false,
  onEnded,
  className = ''
}, ref) {
  const mediaRef = useRef(null);
  const [status, setStatus] = useState('loading');

  const source = song?.localFile
    ? `/music/${encodeURI(song.localFile.replace(/^\/+/, ''))}`
    : null;

  useImperativeHandle(ref, () => ({
    seekTo: (seconds) => {
      if (mediaRef.current) mediaRef.current.currentTime = Number(seconds) || 0;
    },
    getCurrentTime: () => mediaRef.current?.currentTime || 0
  }), []);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !source) return undefined;

    media.volume = muted ? 0 : volume;
    if (!playing) {
      media.pause();
      return undefined;
    }

    const playPromise = media.play();
    if (playPromise?.catch) {
      playPromise
        .then(() => setStatus('playing'))
        .catch(() => setStatus('autoplay-blocked'));
    }
    return undefined;
  }, [playing, volume, muted, source]);

  if (!source) {
    return <p className={`local-media-status ${className}`} role="status">
      Este recurso no tiene un archivo local autorizado.
    </p>;
  }

  return (
    <div className={`local-media-player ${className}`}>
      <video
        ref={mediaRef}
        src={source}
        controls={controls}
        playsInline
        preload="metadata"
        onCanPlay={() => setStatus('ready')}
        onPlaying={() => setStatus('playing')}
        onPause={() => setStatus('paused')}
        onError={() => setStatus('unavailable')}
        onEnded={onEnded}
        style={{ width: '100%', maxHeight: '450px' }}
      />
      {status === 'unavailable' && (
        <p role="alert">Este recurso local no está disponible. La partida puede continuar sin música.</p>
      )}
      {status === 'autoplay-blocked' && (
        <button type="button" onClick={() => mediaRef.current?.play().then(() => setStatus('playing')).catch(() => setStatus('unavailable'))}>
          Reproducir música
        </button>
      )}
    </div>
  );
});

export default LocalMediaPlayer;
