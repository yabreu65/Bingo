import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';

it('muestra la portada sin copos de nieve y conserva sus elementos principales', () => {
  const { container } = render(<LandingPage onStartGame={vi.fn()} />);

  expect(container.querySelector('.snow-container')).toBeNull();
  expect(container.querySelector('.snowflakes-container')).toBeNull();
  expect(container.querySelector('.snowflake')).toBeNull();
  expect(screen.getByText('Bingo')).toBeInTheDocument();
  expect(screen.getByText('Navideño')).toBeInTheDocument();
  expect(container.querySelector('.stars-container')).toBeTruthy();
});
