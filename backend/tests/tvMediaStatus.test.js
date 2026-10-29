const { handleTvMediaStatus } = require('../socket/handlers/roomHandlers');

describe('TV media status security', () => {
  test('broadcasts only sanitized status from an authorized TV', () => {
    const emit = jest.fn();
    const io = { to: jest.fn(() => ({ emit })) };
    const socket = {
      playerId: 'tv-display',
      tvAuthorized: true,
      roomCode: 'ROOM01'
    };

    handleTvMediaStatus(io, socket)({
      roomCode: 'room01',
      status: 'playing',
      permission: 'granted',
      service: 'available',
      autoplay: 'allowed',
      tvSessionToken: 'must-not-be-forwarded'
    });

    expect(io.to).toHaveBeenCalledWith('ROOM01');
    expect(emit).toHaveBeenCalledWith('tv-media-status', {
      roomCode: 'ROOM01',
      status: 'playing',
      permission: 'granted',
      service: 'available',
      autoplay: 'allowed'
    });
  });

  test('rejects player, unauthorized TV and unknown statuses', () => {
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
    const handler = handleTvMediaStatus(io, {
      playerId: 'player-id',
      tvAuthorized: false,
      roomCode: 'ROOM01'
    });

    handler({ roomCode: 'ROOM01', status: 'playing' });
    handler({ roomCode: 'ROOM01', status: 'secret' });

    expect(io.to).not.toHaveBeenCalled();
  });
});
