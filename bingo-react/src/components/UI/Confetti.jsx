import { useEffect, useMemo } from 'react';
import './Confetti.css';

const Confetti = ({ trigger, onComplete }) => {
  const pieces = useMemo(() => Array.from({ length: 100 }, (_, i) => ({
    id: i,
    left: (i * 37) % 100,
    animationDuration: 2 + ((i * 11) % 3),
    animationDelay: ((i * 7) % 5) / 10,
    color: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#fd79a8'][i % 6],
    rotation: (i * 29) % 360
  })), []);

  useEffect(() => {
    if (!trigger) return undefined;

    const timer = setTimeout(() => onComplete?.(), 5000);
    return () => clearTimeout(timer);
  }, [trigger, onComplete]);

  if (!trigger) return null;

  return (
    <div className="confetti-container">
      {pieces.map(piece => (
        <div
          key={piece.id}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            animationDuration: `${piece.animationDuration}s`,
            animationDelay: `${piece.animationDelay}s`,
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotation}deg)`
          }}
        />
      ))}
    </div>
  );
};

export default Confetti;
