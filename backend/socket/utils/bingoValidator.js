const { CARD_SIZE, FREE_CELL, getCardCell } = require('../../utils/bingoCards');

function normalizeMarked(markedCells) {
  if (!Array.isArray(markedCells)) return [];
  return markedCells
    .map((cell) => {
      if (Array.isArray(cell)) return [cell[0], cell[1]];
      return [cell?.row, cell?.col];
    })
    .filter(([row, col]) => Number.isInteger(row) && Number.isInteger(col));
}

function markedSet(markedCells) {
  return new Set(normalizeMarked(markedCells).map(([row, col]) => `${row},${col}`));
}

function hasCells(marked, cells) {
  return cells.every(([row, col]) => marked.has(`${row},${col}`));
}

function linePatterns() {
  const rows = Array.from({ length: CARD_SIZE }, (_, row) =>
    Array.from({ length: CARD_SIZE }, (_, col) => [row, col])
  );
  const columns = Array.from({ length: CARD_SIZE }, (_, col) =>
    Array.from({ length: CARD_SIZE }, (_, row) => [row, col])
  );
  const diagonals = [
    Array.from({ length: CARD_SIZE }, (_, index) => [index, index]),
    Array.from({ length: CARD_SIZE }, (_, index) => [index, CARD_SIZE - 1 - index])
  ];
  return [...rows, ...columns, ...diagonals];
}

function getPatternCells(bingoType) {
  switch (bingoType) {
    case 'line':
      return linePatterns();
    case 'fourCorners':
      return [[[0, 0], [0, 4], [4, 0], [4, 4]]];
    case 'centralCross':
      return [[
        [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
        [0, 2], [1, 2], [3, 2], [4, 2]
      ]];
    case 'full':
      return [Array.from({ length: CARD_SIZE }, (_, row) =>
        Array.from({ length: CARD_SIZE }, (_, col) => [row, col])
      ).flat()];
    default:
      return [];
  }
}

function isValidCoordinate(row, col) {
  return Number.isInteger(row) && row >= 0 && row < CARD_SIZE &&
    Number.isInteger(col) && col >= 0 && col < CARD_SIZE;
}

function getCalledMarkedCells(matrix, calledNumbers) {
  if (!Array.isArray(matrix) || matrix.length !== CARD_SIZE || !Array.isArray(calledNumbers)) {
    return [];
  }
  const called = new Set(calledNumbers);
  const marked = [[2, 2]];
  for (let row = 0; row < CARD_SIZE; row += 1) {
    for (let col = 0; col < CARD_SIZE; col += 1) {
      const value = getCardCell(matrix, row, col);
      if (value !== FREE_CELL && called.has(value)) marked.push([row, col]);
    }
  }
  return marked;
}

function validateBingoClaim({ matrix, markedCells, calledNumbers, bingoType }) {
  const normalized = normalizeMarked(markedCells);
  const marked = markedSet(normalized);
  const validCoordinates = normalized.every(([row, col]) => isValidCoordinate(row, col));
  const hasDuplicateCoordinates = marked.size !== normalized.length;
  const cardHasExpectedShape = Array.isArray(matrix) && matrix.length === CARD_SIZE &&
    matrix.every((column) => Array.isArray(column) && column.length === CARD_SIZE);

  if (!validCoordinates || hasDuplicateCoordinates || !cardHasExpectedShape) {
    return { isValid: false, markedCells: normalized, pattern: null };
  }

  const called = new Set(Array.isArray(calledNumbers) ? calledNumbers : []);
  const markedValuesAreCalled = normalized.every(([row, col]) => {
    const value = getCardCell(matrix, row, col);
    return value === FREE_CELL || called.has(value);
  });
  if (!markedValuesAreCalled) {
    return { isValid: false, markedCells: normalized, pattern: null };
  }

  const patterns = getPatternCells(bingoType);
  const matchedPattern = patterns.find((pattern) => hasCells(marked, pattern));
  return {
    isValid: Boolean(matchedPattern),
    markedCells: normalized,
    pattern: matchedPattern ? bingoType : null
  };
}

function isFullCard(markedCells) {
  const normalized = normalizeMarked(markedCells);
  const set = new Set(normalized.map(([row, col]) => `${row},${col}`));
  return normalized.length === CARD_SIZE * CARD_SIZE &&
    set.size === CARD_SIZE * CARD_SIZE &&
    normalized.every(([row, col]) => isValidCoordinate(row, col));
}

module.exports = {
  getPatternCells,
  getCalledMarkedCells,
  isFullCard,
  normalizeMarked,
  validateBingoClaim
};
