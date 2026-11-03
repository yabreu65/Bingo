import { useEffect, useRef, useState } from 'react';

// Reproduce el MP3 del reto durante la ventana solicitada. El backend controla
// la finalización oficial; este reproductor jamás reanuda el sorteo por su cuenta.
export default function ChallengeAudioPlayer({ src, startSeconds = 20, duration = 30 }) {
  const playerRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const start = Math.max(0, Math.min(180, Number(startSeconds) || 0));
  const seconds = Math.max(10, Math.min(120, Number(duration) || 30));

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !src) return undefined;
    let active = true;
    const handleMetadata = () => {
      if (!active) return;
      player.currentTime = Math.min(start, Math.max(0, player.duration - 0.25));
      Promise.resolve().then(() => player.play()).then(() => {
        if (active) setStatus('playing');
      }).catch(() => {
        if (active) setStatus('autoplay-blocked');
      });
    };
    player.addEventListener('loadedmetadata', handleMetadata);
    if (player.readyState >= 1) handleMetadata();
    return () => {
      active = false;
      player.removeEventListener('loadedmetadata', handleMetadata);
      player.pause();
    };
  }, [src, start]);

  const handleTimeUpdate = () => {
    if (!playerRef.current) return;
    if (playerRef.current.currentTime >= start + seconds) {
      playerRef.current.pause();
      setStatus('ended');
    }
  };

  return (
    <div className="challenge-music-player" data-testid="challenge-local-audio">
      <p>🎵 Música del reto</p>
      <audio
        ref={playerRef}
        src={src}
        controls
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onError={() => setStatus('unavailable')}
      />
      {status === 'autoplay-blocked' && <p>El navegador bloqueó el inicio automático. Presiona ▶ en el reproductor.</p>}
      {status === 'unavailable' && <p role="alert">El MP3 del reto no está disponible.</p>}
    </div>
  );
}
