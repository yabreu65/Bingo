import { useState } from 'react';
import toast from 'react-hot-toast';
import { API_URL } from '../../config/api';
import { Button } from '../../design-system/primitives';
import './QuickJoin.css';

const QuickJoin = ({ roomCode, onJoinComplete }) => {
  const [playerName, setPlayerName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(''); // Para mostrar el paso actual
  const [error, setError] = useState('');

  const handleQuickJoin = async (e) => {
    e.preventDefault();
    setError('');

    const normalizedRoomCode = typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{6}$/.test(normalizedRoomCode)) {
      const errorMsg = 'El código de sala no es válido';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    // Validaciones mejoradas
    if (!playerName.trim()) {
      const errorMsg = 'Por favor ingresa tu nombre';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (playerName.trim().length < 2) {
      const errorMsg = 'El nombre debe tener al menos 2 caracteres';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (!cardNumber || cardNumber.trim() === '') {
      const errorMsg = 'Por favor ingresa un número de cartón';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (!/^\d+$/.test(cardNumber.trim())) {
      const errorMsg = 'El número de cartón debe estar entre 1 y 200';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    const cardNum = Number(cardNumber);

    if (isNaN(cardNum) || cardNum < 1 || cardNum > 200) {
      const errorMsg = 'El número de cartón debe estar entre 1 y 200';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setLoading(true);
    setLoadingStep('Uniéndose a la sala...');

    try {
      // Paso 1: Unirse a la sala
      const joinResponse = await fetch(`${API_URL}/api/rooms/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomCode: normalizedRoomCode,
          playerName: playerName.trim(),
        }),
      });

      const joinData = await joinResponse.json();

      if (!joinResponse.ok) {
        // Manejar error que puede ser string u objeto
        const errorMsg = typeof joinData.error === 'object'
          ? joinData.error.message || 'Error al unirse a la sala'
          : joinData.error || 'Error al unirse a la sala';
        setError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        setLoadingStep('');
        return;
      }
      if (typeof joinData.playerCapability !== 'string' || joinData.playerCapability.length !== 43) {
        setError('No se pudo establecer una sesión segura. Intenta unirte de nuevo.');
        setLoading(false);
        setLoadingStep('');
        return;
      }

      // Paso 2: Seleccionar cartón
      setLoadingStep('Seleccionando cartón...');
      const cardResponse = await fetch(`${API_URL}/api/rooms/${normalizedRoomCode}/select-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-player-capability': joinData.playerCapability
        },
        body: JSON.stringify({
          playerId: joinData.player._id,
          cardNumber: cardNum,
        }),
      });

      const cardData = await cardResponse.json();

      if (!cardResponse.ok) {
        // Manejar error que puede ser string u objeto
        const errorMsg = typeof cardData.error === 'object'
          ? cardData.error.message || 'Error al seleccionar el cartón'
          : cardData.error || 'Error al seleccionar el cartón';
        setError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        setLoadingStep('');
        return;
      }

      // Éxito: notificar al componente padre
      setLoadingStep('¡Listo! Ingresando al juego...');
      // NO usar toast aquí para evitar error insertBefore durante la transición

      // Delay para dispositivos lentos y requestAnimationFrame para transición suave
      setTimeout(() => {
        requestAnimationFrame(() => {
          onJoinComplete({
            roomCode: joinData.room.code,
            playerId: joinData.player._id,
            playerName: playerName.trim(),
            isHost: false,
            playerCapability: joinData.playerCapability,
            room: joinData.room,
            cardNumber: cardNum,
            bingoCard: cardData.bingoCard
          });
        });
      }, 300);

    } catch (err) {
      console.error('Error in quick join:', err);
      const errorMsg = 'Error de conexión. Asegúrate de que el servidor esté corriendo.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="quick-join-container">
      <div className="quick-join-card">
        <div className="quick-join-header">
          <h1 className="christmas-title">🎄 Bingo Navideño 🎅</h1>
          <p className="quick-join-subtitle">Únete rápidamente a la sala</p>
        </div>

        <div className="room-code-display">
          <span className="room-label">Sala:</span>
          <span className="room-code-value">{roomCode}</span>
        </div>

        <form onSubmit={handleQuickJoin} className="quick-join-form">
          <div className="form-group">
            <label htmlFor="playerName">Tu Nombre</label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Ej: María García"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="cardNumber">Número de Cartón (1-200)</label>
            <input
              type="number"
              id="cardNumber"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="Ej: 42"
              min="1"
              max="200"
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <Button type="submit" className="join-button" disabled={loading}>
            {loading ? (
              <>
                <div className="spinner-small"></div>
                {loadingStep || 'Procesando...'}
              </>
            ) : (
              <>
                <span className="button-icon">🎮</span>
                Unirse al Juego
              </>
            )}
          </Button>
        </form>

        <div className="quick-join-footer">
          <p>✨ Ingresa tu nombre y número de cartón para empezar ✨</p>
        </div>
      </div>
    </div>
  );
};

export default QuickJoin;
