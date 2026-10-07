// Generador de 200 cartones de bingo únicos y predefinidos
// Los cartones son DETERMINÍSTICOS - el mismo número siempre genera el mismo cartón

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
 * Genera un cartón de bingo determinístico basado en el número de cartón
 * @param {number} cardNumber - Número del cartón (1-200). El mismo número siempre genera el mismo cartón
 * @returns {Array} Cartón de bingo en formato de columnas
 */
function generateBingoCard(cardNumber) {
  // Crear generador pseudo-aleatorio con semilla basada en el número de cartón
  const rng = seededRandom(cardNumber);

  const card = [];

  // B (1-15), I (16-30), N (31-45), G (46-60), O (61-75)
  const columns = [
    { min: 1, max: 15 },
    { min: 16, max: 30 },
    { min: 31, max: 45 },
    { min: 46, max: 60 },
    { min: 61, max: 75 }
  ];

  for (let col = 0; col < 5; col++) {
    const columnNumbers = [];
    const { min, max } = columns[col];

    while (columnNumbers.length < 5) {
      const num = Math.floor(rng() * (max - min + 1)) + min;
      if (!columnNumbers.includes(num)) {
        columnNumbers.push(num);
      }
    }

    // Ordenar los números de cada columna de menor a mayor
    columnNumbers.sort((a, b) => a - b);
    card.push(columnNumbers);
  }

  // Center space is BINGO
  card[2][2] = 'BINGO';

  return card;
}

// Generate 200 unique cards
function generate200Cards() {
  const cards = {};

  for (let i = 1; i <= 200; i++) {
    cards[i] = generateBingoCard(i); // Pasar el número como semilla
  }

  return cards;
}

// Pre-generate all 200 cards
const BINGO_CARDS = generate200Cards();

// Get a specific card by number
function getCard(cardNumber) {
  if (cardNumber < 1 || cardNumber > 200) {
    return null;
  }
  return BINGO_CARDS[cardNumber];
}

module.exports = {
  getCard,
  BINGO_CARDS
};
