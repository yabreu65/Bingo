import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

afterEach(() => {
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

it('la TV informa el fallo de React sin mostrar enlaces ni tokens de autorización', () => {
  window.history.replaceState({}, '', '/tv/ABC123');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const leakedToken = 'z'.repeat(43);
  const Fail = () => {
    throw new TypeError('Video crashed at https://bingo.example/tv/ABC123?tvToken=' + leakedToken);
  };
  render(<ErrorBoundary><Fail /></ErrorBoundary>);
  expect(screen.getByText('¡Ups! Algo salió mal')).toBeInTheDocument();
  const detail = screen.getByTestId('tv-error-diagnostic');
  expect(detail).toHaveTextContent('TypeError');
  expect(detail).not.toHaveTextContent(leakedToken);
  expect(detail).not.toHaveTextContent('https://bingo.example');
});
