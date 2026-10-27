const TV_CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const createTVDisplayURL = (baseUrl, roomCode) => {
  const url = new URL('/?', baseUrl);
  url.searchParams.set('tv', roomCode.toUpperCase());
  return url.toString();
};

export const listenForTVAuthorization = (windowRef, roomCode, onCapability) => {
  const opener = windowRef.opener;
  if (!opener) return () => {};

  const origin = windowRef.location.origin;
  const normalizedRoomCode = roomCode.toUpperCase();
  const handleAuthorization = (event) => {
    const capability = event.data?.tvCapability;
    if (event.source !== opener || event.origin !== origin ||
        event.data?.type !== 'bingo-tv-authorize' ||
        event.data?.roomCode !== normalizedRoomCode ||
        typeof capability !== 'string' || !TV_CAPABILITY_PATTERN.test(capability)) return;
    onCapability(capability);
  };

  windowRef.addEventListener('message', handleAuthorization);
  opener.postMessage({ type: 'bingo-tv-ready', roomCode: normalizedRoomCode }, origin);
  return () => windowRef.removeEventListener('message', handleAuthorization);
};

export const openTVDisplay = (windowRef, tvUrl, roomCode, tvCapability, onBlocked) => {
  const origin = windowRef.location.origin;
  const normalizedRoomCode = roomCode.toUpperCase();
  let tvWindow;
  let timeoutId;
  const handleTVReady = (event) => {
    if (event.source !== tvWindow || event.origin !== origin ||
        event.data?.type !== 'bingo-tv-ready' ||
        event.data?.roomCode !== normalizedRoomCode) return;

    windowRef.removeEventListener('message', handleTVReady);
    windowRef.clearTimeout(timeoutId);
    tvWindow.postMessage({
      type: 'bingo-tv-authorize',
      roomCode: normalizedRoomCode,
      tvCapability
    }, origin);
  };

  windowRef.addEventListener('message', handleTVReady);
  timeoutId = windowRef.setTimeout(() => {
    windowRef.removeEventListener('message', handleTVReady);
  }, 10000);
  tvWindow = windowRef.open(tvUrl, `bingo-tv-${normalizedRoomCode}`);
  if (!tvWindow) {
    windowRef.removeEventListener('message', handleTVReady);
    windowRef.clearTimeout(timeoutId);
    onBlocked?.();
  }
  return tvWindow;
};
