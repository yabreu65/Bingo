import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RoomSetup from './RoomSetup';

vi.mock('../../context/useSocket', () => ({
  useSocket: () => ({ connected: true })
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RoomSetup host capability handoff', () => {
  it('passes the server-issued host capability to the organizer session', async () => {
    const onRoomReady = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        room: { code: 'ABC123' },
        player: { _id: 'host-player' },
        hostCapability: 'server-secret'
      })
    }));

    render(<RoomSetup onRoomReady={onRoomReady} />);
    fireEvent.click(screen.getByRole('button', { name: /Crear Sala/i }));
    fireEvent.change(screen.getByLabelText('Tu Nombre'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Nombre de la Sala'), { target: { value: 'Sala familiar' } });
    fireEvent.submit(screen.getByRole('button', { name: /Crear Sala/i }).closest('form'));

    await waitFor(() => expect(onRoomReady).toHaveBeenCalled());
    expect(onRoomReady).toHaveBeenCalledWith(expect.objectContaining({
      roomCode: 'ABC123',
      playerId: 'host-player',
      isHost: true,
      hostCapability: 'server-secret'
    }));
  });
});
