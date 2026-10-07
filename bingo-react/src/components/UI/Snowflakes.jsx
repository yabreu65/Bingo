import './Snowflakes.css';

const Snowflakes = () => {
  const snowflakes = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: (i * 37) % 100,
    animationDuration: 2 + ((i * 11) % 3),
    animationDelay: (i * 7) % 5,
    fontSize: 10 + ((i * 13) % 10),
    opacity: 0.4 + ((i * 17) % 6) / 10
  }));

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
