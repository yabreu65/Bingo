# Phase 4 security and load validation

## Scope

Phase 4 adds two local validation layers:

- Recording reads, streams, likes and statistics require a room-bound capability (host, player or TV). Admin JWTs remain supported through the existing optional authentication middleware.
- `e2e/phase4-load.mjs` exercises the real HTTP and Socket.IO protocol against a temporary MongoDB instance. It creates the room, joins players, assigns unique cards, starts a game, propagates all 75 calls, marks cells, claims bingo, reconnects players, and verifies persisted state.

The simulator is loopback-only and uses a generated MongoMemoryServer database. It never connects to production and does not use private media.

## Commands

From `e2e/`:

```bash
npm run test:phase4                 # full local run (50 players)
PHASE4_PLAYERS=10 npm run test:phase4  # CI smoke run
PHASE4_PLAYERS=5 PHASE4_MINIGAMES=1 PHASE4_RESTART=1 npm run test:phase4  # minigames + backend restart
```

Reports are written to `e2e/artifacts/phase4/`, which is ignored and must not be committed.

## Latest local evidence

The latest full run used seed `20261027` and 50 players. It completed with `PASS`:

- 50 joins, 50 card selections, 51 Socket.IO joins (organizer plus players), 75 calls and 1,200 mark operations.
- 3,750 number events received, zero duplicate events, and 10 successful reconnections.
- Join latency p50/p95/max: 6.64/9.65/5,016.22 ms; card selection: 5.33/8.06/11.60 ms; Socket.IO join: 8.35/13.32/30.53 ms; number propagation: 3.02/20.67/31.33 ms.
- Backend peak RSS: 218.73 MB; simulator RSS at completion: 138.05 MB; backend peak sampled CPU: 144% on the local multi-core machine.
- The result was persisted as a legitimate full-card winner after all 75 calls; no errors were recorded.

The first-join maximum includes MongoDB/backend warm-up and is intentionally reported rather than hidden behind a filtered percentile.

A separate restart smoke run with five players completed all six protocol minigames (`trivia`, `riddle`, `dance`, `sing`, `group`, `karaoke`), restarted the backend against the same temporary MongoDB while a group challenge was paused, recovered six persisted players and the paused state, then completed the game and reconnections successfully. This run had zero recorded errors.

A 50-player minigame run also completed all six modalities with zero errors: 52 Socket.IO joins including organizer and TV, 3,750 number events, 1,200 marks, zero duplicates, ten reconnections, number propagation p50/p95/max of 6.00/27.37/132.08 ms, backend peak RSS 214.19 MB, simulator RSS 124.41 MB, and peak sampled backend CPU 135.6%.

## Security boundary

Unauthenticated requests to recording listing, detail, streaming, likes and statistics endpoints are rejected before storage access. Player capabilities are bound to the room and player identifiers; TV capabilities are bound to the room. The regression suite covers the public-stream boundary and keeps malformed range handling intact.

## Interpretation

The CI job is intentionally a ten-player smoke test for reproducibility and duration. The fifty-player run remains a local capacity check and its generated reports are evidence, not source-controlled fixtures.

## Residual risks and limits

- The simulator validates the core bingo protocol and reconnection path, not real camera/audio recognition or media decoding.
- The minigame mode exercises the server protocols and the TV karaoke-close event; browser E2E remains the authority for visual media playback.
- Backend startup now rehydrates persisted room intervals and active challenge expiry timers; the restart smoke verifies recovery while a group challenge is paused.
- Browser E2E covers trivia, riddles, dance, singing, group challenges, karaoke, voting, prizes, playlists and admin flows separately; those scenarios are not replaced by the lightweight 50-player run.
- JWTs issued by this revision carry an auth version and one hashed, rotating refresh token. Legacy JWTs without a version remain accepted while their user is on version zero for compatibility; newly issued sessions are revoked by logout and password change.
