/**
 * Generador de Cartones de Bingo
 * Crea cartones determinísticos con distribución B-I-N-G-O.
 * El contrato online histórico serializa matrix[columna][fila]; las vistas
 * utilizan getCardCell para leer siempre con coordenadas visuales row/col.
 * Los cartones son DETERMINÍSTICOS - el mismo número siempre genera el mismo cartón
 */

/**
 * Generador de números pseudo-aleatorios con semilla (Mulberry32)
 * Esto garantiza que la misma semilla siempre produzca la misma secuencia
 * @param {number} seed - Semilla para generar números
 * @returns {Function} Función que retorna números aleatorios entre 0 y 1
 */
function seededRandom(seed) {
  return function() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Genera un array de números únicos dentro de un rango usando una semilla
 * @param {number} min - Número mínimo
 * @param {number} max - Número máximo
 * @param {number} count - Cantidad de números a generar
 * @param {Function} rng - Función generadora de números aleatorios
 * @returns {number[]} Array de números únicos
 */
export const CARD_MATRIX_VERSION = 'v1-column-major';
export const ROW_MAJOR_MATRIX_VERSION = 'v2-row-major';
export const FREE_CELL = 'BINGO';

function generateColumn(min, max, rng) {
  const column = [];
  while (column.length < 5) {
    const number = Math.floor(rng() * (max - min + 1)) + min;
    if (!column.includes(number)) column.push(number);
  }
  return column.sort((a, b) => a - b);
}

export function getCardCell(matrix, row, col, matrixVersion = ROW_MAJOR_MATRIX_VERSION) {
  if (!Array.isArray(matrix) || !Number.isInteger(row) || !Number.isInteger(col)) {
    return undefined;
  }
  return matrixVersion === CARD_MATRIX_VERSION ? matrix[col]?.[row] : matrix[row]?.[col];
}

/**
 * Genera un cartón de bingo determinístico basado en el número de cartón
 * @param {number} cardNumber - Número del cartón (1-200). El mismo número siempre genera el mismo cartón
 * @returns {Object} Cartón de bingo con matriz column-major compatible con backend
 */
export function generateBingoCard(cardNumber = 1) {
  // Crear generador pseudo-aleatorio con semilla basada en el número de cartón
  const rng = seededRandom(cardNumber);

  const matrix = [
    generateColumn(1, 15, rng),
    generateColumn(16, 30, rng),
    generateColumn(31, 45, rng),
    generateColumn(46, 60, rng),
    generateColumn(61, 75, rng)
  ];

  matrix[2][2] = FREE_CELL;

  return {
    matrix,
    matrixVersion: CARD_MATRIX_VERSION,
    markedCells: [[2, 2]] // Centro ya está marcado (BINGO)
  };
}

/**
 * Marca un número en el cartón si existe
 * @param {Array} matrix - Matriz del cartón
 * @param {Array} markedCells - Celdas ya marcadas
 * @param {number} number - Número cantado
 * @returns {Object} Nueva información de celdas marcadas
 */
export function markNumber(matrix, markedCells, number) {
  const newMarked = [...markedCells];

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (getCardCell(matrix, row, col, CARD_MATRIX_VERSION) === number) {
        // Verificar si no está ya marcada
        const alreadyMarked = newMarked.some(
          ([r, c]) => r === row && c === col
        );

        if (!alreadyMarked) {
          newMarked.push([row, col]);
        }
      }
    }
  }

  return newMarked;
}

/**
 * Verifica si hay una línea completa (horizontal, vertical o diagonal)
 * @param {Array} markedCells - Celdas marcadas
 * @returns {boolean} True si hay al menos una línea completa
 */
export function checkLines(markedCells) {
  const marked = new Set(markedCells.map(([r, c]) => `${r},${c}`));

  // Verificar líneas horizontales
  for (let row = 0; row < 5; row++) {
    let complete = true;
    for (let col = 0; col < 5; col++) {
      if (!marked.has(`${row},${col}`)) {
        complete = false;
        break;
      }
    }
    if (complete) return true;
  }

  // Verificar líneas verticales
  for (let col = 0; col < 5; col++) {
    let complete = true;
    for (let row = 0; row < 5; row++) {
      if (!marked.has(`${row},${col}`)) {
        complete = false;
        break;
      }
    }
    if (complete) return true;
  }

  // Verificar diagonal principal (\)
  let diag1Complete = true;
  for (let i = 0; i < 5; i++) {
    if (!marked.has(`${i},${i}`)) {
      diag1Complete = false;
      break;
    }
  }
  if (diag1Complete) return true;

  // Verificar diagonal secundaria (/)
  let diag2Complete = true;
  for (let i = 0; i < 5; i++) {
    if (!marked.has(`${i},${4 - i}`)) {
      diag2Complete = false;
      break;
    }
  }
  if (diag2Complete) return true;

  return false;
}

