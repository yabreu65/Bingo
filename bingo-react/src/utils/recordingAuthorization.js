export const createRecordingAuthorizationHeaders = ({
  roomCode,
  playerId,
  playerCapability,
  hostCapability
}) => {
  const headers = {
    'x-room-code': roomCode,
    'x-player-id': playerId
  };

  if (hostCapability) {
    headers['x-room-host-capability'] = hostCapability;
  } else if (playerCapability) {
    headers['x-player-capability'] = playerCapability;
  }

  return headers;
};
