import { describe, expect, it } from 'vitest';
import {
  CARD_MATRIX_VERSION,
  FREE_CELL,
  generateBingoCard,
  getCardCell
} from './bingoCardGenerator';

describe('canonical bingo cards', () => {
  it('matches the backend deterministic card contract for card 1', () => {
    const card = generateBingoCard(1);

    expect(card.matrixVersion).toBe(CARD_MATRIX_VERSION);
    expect(card.matrix).toEqual([
      [1, 5, 8, 10, 15],
      [22, 23, 25, 26, 30],
      [32, 33, FREE_CELL, 37, 38],
      [46, 48, 50, 51, 57],
      [64, 65, 67, 69, 72]
    ]);
    expect(getCardCell(card.matrix, 0, 1, card.matrixVersion)).toBe(22);
    expect(getCardCell(card.matrix, 2, 2, card.matrixVersion)).toBe(FREE_CELL);
  });

  it('produces 200 structurally valid unique cards', () => {
    const cards = Array.from({ length: 200 }, (_, index) => generateBingoCard(index + 1));
    expect(new Set(cards.map((card) => JSON.stringify(card.matrix))).size).toBe(200);
    cards.forEach(({ matrix }) => {
      expect(matrix).toHaveLength(5);
      matrix.forEach((column) => expect(column).toHaveLength(5));
      expect(matrix[2][2]).toBe(FREE_CELL);
    });
  });
});
