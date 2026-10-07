import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BingoCard from './BingoCard';

const card = {
  matrix: [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 'BINGO', 14, 15],
    [16, 17, 18, 19, 20],
    [21, 22, 23, 24, 25],
  ],
  markedCells: [[0, 0], { row: 1, col: 1 }],
};

describe('BingoCard', () => {
  it('renders the bingo header, free cell, and existing marks', () => {
    render(<BingoCard card={card} />);

    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('BINGO')).toBeInTheDocument();
    expect(document.querySelectorAll('.bingo-cell.marked')).toHaveLength(2);
    expect(document.querySelectorAll('.bingo-cell')).toHaveLength(25);
  });

  it('marks a clicked number only when the card is interactive', () => {
    const onCellClick = vi.fn();
    render(<BingoCard card={card} interactive onCellClick={onCellClick} />);

    fireEvent.click(screen.getByText('15'));
    expect(onCellClick).toHaveBeenCalledWith(2, 4, 15);

    fireEvent.click(screen.getByText('BINGO'));
    expect(onCellClick).toHaveBeenCalledTimes(1);
  });
});
