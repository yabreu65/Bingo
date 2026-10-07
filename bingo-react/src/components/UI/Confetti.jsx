import { useEffect, useState } from 'react';
import './Confetti.css';

const Confetti = ({ trigger, onComplete }) => {
  const [pieces, setPieces] = useState([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (trigger) {
      setShow(true);

      // Generar piezas de confeti
      const confettiPieces = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        animationDuration: Math.random() * 3 + 2,
        animationDelay: Math.random() * 0.5,
        color: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#fd79a8'][Math.floor(Math.random() * 6)],
        rotation: Math.random() * 360
      }));

      setPieces(confettiPieces);

      // Ocultar después de 5 segundos
      setTimeout(() => {
        setShow(false);
        if (onComplete) onComplete();
      }, 5000);
    }
  }, [trigger, onComplete]);

  if (!show) return null;

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
