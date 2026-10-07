# 🌟 SISTEMA DE VOTACIÓN - GUÍA COMPLETA

Sistema de votación con estrellas (1-5) para challenges + Rankings especiales al final del juego.

---

## ✅ **LO QUE YA ESTÁ IMPLEMENTADO**

### **Backend (100% Completo):**
- ✅ **Modelo Vote** (`backend/models/Vote.js`)
- ✅ **Modelo Game actualizado** con campos de votación
- ✅ **Servicio de votación** (`backend/services/votingService.js`)
- ✅ **Handlers Socket.io** (`backend/socket/handlers/votingHandlers.js`)
- ✅ **Integrado en socketHandlers.js**

### **Frontend (100% Completo):**
- ✅ **VotingModal** (`bingo-react/src/components/Voting/VotingModal.jsx`)
- ✅ **VotingResults** (`bingo-react/src/components/Voting/VotingResults.jsx`)
- ✅ **SpecialRankings** (`bingo-react/src/components/Voting/SpecialRankings.jsx`)
- ✅ **Todos los estilos CSS** (VotingModal.css, VotingResults.css, SpecialRankings.css)

---

## 🎯 **CÓMO FUNCIONA**

### **Flujo Completo:**

```
1. Jugador completa un challenge (karaoke, baile, canto, grupo)
        ↓
2. Backend emite evento "startVoting"
        ↓
3. Todos los jugadores ven VotingModal (excepto el performer)
        ↓
4. Jugadores votan con estrellas (1-5) en 15 segundos
        ↓
5. Backend calcula promedio y puntos bonus
        ↓
6. Se muestra VotingResults a todos con:
   - Promedio de estrellas
   - Distribución de votos
   - Puntos bonus otorgados
        ↓
7. El juego continúa
        ↓
8. Al final del juego: SpecialRankings muestra:
   - Mejor Cantante (karaoke)
   - Mejor Bailarín
   - Mejor Vocalista (sing)
   - Más Divertido (5.0 estrellas)
   - Mejor Grupal
   - Top 3 actuaciones
```

---

## 🔧 **INTEGRACIÓN EN TU APLICACIÓN**

### **Paso 1: Importar componentes**

En tu componente principal del juego (donde manejas challenges):

```javascript
import VotingModal from './components/Voting/VotingModal';
import VotingResults from './components/Voting/VotingResults';
import SpecialRankings from './components/Voting/SpecialRankings';
```

### **Paso 2: Agregar estados**

```javascript
const [votingData, setVotingData] = useState(null);
const [votingResults, setVotingResults] = useState(null);
const [showRankings, setShowRankings] = useState(false);
const [specialRankings, setSpecialRankings] = useState(null);
```

### **Paso 3: Escuchar eventos Socket.io**

Agrega estos listeners en tu `useEffect` donde manejas Socket.io:

```javascript
useEffect(() => {
  if (!socket) return;

  // Cuando empieza una votación
  socket.on('votingStarted', (data) => {
    setVotingData(data);
  });

  // Confirmación de voto
  socket.on('voteConfirmed', (data) => {
    console.log('✅ Voto confirmado:', data);
  });

  // Update de votación en progreso
  socket.on('votingUpdate', (data) => {
    console.log('📊 Votos recibidos:', data.votesReceived, '/', data.totalVoters);
  });

  // Resultados de la votación
  socket.on('votingResults', (results) => {
    setVotingData(null); // Cerrar modal de votación
    setVotingResults(results); // Mostrar resultados
  });

  return () => {
    socket.off('votingStarted');
    socket.off('voteConfirmed');
    socket.off('votingUpdate');
    socket.off('votingResults');
  };
}, [socket]);
```

### **Paso 4: Función para iniciar votación**

Después de que un challenge se completa:

```javascript
const handleChallengeCompleted = (challengeData) => {
  // Tu lógica actual...

  // Iniciar votación (solo para challenges que no sean trivia)
  if (['karaoke', 'dance', 'sing', 'group'].includes(challengeData.type)) {
    socket.emit('startVoting', {
      roomCode: roomCode,
      challengeType: challengeData.type,
      challengeText: challengeData.text,
      performerId: challengeData.player.id,
      performerName: challengeData.player.name
    });
  }
};
```

