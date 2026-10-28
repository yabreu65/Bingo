import { useCallback, useEffect, useRef } from 'react';

export default function KaraokeOverlay({ localFile, maxDuration = 60, onVideoEnd, onUnavailable }) {
  const completionSentRef = useRef(false);
  const videoRef = useRef(null);

  const videoPath = `/music/karaoke/${localFile}`;

  const handleVideoEnd = useCallback(() => {
    if (completionSentRef.current) return;
    completionSentRef.current = true;
    onVideoEnd?.();
  }, [onVideoEnd]);

  useEffect(() => {
    if (!localFile) return undefined;
    completionSentRef.current = false;
    const timer = window.setTimeout(handleVideoEnd, Math.max(1, Number(maxDuration) || 60) * 1000);
    return () => window.clearTimeout(timer);
  }, [localFile, maxDuration, handleVideoEnd]);

  if (!localFile) return null;

  return (
    <div style={{ marginTop: '20px', maxWidth: '800px', margin: '20px auto' }}>
      <video
        ref={videoRef}
        src={videoPath}
        controls
        autoPlay
        style={{ width: '100%', maxHeight: '450px', borderRadius: '8px' }}
        onEnded={handleVideoEnd}
        onError={() => {
          onUnavailable?.('El video local no está disponible. El reto continuará sin video.');
          handleVideoEnd();
        }}
      />
    </div>
  );
}
