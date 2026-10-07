/**
 * Script para simular 25 jugadores uniéndose a una sala
 * Uso: node simulate-players.js
 */

const API_URL = 'http://localhost:5001';
const NUM_PLAYERS = 25;

async function createRoom() {
  console.log('📝 Creando sala...');
  const response = await fetch(`${API_URL}/api/rooms/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostName: 'Anfitrión Test',
      config: {
        timeBetweenNumbers: 30,
        challengeFrequency: 3,
        maxPlayers: 50,
        gameMode: 'full'
      }
    })
  });

  const data = await response.json();
  console.log(`✅ Sala creada: ${data.room.code}`);
  return data;
}

async function joinPlayer(roomCode, playerName) {
  const response = await fetch(`${API_URL}/api/rooms/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomCode,
      playerName
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error joining: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return data;
}

async function selectCard(roomCode, playerId, cardNumber) {
  const response = await fetch(`${API_URL}/api/rooms/${roomCode}/select-card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId,
      cardNumber
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error selecting card: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return data;
}

async function main() {
  try {
    console.log('🎮 Iniciando simulación de 25 jugadores...\n');

    // 1. Crear sala
    const roomData = await createRoom();
    const roomCode = roomData.room.code;

    console.log(`\n👥 Uniendo ${NUM_PLAYERS} jugadores...\n`);

    // 2. Unir jugadores y seleccionar cartones
    const players = [];

    for (let i = 1; i <= NUM_PLAYERS; i++) {
      const playerName = `Jugador ${i}`;
      const cardNumber = i; // Cada jugador usa un cartón diferente (1-25)

      try {
        // Unir jugador
        const joinData = await joinPlayer(roomCode, playerName);
        const playerId = joinData.player._id;

        // Seleccionar cartón
        await selectCard(roomCode, playerId, cardNumber);

        players.push({ name: playerName, id: playerId, card: cardNumber });
        console.log(`✅ ${playerName} - Cartón #${cardNumber}`);

        // Pequeña pausa para no saturar el servidor
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error con ${playerName}:`, error.message);
      }
    }

    console.log(`\n✅ Simulación completada!`);
    console.log(`📊 Total de jugadores unidos: ${players.length}/${NUM_PLAYERS}`);
    console.log(`🎯 Código de sala: ${roomCode}`);
    console.log(`🔗 URL de TV: http://localhost:5173/?tv=${roomCode}`);
    console.log(`🔗 URL de sala: http://localhost:5173/?room=${roomCode}`);

  } catch (error) {
    console.error('❌ Error en simulación:', error.message);
    process.exit(1);
  }
}

main();
