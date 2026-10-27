import { describe, expect, it } from 'vitest';
import { createRecordingAuthorizationHeaders } from './recordingAuthorization';

const playerCapability = 'p'.repeat(43);
const hostCapability = 'h'.repeat(43);

describe('recording capability handoff', () => {
  it('sends only the player capability and identity headers for player uploads', () => {
    const headers = createRecordingAuthorizationHeaders({
      roomCode: 'ROOMA1',
      playerId: 'player-a',
      playerCapability
    });

    expect(headers).toEqual({
      'x-room-code': 'ROOMA1',
      'x-player-id': 'player-a',
      'x-player-capability': playerCapability
    });
    expect(JSON.stringify(headers)).not.toContain(hostCapability);
  });

  it('sends only the host capability for organizer uploads when both credentials are present', () => {
    const headers = createRecordingAuthorizationHeaders({
      roomCode: 'ROOMA1',
      playerId: 'performer-a',
      playerCapability,
      hostCapability
    });

    expect(headers).toEqual({
      'x-room-code': 'ROOMA1',
      'x-player-id': 'performer-a',
      'x-room-host-capability': hostCapability
    });
    expect(JSON.stringify(headers)).not.toContain(playerCapability);
  });
});