/**
 * Verifica si se completaron las 4 esquinas
 * @param {Array} markedCells - Celdas marcadas
 * @returns {boolean} True si las 4 esquinas están marcadas
 */
export function checkFourCorners(markedCells) {
  const marked = new Set(markedCells.map(([r, c]) => `${r},${c}`));
  const corners = ['0,0', '0,4', '4,0', '4,4'];

  return corners.every(corner => marked.has(corner));
}

/**
 * Verifica si se completó el cartón completo (BINGO)
 * @param {Array} markedCells - Celdas marcadas
 * @returns {boolean} True si todas las 25 celdas están marcadas
 */
export function checkFullCard(markedCells) {
  const marked = new Set(markedCells.map(([row, col]) => `${row},${col}`));
  return marked.size === 25;
}

/**
 * Verifica si se completó la cruz central
 * @param {Array} markedCells - Celdas marcadas
 * @returns {boolean} True si la cruz está completa
 */
export function checkCentralCross(markedCells) {
  const marked = new Set(markedCells.map(([r, c]) => `${r},${c}`));

  // Línea horizontal del centro
  for (let col = 0; col < 5; col++) {
    if (!marked.has(`2,${col}`)) return false;
  }

  // Línea vertical del centro
  for (let row = 0; row < 5; row++) {
    if (!marked.has(`${row},2`)) return false;
  }

  return true;
}

/**
 * Cuenta cuántas líneas completas tiene el cartón
 * @param {Array} markedCells - Celdas marcadas
 * @returns {number} Número de líneas completas
 */
export function countCompletedLines(markedCells) {
  const marked = new Set(markedCells.map(([r, c]) => `${r},${c}`));
  let count = 0;

  // Contar líneas horizontales
  for (let row = 0; row < 5; row++) {
    let complete = true;
    for (let col = 0; col < 5; col++) {
      if (!marked.has(`${row},${col}`)) {
        complete = false;
        break;
      }
    }
    if (complete) count++;
  }

  // Contar líneas verticales
  for (let col = 0; col < 5; col++) {
    let complete = true;
    for (let row = 0; row < 5; row++) {
      if (!marked.has(`${row},${col}`)) {
        complete = false;
        break;
      }
    }
    if (complete) count++;
  }

  // Contar diagonal principal
  let diag1Complete = true;
  for (let i = 0; i < 5; i++) {
    if (!marked.has(`${i},${i}`)) {
      diag1Complete = false;
      break;
    }
  }
  if (diag1Complete) count++;

  // Contar diagonal secundaria
  let diag2Complete = true;
  for (let i = 0; i < 5; i++) {
    if (!marked.has(`${i},${4 - i}`)) {
      diag2Complete = false;
      break;
    }
  }
  if (diag2Complete) count++;

  return count;
}

/**
 * Verifica si hay BINGO basado en el modo de juego y números cantados
 * @param {Array} matrix - Matriz del cartón 5x5
 * @param {Array} calledNumbers - Números que han sido cantados
 * @param {string} gameMode - Modo: 'line', 'fourCorners', 'centralCross', 'full'
 * @returns {Object} {hasBingo: boolean, pattern: string, markedCells: Array}
 */
export function checkBingoWithCalledNumbers(
  matrix,
  calledNumbers,
  gameMode = 'full',
  matrixVersion = CARD_MATRIX_VERSION
) {
  // Crear set de números cantados para búsqueda rápida
  const calledSet = new Set(calledNumbers);

  // Marcar todas las celdas que coinciden con números cantados
  const markedCells = [[2, 2]]; // Centro siempre marcado (BINGO)

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const value = getCardCell(matrix, row, col, matrixVersion);
      if (value !== FREE_CELL && calledSet.has(value)) {
        markedCells.push([row, col]);
      }
    }
  }

  // Verificar según modo de juego
  let hasBingo = false;
  let pattern = null;

  switch (gameMode) {
    case 'line':
      if (checkLines(markedCells)) {
        hasBingo = true;
        pattern = 'Línea completa';
      }
      break;

    case 'fourCorners':
      if (checkFourCorners(markedCells)) {
        hasBingo = true;
        pattern = '4 Esquinas';
      }
      break;

    case 'centralCross':
      if (checkCentralCross(markedCells)) {
        hasBingo = true;
        pattern = 'Cruz Central';
      }
      break;

    case 'full':
    default:
      if (checkFullCard(markedCells)) {
        hasBingo = true;
        pattern = 'Cartón completo';
      }
      break;
  }

  return { hasBingo, pattern, markedCells };
}
