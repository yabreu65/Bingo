/**
 * Utilidad para exportar resultados del juego
 */

/**
 * Genera un resumen completo del juego
 * @param {Object} gameData - Datos del juego
 * @returns {string} Texto formateado con los resultados
 */
export function generateGameSummary(gameData) {
  const {
    players,
    duration,
    totalNumbers,
    totalSongs,
    winners
  } = gameData;

  let summary = '🎄 ===== BINGO BAILABLE NAVIDEÑO ===== 🎅\n\n';
  summary += '🏆 RESULTADOS FINALES\n';
  summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  // Ganador principal
  if (winners && winners.length > 0) {
    summary += `👑 GANADOR: ${winners[0].name}\n\n`;
  }

  // Estadísticas de jugadores
  summary += '👥 JUGADORES Y ESTADÍSTICAS\n';
  summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

  players.forEach((player, index) => {
    summary += `${index + 1}. ${player.name}\n`;
    summary += `   ✅ Aciertos trivia: ${player.stats.triviaCorrect}/${player.stats.triviaAttempted}\n`;
    summary += `   🎯 Retos completados: ${player.stats.challengesCompleted}\n`;
    summary += `   📊 Líneas: ${player.stats.linesCompleted}\n`;
    summary += `   🎴 Números marcados: ${player.stats.numbersMarked}/25\n\n`;
  });

  // Estadísticas del juego
  summary += '📊 ESTADÍSTICAS DEL JUEGO\n';
  summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  summary += `⏱️  Duración: ${duration}\n`;
  summary += `🔢 Números cantados: ${totalNumbers}/75\n`;
  summary += `🎵 Canciones tocadas: ${totalSongs}\n`;
  summary += `👥 Jugadores: ${players.length}\n\n`;

  summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  summary += '🎉 ¡Gracias por jugar! 🎄\n';
  summary += 'Generado con Bingo Bailable Navideño\n';

  return summary;
}

/**
 * Copia el resumen al portapapeles
 * @param {string} summary - Texto del resumen
 * @returns {Promise<boolean>} True si se copió exitosamente
 */
export async function copyToClipboard(summary) {
  try {
    await navigator.clipboard.writeText(summary);
    return true;
  } catch (error) {
    console.error('Error al copiar al portapapeles:', error);
    return false;
  }
}

/**
 * Descarga el resumen como archivo de texto
 * @param {string} summary - Texto del resumen
 * @param {string} filename - Nombre del archivo
 */
export function downloadSummary(summary, filename = 'bingo-resultados.txt') {
  const blob = new Blob([summary], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formatea la duración del juego
 * @param {number} milliseconds - Duración en milisegundos
 * @returns {string} Duración formateada
 */
export function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}
