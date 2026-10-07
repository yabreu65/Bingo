# 🧪 CÓMO PROBAR LA GRABACIÓN SIN JUGAR TODA UNA PARTIDA

## Opción 1: Modificar Temporalmente el Código (Más Rápido)

Para que **TODOS** los challenges muestren el botón de grabación:

### Archivo: `/bingo-react/src/components/Recording/RecordingChallenge.jsx`

**Encuentra esta línea (al final del archivo, línea ~233):**
```javascript
// Solo mostrar para karaoke y dance
if (challengeType !== 'karaoke' && challengeType !== 'dance') {
  return null;
}
```

**Cámbiala temporalmente a:**
```javascript
// TEMPORAL: Mostrar para todos los challenges (para pruebas)
// if (challengeType !== 'karaoke' && challengeType !== 'dance') {
//   return null;
// }
```

Ahora el botón aparecerá en **TODOS** los challenges, incluso trivia.

**⚠️ IMPORTANTE:** Recuerda descomentar las líneas cuando termines de probar.

---

## Opción 2: Forzar un Challenge de Karaoke (Recomendado)

### Modificar temporalmente el selector de challenges:

**Archivo:** `/backend/socket/utils/challengeSelector.js`

**Al inicio de la función `selectRandomChallenge`, agrega:**
```javascript
// TEMPORAL: Siempre retornar karaoke para pruebas
return {
  type: CHALLENGE_TYPES.KARAOKE,
  data: {
    karaokeId: 'karaoke-001'  // Vivir Mi Vida
  }
};
```

Así **TODOS** los challenges serán karaoke.

---

## Opción 3: Usar la Consola del Navegador (Avanzado)

1. Abre el juego en el navegador
2. Presiona **F12** para abrir DevTools
3. Ve a la pestaña **Console**
4. Pega este código:

```javascript
// Simular un challenge de karaoke
const fakeChallenge = {
  type: 'karaoke',
  player: {
    id: 'test123',
    name: 'Jugador Prueba'
  },
  data: {
    karaokeId: 'karaoke-001'
  }
};

// Esto depende de cómo esté estructurado tu GameContext
// Tendrías que acceder al setActiveChallenge
```

---

## Opción 4: Crear Página de Prueba (La Mejor)

Voy a crear un componente de prueba solo para ti:

**Archivo:** `/bingo-react/src/pages/TestRecording.jsx`

```jsx
import { useState } from 'react';
import RecordingChallenge from '../components/Recording/RecordingChallenge';
import './TestRecording.css';

const TestRecording = () => {
  const [recordingCompleted, setRecordingCompleted] = useState(false);
  const [lastRecording, setLastRecording] = useState(null);

  const handleRecordingComplete = (recording) => {
    console.log('✅ Grabación completada:', recording);
    setRecordingCompleted(true);
    setLastRecording(recording);
  };

  const handleRecordingError = (error) => {
    console.error('❌ Error en grabación:', error);
    alert('Error: ' + error.message);
  };

  return (
    <div className="test-recording-page">
      <h1>🎥 Prueba de Grabación</h1>

      <div className="test-info">
        <p>Esta es una página de prueba para el sistema de grabación.</p>
        <p>Aquí puedes probar la cámara sin jugar una partida completa.</p>
      </div>

      {recordingCompleted && (
        <div className="success-message">
          ✅ ¡Grabación exitosa!
          <br />
          ID: {lastRecording?._id}
          <br />
          Tamaño: {(lastRecording?.fileSize / 1024 / 1024).toFixed(2)} MB
        </div>
      )}

      <RecordingChallenge
        gameId="test-game-123"
        roomCode="TEST"
        playerId="test-player-123"
        playerName="Jugador de Prueba"
        challengeType="karaoke"
        challengeText="Vivir Mi Vida - Marc Anthony"
        onRecordingComplete={handleRecordingComplete}
        onRecordingError={handleRecordingError}
      />

      <div className="test-buttons">
        <button onClick={() => window.location.href = '/'}>
          Volver al Inicio
        </button>

        {lastRecording && (
          <a
            href={`http://localhost:5000/api/recordings/${lastRecording._id}/stream`}
            target="_blank"
            rel="noreferrer"
          >
            <button>Ver Video Grabado</button>
          </a>
        )}
      </div>
    </div>
  );
};

export default TestRecording;
```

**Archivo:** `/bingo-react/src/pages/TestRecording.css`

```css
.test-recording-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
  color: white;
}

.test-recording-page h1 {
  text-align: center;
  font-size: 3em;
  margin-bottom: 30px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.test-info {
  background: rgba(255, 255, 255, 0.1);
  padding: 20px;
  border-radius: 15px;
  max-width: 800px;
  margin: 0 auto 30px;
  text-align: center;
  font-size: 1.2em;
}

.success-message {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  padding: 20px;
  border-radius: 15px;
  max-width: 800px;
  margin: 0 auto 30px;
  text-align: center;
  font-size: 1.3em;
  font-weight: bold;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}

.test-buttons {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-top: 30px;
}

.test-buttons button {
  padding: 15px 40px;
  font-size: 1.2em;
  font-weight: bold;
  border: none;
  border-radius: 50px;
  cursor: pointer;
  background: white;
  color: #667eea;
  transition: all 0.3s ease;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.test-buttons button:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
}
```

**Luego agrega la ruta en tu router:**

En `/bingo-react/src/App.jsx` (o donde tengas las rutas):

```jsx
import TestRecording from './pages/TestRecording';

// Dentro de tus rutas:
<Route path="/test-recording" element={<TestRecording />} />
```

**Accede a:** `http://localhost:5173/test-recording`

---

## 🎯 Resumen:

Para ver el botón "Grabar Actuación":

1. **Normal:** Juega hasta que salga un challenge de karaoke o baile
2. **Rápido:** Usa la página de prueba `/test-recording` (te la acabo de crear arriba)
3. **Forzado:** Modifica temporalmente el código para que siempre salga karaoke

---

¿Quieres que te ayude a crear la página de prueba `/test-recording` para que puedas probar la grabación inmediatamente sin jugar?
