# Bingo Bailable E2E

This package runs the browser-level validation suite against disposable local services.

## Run

```sh
npm install --ignore-scripts --no-audit --no-fund
npm test
```

The runner starts:

- `MongoMemoryServer` with the `bingo-e2e` database name;
- the backend on `127.0.0.1:5101`;
- Vite on `127.0.0.1:5174`;
- isolated Playwright browser contexts for the organizer and players.

It never reads or writes the backend `.env` database. Set `PLAYWRIGHT_CHROMIUM_PATH` when the cached Chromium executable is not available.

## Coverage

The suite covers room creation/configuration, independent player/card assignment, TV authorization, Socket.IO number/music synchronization, automatic trivia and answer propagation, invalid bingo rejection, organizer-only REST authorization, player session reconnection, and the player voting modal with a disposable in-memory tie-break fixture.

The successful-bingo winner path remains a separate scenario because completing a real card requires the full 24-number draw and the production flow intentionally pauses for challenges; the existing backend integration tests cover winner/tie-break state transitions.
