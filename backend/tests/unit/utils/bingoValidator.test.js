const {
  getPatternCells,
  validateBingoClaim
} = require('../../../socket/utils/bingoValidator');
const { getCard } = require('../../../utils/bingoCards');

const card = getCard(1);
const allNumbers = card.flat().filter((value) => value !== 'BINGO');

describe('authoritative bingo validation', () => {
  test.each([
    ['line', getPatternCells('line')[0]],
    ['fourCorners', getPatternCells('fourCorners')[0]],
    ['centralCross', getPatternCells('centralCross')[0]],
    ['full', getPatternCells('full')[0]]
  ])('accepts a valid %s pattern from called numbers', (bingoType, pattern) => {
    const markedCells = pattern;
    const calledNumbers = markedCells
      .map(([row, col]) => card[col][row])
      .filter((value) => value !== 'BINGO');

    const result = validateBingoClaim({
      matrix: card,
      markedCells,
      calledNumbers,
      bingoType
    });

    expect(result.isValid).toBe(true);
  });

  test('rejects a pattern containing an uncalled number', () => {
    const pattern = getPatternCells('line')[0];
    const calledNumbers = pattern
      .slice(0, 4)
      .map(([row, col]) => card[col][row])
      .filter((value) => value !== 'BINGO');

    const result = validateBingoClaim({
      matrix: card,
      markedCells: pattern,
      calledNumbers,
      bingoType: 'line'
    });

    expect(result.isValid).toBe(false);
  });

  test('rejects duplicate coordinates', () => {
    const result = validateBingoClaim({
      matrix: card,
      markedCells: [[0, 0], [0, 0]],
      calledNumbers: allNumbers,
      bingoType: 'line'
    });

    expect(result.isValid).toBe(false);
  });

  test('rejects out-of-range coordinates', () => {
    const result = validateBingoClaim({
      matrix: card,
      markedCells: [[0, 0], [5, 0]],
      calledNumbers: allNumbers,
      bingoType: 'line'
    });

    expect(result.isValid).toBe(false);
  });
});
