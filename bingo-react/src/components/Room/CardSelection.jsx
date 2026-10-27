import { useState } from 'react';
import toast from 'react-hot-toast';
import { API_URL } from '../../config/api';
import './CardSelection.css';

const CardSelection = ({ roomData, onCardSelected }) => {
  const [selectedCard, setSelectedCard] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelectCard = async (e) => {
    e.preventDefault();
    setError('');

    // Validaciones mejoradas
    if (!selectedCard || selectedCard.trim() === '') {
      const errorMsg = 'Por favor ingresa un número de cartón';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (!/^\d+$/.test(selectedCard.trim())) {
      const errorMsg = 'Debes ingresar un número válido';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    const cardNumber = Number(selectedCard);

    if (cardNumber < 1 || cardNumber > 200) {
      const errorMsg = 'El número de cartón debe estar entre 1 y 200';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/rooms/${roomData.roomCode}/select-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-player-capability': roomData.playerCapability
        },
        body: JSON.stringify({
          playerId: roomData.playerId,
          cardNumber: cardNumber,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Card assigned successfully
        // NO usar toast aquí para evitar error insertBefore durante la transición de componente
        const player = roomData.room?.players?.find(p => p._id === roomData.playerId);

        // Delay para dispositivos lentos y requestAnimationFrame para transición suave
        setTimeout(() => {
          requestAnimationFrame(() => {
            onCardSelected({
              ...roomData,
              playerName: player?.name || roomData.playerName,
              cardNumber: cardNumber,
              bingoCard: data.bingoCard
            });
          });
        }, 300);
      } else {
        // Manejar error que puede ser string u objeto
        const errorMsg = typeof data.error === 'object'
          ? data.error.message || 'Error al seleccionar el cartón'
          : data.error || 'Error al seleccionar el cartón';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Error selecting card:', err);
      const errorMsg = 'Error de conexión. Intenta de nuevo.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-selection">
      <div className="card-selection-container">
        <div className="christmas-header">
          <h1>🎄 Selecciona tu Cartón 🎅</h1>
          <p className="subtitle">Elige un número del 1 al 200</p>
        </div>

        <div className="room-info-badge">
          <span>Sala: {roomData.room?.name || 'Cargando...'}</span>
          <span>Código: {roomData.roomCode}</span>
        </div>

        <form onSubmit={handleSelectCard} className="card-selection-form">
          <div className="card-number-input-wrapper">
            <label htmlFor="cardNumber">Número de Cartón</label>
            <input
              type="number"
              id="cardNumber"
              value={selectedCard}
              onChange={(e) => setSelectedCard(e.target.value)}
              placeholder="Ej: 42"
              min="1"
              max="200"
              required
              autoFocus
              className="card-number-input"
            />
            <small>Ingresa un número del 1 al 200</small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="select-card-btn"
            disabled={loading}
          >
            {loading ? 'Verificando...' : '🎲 Seleccionar Cartón'}
          </button>
        </form>

        <div className="card-info-box">
          <h3>📌 Importante:</h3>
          <ul>
            <li>Cada cartón tiene números únicos</li>
            <li>Si el cartón ya está en uso, deberás elegir otro</li>
            <li>Recuerda tu número de cartón para futuras partidas</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CardSelection;
