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

The suite covers room creation/configuration, independent player/card assignment, TV authorization, Socket.IO number/music synchronization, automatic trivia and answer propagation, invalid bingo rejection, a valid 24-number bingo completion, organizer-only REST authorization, player session reconnection, and the player voting modal with a disposable in-memory tie-break fixture.

The tie-break performance loop is represented by a disposable fixture that starts the voting phase directly; this keeps the browser suite bounded while the existing backend integration tests cover the complete performance and winner state transitions.