### **Paso 5: Función para votar**

```javascript
const handleVote = (stars) => {
  socket.emit('castVote', {
    voteId: votingData.voteId,
    voterId: myPlayerId,
    voterName: myPlayerName,
    stars: stars
  });
};
```

### **Paso 6: Función para cerrar resultados**

```javascript
const handleContinueAfterVoting = () => {
  setVotingResults(null);
  // Continuar con el juego...
};
```

### **Paso 7: Función para obtener rankings finales**

Cuando termina el juego:

```javascript
const handleGameEnd = () => {
  // Obtener rankings especiales
  socket.emit('getSpecialRankings', { roomCode });

  // Escuchar respuesta
  socket.on('specialRankings', (rankings) => {
    setSpecialRankings(rankings);
    setShowRankings(true);
  });
};
```

### **Paso 8: Renderizar componentes**

En tu JSX:

```jsx
{/* Modal de Votación */}
{votingData && (
  <VotingModal
    isOpen={true}
    performerName={votingData.performerName}
    challengeType={votingData.challengeType}
    challengeText={votingData.challengeText}
    onVote={handleVote}
    votingDuration={votingData.votingDuration}
    myPlayerId={myPlayerId}
    performerId={votingData.performerId}
  />
)}

{/* Resultados de Votación */}
{votingResults && (
  <VotingResults
    performerName={votingResults.performerName}
    challengeType={votingResults.challengeType}
    averageStars={votingResults.averageStars}
    totalVotes={votingResults.totalVotes}
    bonusPoints={votingResults.bonusPoints}
    distribution={votingResults.distribution}
    onContinue={handleContinueAfterVoting}
  />
)}

{/* Rankings Especiales */}
{showRankings && specialRankings && (
  <SpecialRankings
    rankings={specialRankings}
    winner={gameWinner}
    onClose={() => setShowRankings(false)}
  />
)}
```

---

## 🎮 **EVENTOS SOCKET.IO DISPONIBLES**

### **Cliente → Servidor:**

```javascript
// Iniciar votación
socket.emit('startVoting', {
  roomCode: string,
  challengeType: 'karaoke'|'dance'|'sing'|'group',
  challengeText: string,
  performerId: string,
  performerName: string
});

// Emitir voto
socket.emit('castVote', {
  voteId: string,
  voterId: string,
  voterName: string,
  stars: 1-5
});

// Finalizar votación manualmente
socket.emit('endVoting', {
  roomCode: string,
  voteId: string
});

// Obtener rankings especiales
socket.emit('getSpecialRankings', {
  roomCode: string
});

// Obtener todas las votaciones del juego
socket.emit('getGameVotings', {
  roomCode: string
});
```

### **Servidor → Cliente:**

```javascript
// Votación iniciada
socket.on('votingStarted', {
  voteId: string,
  challengeType: string,
  performerId: string,
  performerName: string,
  challengeText: string,
  totalVoters: number,
  votingDuration: 15 // segundos
});

// Voto confirmado
socket.on('voteConfirmed', {
  voteId: string,
  stars: number
});

// Update de votación en progreso
socket.on('votingUpdate', {
  voteId: string,
  votesReceived: number,
  totalVoters: number,
  currentAverage: number
});

// Resultados finales
socket.on('votingResults', {
  voteId: string,
  performerId: string,
  performerName: string,
  challengeType: string,
  totalVotes: number,
  averageStars: number, // 1.0 - 5.0
  bonusPoints: number,  // 10 - 50
  distribution: {
    one: number,
    two: number,
    three: number,
    four: number,
    five: number
  }
});

// Rankings especiales
socket.on('specialRankings', {
  bestKaraoke: Performance,
  bestDance: Performance,
  bestSing: Performance,
  bestGroup: Performance,
  funniest: Performance,
  top3: [Performance],
  totalVotings: number
});
```

---

## 💾 **BASE DE DATOS**

