import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuickJoin from './QuickJoin';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('QuickJoin', () => {
  it('shows validation errors before making network requests', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<QuickJoin roomCode="ABC123" onJoinComplete={vi.fn()} />);

    fireEvent.submit(screen.getByRole('button', { name: /unirse al juego/i }).closest('form'));

    expect(screen.getByText('Por favor ingresa tu nombre')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects card numbers outside the supported range', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<QuickJoin roomCode="ABC123" onJoinComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Tu Nombre'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/número de cartón/i), { target: { value: '201' } });
    fireEvent.submit(screen.getByRole('button', { name: /unirse al juego/i }).closest('form'));

    expect(screen.getByText('El número de cartón debe estar entre 1 y 200')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('joins the room and selects the requested card', async () => {
    const onJoinComplete = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          player: { _id: 'player-1' },
          room: { code: 'ABC123' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bingoCard: { matrix: [], markedCells: [] } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (callback) => callback());

    render(<QuickJoin roomCode="abc123" onJoinComplete={onJoinComplete} />);
    fireEvent.change(screen.getByLabelText('Tu Nombre'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/número de cartón/i), { target: { value: '42' } });
    fireEvent.submit(screen.getByRole('button', { name: /unirse al juego/i }).closest('form'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(fetchMock.mock.calls[0][0]).toContain('/api/rooms/join');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      roomCode: 'ABC123',
      playerName: 'Ana',
    });
    expect(fetchMock.mock.calls[1][0]).toContain('/api/rooms/abc123/select-card');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      playerId: 'player-1',
      cardNumber: 42,
    });
  });
});
