import { useEffect, useState } from 'react';
import './Snowflakes.css';

const Snowflakes = () => {
  const [snowflakes, setSnowflakes] = useState([]);

  useEffect(() => {
    // Generar 50 copos de nieve con propiedades aleatorias
    const flakes = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      animationDuration: Math.random() * 3 + 2,
      animationDelay: Math.random() * 5,
      fontSize: Math.random() * 10 + 10,
      opacity: Math.random() * 0.6 + 0.4
    }));

    setSnowflakes(flakes);
  }, []);

  return (
    <div className="snowflakes-container">
      {snowflakes.map(flake => (
        <div
          key={flake.id}
          className="snowflake"
          style={{
            left: `${flake.left}%`,
            animationDuration: `${flake.animationDuration}s`,
            animationDelay: `${flake.animationDelay}s`,
            fontSize: `${flake.fontSize}px`,
            opacity: flake.opacity
          }}
        >
          ❄
        </div>
      ))}
    </div>
  );
};

export default Snowflakes;
