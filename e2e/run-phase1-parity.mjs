import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requireBackend = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const {
  CARD_MATRIX_VERSION,
  FREE_CELL,
  getCard,
  getCardCell: getBackendCardCell
} = requireBackend(resolve(repositoryRoot, 'backend/utils/bingoCards.js'));
const {
  getPatternCells,
  validateBingoClaim
} = requireBackend(resolve(repositoryRoot, 'backend/socket/utils/bingoValidator.js'));
const {
  CARD_MATRIX_VERSION: FRONTEND_MATRIX_VERSION,
  FREE_CELL: FRONTEND_FREE_CELL,
  checkBingoWithCalledNumbers,
  generateBingoCard,
  getCardCell: getFrontendCardCell
} = await import(resolve(repositoryRoot, 'bingo-react/src/utils/bingoCardGenerator.js'));

assert.equal(CARD_MATRIX_VERSION, 'v1-column-major');
assert.equal(FRONTEND_MATRIX_VERSION, CARD_MATRIX_VERSION);
assert.equal(FREE_CELL, FRONTEND_FREE_CELL);

const modes = ['line', 'fourCorners', 'centralCross', 'full'];

function nonFreeValues(matrix, cells) {
  return cells
    .map(([row, col]) => getBackendCardCell(matrix, row, col))
    .filter((value) => value !== FREE_CELL);
}

function withoutLastValue(values) {
  return values.slice(0, -1);
}

for (let cardNumber = 1; cardNumber <= 200; cardNumber += 1) {
  const backendMatrix = getCard(cardNumber);
  const frontendCard = generateBingoCard(cardNumber);

  assert.deepEqual(
    frontendCard.matrix,
    backendMatrix,
    `card ${cardNumber} must have the same matrix in backend and frontend`
  );
  assert.equal(frontendCard.matrixVersion, CARD_MATRIX_VERSION);
  assert.deepEqual(frontendCard.markedCells, [[2, 2]]);

  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      assert.equal(
        getFrontendCardCell(frontendCard.matrix, row, col, CARD_MATRIX_VERSION),
        getBackendCardCell(backendMatrix, row, col),
        `card ${cardNumber} coordinate ${row},${col} must use the same orientation`
      );
    }
  }
}

for (const mode of modes) {
  const backendMatrix = getCard(1);
  const frontendMatrix = generateBingoCard(1).matrix;
  const winningCells = getPatternCells(mode)[0];
  const calledNumbers = nonFreeValues(backendMatrix, winningCells);
  const incompleteCalledNumbers = withoutLastValue(calledNumbers);

  const frontendWinning = checkBingoWithCalledNumbers(
    frontendMatrix,
    calledNumbers,
    mode,
    CARD_MATRIX_VERSION
  );
  const backendWinning = validateBingoClaim({
    matrix: backendMatrix,
    markedCells: winningCells,
    calledNumbers,
    bingoType: mode
  });
  assert.equal(frontendWinning.hasBingo, true, `${mode} must win with its pattern`);
  assert.equal(backendWinning.isValid, true, `${mode} backend validation must accept its pattern`);
  assert.equal(backendWinning.pattern, mode);

  const frontendIncomplete = checkBingoWithCalledNumbers(
    frontendMatrix,
    incompleteCalledNumbers,
    mode,
    CARD_MATRIX_VERSION
  );
  const backendIncomplete = validateBingoClaim({
    matrix: backendMatrix,
    markedCells: winningCells,
    calledNumbers: incompleteCalledNumbers,
    bingoType: mode
  });
  assert.equal(frontendIncomplete.hasBingo, false, `${mode} must reject an incomplete pattern`);
  assert.equal(backendIncomplete.isValid, false, `${mode} backend validation must reject an incomplete pattern`);
}

console.log('PHASE 1 PARITY PASS: 200 cards, shared coordinates, and 4 modes');
