import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import WaitingRoom from './WaitingRoom';

const mocks = vi.hoisted(() => ({
  joinRoom: vi.fn(),
  startGame: vi.fn(),
  onPlayerJoined: vi.fn(() => () => {}),
  onGameStarted: vi.fn(() => () => {}),
  markCell: vi.fn(),
  onCellMarked: vi.fn(() => () => {}),
  onNumberCalled: vi.fn(() => () => {}),
  onCountdownTick: vi.fn(() => () => {})
}));

vi.mock('../../context/useSocket', () => ({
  useSocket: () => ({ ...mocks })
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('../Music/SyncedMusicPlayer', () => ({ default: () => null }));
vi.mock('../BingoCard/BingoCard', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('legacy WaitingRoom socket credentials', () => {
  it('passes the host capability to its socket room join', async () => {
    render(
      <WaitingRoom
        roomData={{
          roomCode: 'ROOMA1',
          playerId: 'host-a',
          hostCapability: 'host-secret',
          isHost: true,
          room: { name: 'Room A', config: {}, players: [] }
        }}
        onGameStart={vi.fn()}
      />
    );

    await waitFor(() => expect(mocks.joinRoom).toHaveBeenCalledWith(
      'ROOMA1', 'host-a', { hostCapability: 'host-secret' }
    ));
  });

  it('passes the guest capability to its socket room join', async () => {
    render(
      <WaitingRoom
        roomData={{
          roomCode: 'ROOMA1',
          playerId: 'player-a',
          playerCapability: 'g'.repeat(43),
          isHost: false,
          room: { name: 'Room A', config: {}, players: [] }
        }}
        onGameStart={vi.fn()}
      />
    );

    await waitFor(() => expect(mocks.joinRoom).toHaveBeenCalledWith(
      'ROOMA1', 'player-a', { playerCapability: 'g'.repeat(43) }
    ));
  });
});
