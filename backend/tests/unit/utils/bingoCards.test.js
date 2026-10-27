const {
  CARD_MATRIX_VERSION,
  FREE_CELL,
  BINGO_CARDS,
  getCard,
  getCardCell
} = require('../../../utils/bingoCards');

describe('canonical bingo cards', () => {
  test('provides 200 deterministic cards with valid column ranges and a free center', () => {
    expect(Object.keys(BINGO_CARDS)).toHaveLength(200);

    const serialized = new Set();
    for (let cardNumber = 1; cardNumber <= 200; cardNumber += 1) {
      const card = getCard(cardNumber);
      expect(card).toHaveLength(5);
      expect(card.every((column) => Array.isArray(column) && column.length === 5)).toBe(true);
      expect(card[2][2]).toBe(FREE_CELL);
      expect(serialized.has(JSON.stringify(card))).toBe(false);
      serialized.add(JSON.stringify(card));

      card.forEach((column, columnIndex) => {
        const min = columnIndex * 15 + 1;
        const max = min + 14;
        const numericValues = column.filter((value) => value !== FREE_CELL);
        expect(new Set(numericValues).size).toBe(numericValues.length);
        expect(numericValues.every((value) => value >= min && value <= max)).toBe(true);
      });
    }
  });

  test('reads the persisted matrix using visual row and column coordinates', () => {
    const card = getCard(1);
    expect(CARD_MATRIX_VERSION).toBe('v1-column-major');
    expect(getCardCell(card, 0, 0)).toBe(1);
    expect(getCardCell(card, 0, 1)).toBe(22);
    expect(getCardCell(card, 2, 2)).toBe(FREE_CELL);
    expect(getCardCell(card, 4, 4)).toBe(72);
  });
});
