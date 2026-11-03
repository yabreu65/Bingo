import { useCallback, useEffect, useRef, useState } from 'react';
import { attemptMediaPlayback } from '../../utils/localTvDiagnostics';

export default function KaraokeOverlay({ localFile, videoUrl, maxDuration = 60, onVideoEnd, onUnavailable, onPlaybackStatus }) {
  const completionSentRef = useRef(false);
  const videoRef = useRef(null);
  const [playbackStatus, setPlaybackStatus] = useState('loading');

  const videoPath = videoUrl || `/music/karaoke/${encodeURIComponent(localFile)}`;

  const handleVideoEnd = useCallback(() => {
    if (completionSentRef.current) return;
    completionSentRef.current = true;
    onVideoEnd?.();
  }, [onVideoEnd]);

  const attemptPlayback = useCallback(async () => {
    const result = await attemptMediaPlayback(videoRef.current);
    setPlaybackStatus(result);
    onPlaybackStatus?.(result);
    return result;
  }, [onPlaybackStatus]);

  useEffect(() => {
    if (!localFile) return undefined;
    completionSentRef.current = false;
    const timer = window.setTimeout(handleVideoEnd, Math.max(1, Number(maxDuration) || 60) * 1000);
    return () => window.clearTimeout(timer);
  }, [localFile, maxDuration, handleVideoEnd]);

  if (!localFile) return null;

  return (
    <div className="pf-karaoke-overlay" style={{ marginTop: '20px', maxWidth: '800px', margin: '20px auto' }}>
      <video
        ref={videoRef}
        src={videoPath}
        controls
        autoPlay
        style={{ width: '100%', maxHeight: '450px', borderRadius: '8px' }}
        onLoadStart={() => setPlaybackStatus('loading')}
        onCanPlay={attemptPlayback}
        onPlaying={() => {
          setPlaybackStatus('playing');
          onPlaybackStatus?.('playing');
        }}
        onEnded={handleVideoEnd}
        onError={() => {
          setPlaybackStatus('unavailable');
          onPlaybackStatus?.('unavailable');
          onUnavailable?.('El video local no está disponible. El reto continuará sin video.');
          handleVideoEnd();
        }}
      />
      <p className="local-media-status" data-testid="karaoke-media-status" role="status">
        {playbackStatus === 'autoplay-blocked' && 'Reproducción automática bloqueada.'}
        {playbackStatus === 'unavailable' && 'El video local no está disponible.'}
      </p>
      {playbackStatus === 'autoplay-blocked' && (
        <button type="button" onClick={attemptPlayback}>
          Reproducir karaoke
        </button>
      )}
    </div>
  );
}
