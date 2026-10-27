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

It never reads or writes the backend `.env` database. Set `PLAYWRIGHT_CHROMIUM_PATH` when the cached Chromium executable is not available; CI uses the Playwright-managed Chromium path automatically.

## Coverage

The suite covers room creation/configuration, independent player/card assignment, TV authorization, Socket.IO number/music synchronization, automatic trivia and answer propagation, invalid bingo rejection, two legitimate 24-number bingo claims inside the tie window, organizer-only REST authorization, player session reconnection, TV-controlled tie-break performances, voting from both browser sessions, voter-identity rejection, persisted winner selection, and post-recovery synchronization.

The visual-card step reads all 25 rendered cells, compares each `{row, col, value}` with the persisted backend matrix, calls three selected numbers, marks those cells through the player UI, and verifies MongoDB persistence and recovery after reconnection. The tie-break is driven through the public browser flow. The suite uses two independent full-card claims to create the tie, controls both performances through the TV page, opens voting normally, verifies both player sessions and the backend winner transition, and uses only disposable MongoDB data.

The same command runs in the `e2e` job in `.github/workflows/ci.yml`. Failed runs upload `e2e/artifacts/` with captured service logs; successful runs do not leave generated artifacts in the repository.