### **Modelo Vote:**

```javascript
{
  gameId: ObjectId,
  roomCode: String,
  challengeType: String,
  challengeText: String,
  performerId: ObjectId,
  performerName: String,
  votes: [{
    voterId: ObjectId,
    voterName: String,
    stars: Number (1-5),
    votedAt: Date
  }],
  totalVotes: Number,
  averageStars: Number,
  bonusPoints: Number,
  distribution: {
    one: Number,
    two: Number,
    three: Number,
    four: Number,
    five: Number
  },
  isComplete: Boolean,
  completedAt: Date
}
```

---

## 📊 **CÁLCULO DE PUNTOS BONUS**

```javascript
Fórmula: Math.round(averageStars * 10)

Ejemplos:
- 5.0 estrellas → 50 puntos
- 4.5 estrellas → 45 puntos
- 4.2 estrellas → 42 puntos
- 3.8 estrellas → 38 puntos
- 3.0 estrellas → 30 puntos
- 2.5 estrellas → 25 puntos
- 1.0 estrella  → 10 puntos
```

---

## 🎨 **PERSONALIZACIÓN**

### **Cambiar duración de votación:**

En `votingHandlers.js`:
```javascript
votingDuration: 15 // Cambiar a 10, 20, etc.
```

### **Cambiar fórmula de puntos:**

En `votingService.js`, método `calculateStats()`:
```javascript
const bonus = Math.round(average * 10); // Modificar aquí
// Ejemplos:
// const bonus = Math.round(average * 20); // Doble puntos
// const bonus = average >= 4 ? 100 : 50; // 100 pts si es 4+
```

### **Permitir votar a sí mismo:**

En `Vote.js`, método `addVote()`:
```javascript
// Comentar estas líneas:
// if (voterId.toString() === this.performerId.toString()) {
//   throw new Error('No puedes votarte a ti mismo');
// }
```

---

## 🐛 **TROUBLESHOOTING**

### **"Votación no aparece"**
- Verifica que el evento `startVoting` se emita después del challenge
- Asegúrate que el `challengeType` sea: karaoke, dance, sing o group (NO trivia)

### **"No puedo votar"**
- Verifica que `myPlayerId` sea diferente a `performerId`
- Asegúrate que no hayas votado ya
- Verifica que el timer no haya expirado

### **"Resultados no se muestran"**
- Asegúrate de escuchar el evento `votingResults`
- Verifica que al menos 1 persona haya votado

### **"Rankings vacíos"**
- Necesitas al menos 1 votación completada en el juego
- Verifica que llamaste `getSpecialRankings` después de que termine el juego

---

## 🚀 **PARA PROBAR EL SISTEMA**

1. **Iniciar backend:**
```bash
cd backend
npm start
```

2. **Iniciar frontend:**
```bash
cd bingo-react
npm run dev
```

3. **Jugar una partida:**
- Crear sala
- Agregar al menos 3 jugadores
- Jugar hasta que aparezca un challenge
- Votar la actuación
- Ver resultados
- Al final del juego, ver Rankings Especiales

---

## 📝 **EJEMPLO COMPLETO DE INTEGRACIÓN**

Ver archivo: `EJEMPLO_INTEGRACION_VOTACION.jsx` (próximo paso a crear)

---

## ✨ **CARACTERÍSTICAS IMPLEMENTADAS**

- ✅ Votación anónima (nadie ve quién votó qué)
- ✅ Timer de 15 segundos para votar
- ✅ Verificación de voto único por jugador
- ✅ El performer no puede votarse a sí mismo
- ✅ Update en tiempo real de votos recibidos
- ✅ Cálculo automático de promedio y distribución
- ✅ Puntos bonus otorgados al performer
- ✅ Rankings especiales por categoría
- ✅ Top 3 mejores actuaciones
- ✅ Detección de "Más Divertido" (5.0 estrellas)
- ✅ Animaciones y estilos profesionales
- ✅ Responsive (móvil y desktop)

---

**¡Sistema de Votación Completo!** 🎉

Desarrollado para Bingo Bailable por Claude Code
