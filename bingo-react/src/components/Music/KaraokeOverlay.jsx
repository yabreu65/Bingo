export default function KaraokeOverlay({ localFile, onVideoEnd }) {
  if (!localFile) return null;

  const videoPath = `/music/karaoke/${localFile}`;

  const handleVideoEnd = () => {
    if (onVideoEnd) {
      onVideoEnd();
    }
  };

  return (
    <div style={{ marginTop: '20px', maxWidth: '800px', margin: '20px auto' }}>
      <video
        src={videoPath}
        controls
        autoPlay
        style={{ width: '100%', maxHeight: '450px', borderRadius: '8px' }}
        onEnded={handleVideoEnd}
      />
    </div>
  );
}
