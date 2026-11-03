import { isTVAuthorizationToken } from './tvAuthorization';

// A QR route may restore only the same guest in the same room, never a
// different room's session or an organizer capability.
export const canRestorePlayerEntrySession = (roomCode, saved) => (
  typeof roomCode === 'string' && /^[A-Z0-9]{6}$/.test(roomCode) &&
  saved?.roomCode === roomCode && saved.isHost === false &&
  typeof saved.playerId === 'string' && /^[a-fA-F0-9]{24}$/.test(saved.playerId) &&
  typeof saved.playerCapability === 'string' && saved.playerCapability.length === 43
);

export const createPlayerEntryURL = (baseUrl, roomCode) => (
  new URL(`/player/${encodeURIComponent(roomCode.toUpperCase())}`, baseUrl).toString()
);

const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/i;

const normalizeRoomCode = (value) => (
  typeof value === 'string' && ROOM_CODE_PATTERN.test(value)
    ? value.toUpperCase()
    : null
);

const getSingleValidTVToken = (searchParams) => {
  const tokens = searchParams.getAll('tvToken');
  return tokens.length === 1 && isTVAuthorizationToken(tokens[0]) ? tokens[0] : null;
};

const protectedOrganizerRedirect = () => ({
  type: 'redirect',
  to: '/organizer',
  navigation: 'document'
});

const resolveRootEntry = (search) => {
  const searchParams = new URLSearchParams(search || '');
  const roomValues = searchParams.getAll('room');
  const tvValues = searchParams.getAll('tv');

  if (roomValues.length > 1 || tvValues.length > 1 || (roomValues.length && tvValues.length)) {
    return protectedOrganizerRedirect();
  }

  if (roomValues.length === 1) {
    const roomCode = normalizeRoomCode(roomValues[0]);
    return roomCode
      ? { type: 'redirect', to: `/player/${roomCode}`, navigation: 'history' }
      : protectedOrganizerRedirect();
  }

  if (tvValues.length === 1) {
    const roomCode = normalizeRoomCode(tvValues[0]);
    if (!roomCode) return protectedOrganizerRedirect();

    const tvToken = getSingleValidTVToken(searchParams);
    const tokenQuery = tvToken
      ? `?${new URLSearchParams([['tvToken', tvToken]])}`
      : '';
    return {
      type: 'redirect',
      to: `/tv/${roomCode}${tokenQuery}`,
      navigation: 'history'
    };
  }

  return protectedOrganizerRedirect();
};

export const resolveEntryRoute = ({ pathname = '/', search = '' } = {}) => {
  if (pathname === '/') return resolveRootEntry(search);

  if (pathname === '/organizer' || pathname === '/organizer/') {
    return { type: 'organizer' };
  }

  const playerMatch = pathname.match(/^\/player\/([a-z0-9]{6})\/?$/i);
  if (playerMatch) {
    return { type: 'player', roomCode: playerMatch[1].toUpperCase() };
  }

  const tvMatch = pathname.match(/^\/tv\/([a-z0-9]{6})\/?$/i);
  if (tvMatch) {
    const searchParams = new URLSearchParams(search || '');
    return {
      type: 'tv',
      roomCode: tvMatch[1].toUpperCase(),
      tvToken: getSingleValidTVToken(searchParams)
    };
  }

  return { type: 'not-found' };
};
