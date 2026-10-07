import { useState } from 'react';
import ReactPlayer from 'react-player';

const SimpleTest = () => {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  const handleStart = () => {
    setPlaying(true);
    setMuted(false);
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      background: playing ? 'green' : 'red',
      color: 'white',
      padding: '20px',
      borderRadius: '10px',
      zIndex: 9999
    }}>
      <h3>🎵 Test del Reproductor</h3>
      <p>Estado: {playing ? '▶️ Reproduciendo' : '⏸️ Pausado'}</p>

      <button
        onClick={handleStart}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          marginBottom: '10px'
        }}
      >
        🎵 ACTIVAR MÚSICA
      </button>

      <ReactPlayer
        url="https://www.youtube.com/watch?v=yXQViqx6GMY"
        playing={playing}
        muted={muted}
        volume={0.8}
        width="300px"
        height="200px"
        controls={true}
      />
    </div>
  );
};

export default SimpleTest;
