import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SocketProvider } from './SocketContext';
import { useSocket } from './useSocket';
import io from 'socket.io-client';

vi.mock('socket.io-client', () => ({ default: vi.fn() }));
vi.mock('../config/api', () => ({ getBackendUrl: () => 'http://localhost:3000' }));

const makeSocket = () => {
  const listeners = {};
  return {
    listeners,
    connected: true,
    on: vi.fn((event, callback) => { listeners[event] = callback; }),
    off: vi.fn(),
    emit: vi.fn(),
    close: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn()
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SocketContext host reconnection', () => {
  it('sends the host capability only to the server on join and reconnect', async () => {
    const socket = makeSocket();
    const consoleLog = vi.spyOn(console, 'log');
    io.mockReturnValue(socket);

    function HostClient() {
      const { socket: connectedSocket, joinRoom, startGame } = useSocket();
      useEffect(() => {
        if (connectedSocket) joinRoom('ABC123', 'host-player', 'server-secret');
      }, [connectedSocket, joinRoom]);
      return (
        <>
          <button onClick={() => socket.listeners.connect()}>Reconnect</button>
          <button onClick={() => startGame('ABC123')}>Start game</button>
        </>
      );
    }

    render(<SocketProvider><HostClient /></SocketProvider>);
    await waitFor(() => expect(socket.emit).toHaveBeenCalledWith('join-room', {
      roomCode: 'ABC123',
      playerId: 'host-player',
      hostCapability: 'server-secret'
    }));

    fireEvent.click(document.querySelector('button'));
    fireEvent.click(document.querySelectorAll('button')[1]);

    const joins = socket.emit.mock.calls.filter(([event]) => event === 'join-room');
    expect(joins).toHaveLength(2);
    expect(joins[1][1]).toEqual({
      roomCode: 'ABC123',
      playerId: 'host-player',
      hostCapability: 'server-secret'
    });
    expect(socket.emit).toHaveBeenCalledWith('start-game', {
      roomCode: 'ABC123',
      hostCapability: 'server-secret'
    });
    expect(JSON.stringify(consoleLog.mock.calls)).not.toContain('server-secret');
  });

  it('retains and resends a guest capability on reconnect without logging it', async () => {
    const socket = makeSocket();
    const consoleLog = vi.spyOn(console, 'log');
    io.mockReturnValue(socket);
    const playerCapability = 'g'.repeat(43);

    function GuestClient() {
      const { socket: connectedSocket, joinRoom } = useSocket();
      useEffect(() => {
        if (connectedSocket) joinRoom('ABC123', 'guest-player', { playerCapability });
      }, [connectedSocket, joinRoom]);
      return <button onClick={() => socket.listeners.connect()}>Reconnect</button>;
    }

    render(<SocketProvider><GuestClient /></SocketProvider>);
    await waitFor(() => expect(socket.emit).toHaveBeenCalledWith('join-room', {
      roomCode: 'ABC123',
      playerId: 'guest-player',
      playerCapability
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

    const joins = socket.emit.mock.calls.filter(([event]) => event === 'join-room');
    expect(joins).toHaveLength(2);
    expect(joins[1][1]).toEqual({
      roomCode: 'ABC123',
      playerId: 'guest-player',
      playerCapability
    });
    expect(JSON.stringify(consoleLog.mock.calls)).not.toContain(playerCapability);
  });
});
