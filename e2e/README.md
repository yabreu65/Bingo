# Bingo Bailable E2E

This package runs the browser-level validation suite against disposable local services.

## Run

```sh
npm install --ignore-scripts --no-audit --no-fund
npm test
```

The runner starts:

- a disposable single-member `MongoMemoryReplSet` with the `bingo-e2e` database name, matching the backend readiness contract;
- the backend on `127.0.0.1:5101`;
- Vite on `127.0.0.1:5174`;
- isolated Playwright browser contexts for the organizer and players.

It never reads or writes the backend `.env` database. Set `PLAYWRIGHT_CHROMIUM_PATH` when the cached Chromium executable is not available; CI uses the Playwright-managed Chromium path automatically.

## Coverage

The command first checks parity between the real frontend and backend card generators,
coordinate accessors, and all four winning modes across the 200 deterministic cards.
It then covers room creation/configuration, independent player/card assignment, TV
authorization, Socket.IO number/music synchronization, automatic trivia and answer
propagation, invalid bingo rejection, two legitimate 24-number bingo claims inside
the tie window, organizer-only REST authorization, player session reconnection,
TV-controlled tie-break performances, voting from both browser sessions,
voter-identity rejection, persisted winner selection, and post-recovery
synchronization.

The visual-card step reads all 25 rendered cells, compares each `{row, col, value}`
with the persisted backend matrix, calls three selected numbers, marks those cells
through the player UI, and verifies MongoDB persistence and recovery after
reconnection. The phase-one engine step independently drives valid and invalid
claims for line, four corners, central cross, and full card, then exercises pause,
blocked actions, resume, reconnection, duplicate protection, statistics, finish,
and reset through real browser sessions. The tie-break is driven through the public
browser flow. The suite uses disposable MongoDB data and no private media assets.

The same command runs in the `e2e` job in `.github/workflows/ci.yml`. Failed runs upload `e2e/artifacts/` with captured service logs; successful runs do not leave generated artifacts in the repository.

## Virtual-player bot CLI

The fixed 24-player bot runner defaults to local mode, which accepts only an HTTP loopback backend. Its explicit `--mode contabo` mode accepts only `https://bingo.31.220.98.21.sslip.io` and sends Basic Auth on public HTTP and Socket.IO requests. It reads credentials only from the existing protected process environment variables `BINGO_BASIC_AUTH_USER` and `BINGO_BASIC_AUTH_PASSWORD`; credentials are not CLI flags or URL components. The runner uses public admission/card/socket contracts and does not query MongoDB directly.

Contabo mode is not permission to perform a remote test or start a game. The gated 24-bot operator procedure and prior compatibility evidence are in `docs/virtual-player-local-operator-runbook.md`. The guarded one-player probe is prepared as `node e2e/contabo-one-bot-preflight.mjs --run`; it creates public trial state, is not run by local tests, and requires separate authorization. Do not use the generic `contabo-trial-load.mjs` CLI as a substitute because it accepts arbitrary HTTPS hosts.

## Directed 24-bot group-pause diagnostic

To isolate the corrected group-challenge observer with one organizer, one browser player, 24 virtual players, and the authorized TV popup—without unrelated browser cases—run:

```sh
node diagnose-group-pause.mjs
```

The browser player selects card 25; the public fleet uses cards 1–24. The diagnostic uses a disposable in-memory replica set. Its test-only backend launcher forces `127.0.0.1` and verifies the actual `server.address()` before starting Vite or sending test requests. Vite uses `--strictPort`, and browser actions wait for that spawned process's loopback URL marker. The diagnostic checks public pause/resume events plus TV and player UI state, then stops only processes and in-memory data created by that run. It is a directed E2E, not a load test or deployment procedure.
