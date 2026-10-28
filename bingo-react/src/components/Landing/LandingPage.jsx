import { useState } from 'react';
import { Button } from '../../design-system/primitives';
import './LandingPage.css';

const LandingPage = ({ onStartGame }) => {
  const [showAnimation, setShowAnimation] = useState(true);
  const snowflakes = Array.from({ length: 50 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    animationDelay: `${(i * 7) % 10}s`,
    animationDuration: `${10 + ((i * 11) % 20)}s`
  }));
  const stars = Array.from({ length: 20 }, (_, i) => ({
    top: `${(i * 47) % 100}%`,
    left: `${(i * 29) % 100}%`,
    animationDelay: `${(i * 5) % 3}s`
  }));

  const handleStart = () => {
    setShowAnimation(false);
    setTimeout(() => {
      onStartGame();
    }, 300);
  };

  return (
    <div className="landing-page">
      {/* Fondo animado con nieve */}
      <div className="snow-container">
        {snowflakes.map((flake, i) => (
          <div key={i} className="snowflake" style={{
            left: flake.left,
            animationDelay: flake.animationDelay,
            animationDuration: flake.animationDuration
          }}>❄</div>
        ))}
      </div>

      {/* Estrellas doradas */}
      <div className="stars-container">
        {stars.map((star, i) => (
          <div key={i} className="star" style={{
            top: star.top,
            left: star.left,
            animationDelay: star.animationDelay
          }}>✨</div>
        ))}
      </div>

      {/* Contenido principal */}
      <div className={`landing-content ${!showAnimation ? 'fade-out' : ''}`}>

        {/* Logo y título principal */}
        <div className="hero-section">
          <div className="logo-container">
            <div className="logo-circle">
              <span className="logo-icon">🎄</span>
            </div>
          </div>

          <h1 className="main-title">
            <span className="title-line-1">Bingo</span>
            <span className="title-line-2">Navideño</span>
          </h1>

          <p className="subtitle">
            La experiencia de bingo más divertida y festiva
          </p>

          <div className="decorative-line">
            <span className="line-icon">🎅</span>
            <div className="line"></div>
            <span className="line-icon">🎁</span>
            <div className="line"></div>
            <span className="line-icon">⛄</span>
          </div>
        </div>

        {/* Características destacadas */}
        <div className="features-grid">
          <div className="feature-card card-red">
            <div className="feature-icon">🎮</div>
            <h3>Multijugador</h3>
            <p>Juega con amigos y familia en tiempo real</p>
          </div>

          <div className="feature-card card-green">
            <div className="feature-icon">🎵</div>
            <h3>Música Navideña</h3>
            <p>Disfruta de villancicos mientras juegas</p>
          </div>

          <div className="feature-card card-gold">
            <div className="feature-icon">🏆</div>
            <h3>Retos y Premios</h3>
            <p>Completa desafíos y gana recompensas</p>
          </div>

          <div className="feature-card card-blue">
            <div className="feature-icon">📱</div>
            <h3>Multi-dispositivo</h3>
            <p>Juega desde cualquier dispositivo</p>
          </div>
        </div>

        {/* Botón principal */}
        <div className="cta-section">
          <Button className="start-button" onClick={handleStart}>
            <span className="button-icon">🎲</span>
            <span className="button-text">Comenzar a Jugar</span>
            <span className="button-arrow">→</span>
          </Button>

          <p className="helper-text">
            Crea una sala y comparte el código con tus amigos
          </p>
        </div>

        {/* Información adicional */}
        <div className="info-badges">
          <div className="info-badge">
            <span className="badge-icon">👥</span>
            <span className="badge-text">Hasta 50 jugadores</span>
          </div>
          <div className="info-badge">
            <span className="badge-icon">🎯</span>
            <span className="badge-text">200 cartones únicos</span>
          </div>
          <div className="info-badge">
            <span className="badge-icon">⚡</span>
            <span className="badge-text">Tiempo real</span>
          </div>
        </div>

      </div>

      {/* Decoración inferior */}
      <div className="bottom-decoration">
        <div className="tree tree-left">🎄</div>
        <div className="tree tree-right">🎄</div>
      </div>
    </div>
  );
};

export default LandingPage;
