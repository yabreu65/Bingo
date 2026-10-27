import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSocket } from '../../context/useSocket';
import { API_URL } from '../../config/api';
import './RoomSetup.css';

const RoomSetup = ({ onRoomReady }) => {
  const { connected } = useSocket();
  const [mode, setMode] = useState(null); // 'create' or 'join'
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError('');

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

    if (!roomName.trim()) {
      const errorMsg = 'Por favor ingresa el nombre de la sala';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (roomName.trim().length < 3) {
      const errorMsg = 'El nombre de la sala debe tener al menos 3 caracteres';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/rooms/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomName: roomName.trim(),
          hostName: playerName.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('¡Sala creada exitosamente!', { icon: '🎉' });
        onRoomReady({
          roomCode: data.room.code,
          playerId: data.player._id,
          playerName: playerName.trim(),
          isHost: true,
          hostCapability: data.hostCapability,
          room: data.room
        });
      } else {
        // Manejar error que puede ser string u objeto
        const errorMsg = typeof data.error === 'object'
          ? data.error.message || 'Error al crear la sala'
          : data.error || 'Error al crear la sala';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Error creating room:', err);
      const errorMsg = 'Error de conexión. Asegúrate de que el servidor esté corriendo.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    setError('');

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

    if (!roomCode.trim()) {
      const errorMsg = 'Por favor ingresa el código de sala';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (roomCode.trim().length !== 6) {
      const errorMsg = 'El código de sala debe tener exactamente 6 caracteres';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/rooms/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomCode: roomCode.trim().toUpperCase(),
          playerName: playerName.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('¡Te has unido a la sala exitosamente!', { icon: '🎉' });
        onRoomReady({
          roomCode: data.room.code,
          playerId: data.player._id,
          playerName: playerName.trim(),
          isHost: false,
          room: data.room
        });
      } else {
        // Manejar error que puede ser string u objeto
        const errorMsg = typeof data.error === 'object'
          ? data.error.message || 'Error al unirse a la sala'
          : data.error || 'Error al unirse a la sala';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Error joining room:', err);
      const errorMsg = 'Error de conexión. Asegúrate de que el servidor esté corriendo.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="room-setup">
        <div className="connection-status">
          <div className="loading-spinner"></div>
          <p>Conectando al servidor...</p>
          <p className="connection-hint">Asegúrate de que el backend esté corriendo en {API_URL}</p>
        </div>
      </div>
    );
  }

  if (!mode) {
    return (
      <div className="room-setup">
        <div className="room-setup-container">
          <div className="christmas-header">
            <h1>🎄 Bingo Navideño 🎅</h1>
            <p>Modo Multijugador</p>
          </div>

          <div className="mode-selection">
            <button
              className="mode-btn create-btn"
              onClick={() => setMode('create')}
            >
              <div className="mode-icon">🎮</div>
              <h3>Crear Sala</h3>
              <p>Inicia una nueva partida como anfitrión</p>
            </button>

            <button
              className="mode-btn join-btn"
              onClick={() => setMode('join')}
            >
              <div className="mode-icon">🚪</div>
              <h3>Unirse a Sala</h3>
              <p>Únete a una partida existente</p>
            </button>
          </div>

          <div className="connection-indicator">
            <span className="status-dot connected"></span>
            Conectado al servidor
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="room-setup">
      <div className="room-setup-container">
        <button
          className="back-btn"
          onClick={() => {
            setMode(null);
            setError('');
          }}
        >
          ← Volver
        </button>

        <div className="christmas-header">
          <h1>🎄 {mode === 'create' ? 'Crear Sala' : 'Unirse a Sala'} 🎅</h1>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreateRoom} className="room-form">
            <div className="form-group">
              <label htmlFor="playerName">Tu Nombre</label>
              <input
                type="text"
                id="playerName"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Ingresa tu nombre"
                maxLength={20}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="roomName">Nombre de la Sala</label>
              <input
                type="text"
                id="roomName"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Ej: Bingo Familiar 2025"
                maxLength={30}
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              {loading ? 'Creando...' : '🎮 Crear Sala'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoinRoom} className="room-form">
            <div className="form-group">
              <label htmlFor="playerName">Tu Nombre</label>
              <input
                type="text"
                id="playerName"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Ingresa tu nombre"
                maxLength={20}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="roomCode">Código de Sala</label>
              <input
                type="text"
                id="roomCode"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Ej: ABC123"
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold' }}
                required
              />
              <small>Solicita el código al anfitrión de la sala</small>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              {loading ? 'Uniéndose...' : '🚪 Unirse a Sala'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default RoomSetup;
