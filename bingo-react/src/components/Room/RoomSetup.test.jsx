import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => { Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_key, callback) => callback() } }); });

describe('RoomSetup host capability handoff', () => {
  it('explains unsupported new admission and makes no HTTP request without Web Locks', async () => {
    localStorage.clear();
    vi.stubGlobal('navigator', {});
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    render(<RoomSetup onRoomReady={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Unirse a Sala/i }));
    fireEvent.change(screen.getByLabelText('Tu Nombre'), { target: { value: 'Bea' } });
    fireEvent.change(screen.getByLabelText('Código de Sala'), { target: { value: 'ABC123' } });
    fireEvent.submit(screen.getByRole('button', { name: /Unirse a Sala/i }).closest('form'));
    await waitFor(() => expect(screen.getByText(/requiere Web Locks/i)).toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalled();
  });
  it('passes the server-issued host capability to the organizer session', async () => {
    const onRoomReady = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        room: { code: 'ABC123' },
        player: { _id: 'host-player' },
        hostCapability: 'server-secret',
        tvCapability: 'tv-secret'
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
      hostCapability: 'server-secret',
      tvCapability: 'tv-secret'
    }));
  });

  it('passes the server-issued guest capability into the joined player session', async () => {
    const onRoomReady = vi.fn();
    const playerCapability = 'h'.repeat(43);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        room: { code: 'ABC123' },
        player: { _id: 'guest-player' },
        playerCapability
      })
    }));

    render(<RoomSetup onRoomReady={onRoomReady} />);
    fireEvent.click(screen.getByRole('button', { name: /Unirse a Sala/i }));
    fireEvent.change(screen.getByLabelText('Tu Nombre'), { target: { value: 'Bea' } });
    fireEvent.change(screen.getByLabelText('Código de Sala'), { target: { value: 'ABC123' } });
    fireEvent.submit(screen.getByRole('button', { name: /Unirse a Sala/i }).closest('form'));

    await waitFor(() => expect(onRoomReady).toHaveBeenCalled());
    expect(onRoomReady).toHaveBeenCalledWith(expect.objectContaining({
      roomCode: 'ABC123',
      playerId: 'guest-player',
      isHost: false,
      playerCapability
    }));
  });
});
