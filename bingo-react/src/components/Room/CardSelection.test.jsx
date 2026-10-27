import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CardSelection from './CardSelection';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CardSelection guest capability handoff', () => {
  it('authenticates selection and preserves the capability in the player session', async () => {
    const playerCapability = 'k'.repeat(43);
    const onCardSelected = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bingoCard: { matrix: [[1]], markedCells: [] } })
    }));
    vi.stubGlobal('requestAnimationFrame', (callback) => callback());

    render(<CardSelection
      roomData={{
        roomCode: 'ABC123',
        playerId: 'guest-player',
        playerName: 'Bea',
        playerCapability,
        room: { players: [{ _id: 'guest-player', name: 'Bea' }] }
      }}
      onCardSelected={onCardSelected}
    />);
    fireEvent.change(screen.getByLabelText('Número de Cartón'), { target: { value: '42' } });
    fireEvent.submit(screen.getByRole('button', { name: /Seleccionar Cartón/i }).closest('form'));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][1].headers).toEqual(expect.objectContaining({
      'x-player-capability': playerCapability
    }));
    await waitFor(() => expect(onCardSelected).toHaveBeenCalledWith(expect.objectContaining({
      playerCapability,
      cardNumber: 42
    })));
  });
});
