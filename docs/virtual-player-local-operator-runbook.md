# Local 24-Player Operator Runbook

**Scope:** preparation for an isolated local rehearsal with one human organizer, one human player, and 24 synthetic players. This guide does not deploy services or start a human game. Its Contabo section is a gated procedure only; no remote bot check or game was executed. The validated E2E used synthetic browser sessions; it did not rehearse with real people.

## Readiness and safety boundary

- Local rehearsal uses only a disposable local database and loopback services. The bot CLI defaults to local mode; never point local mode at staging, production, Contabo, or a persistent/shared database.
- The standalone bot CLI starts exactly 24 synthetic players. Its explicit Contabo mode accepts only the approved HTTPS origin and sends Basic Auth through the existing public HTTP/Socket.IO route; remote execution remains gated by the procedure below. The CLI does not create a room or database.
- The regular backend server does not explicitly bind to loopback (`server.listen(PORT)`). `BINGO_ACCESS_MODE=local` configures allowed browser origins; it does **not** bind the server to a network interface.
- **A phone cannot reach the host computer through `127.0.0.1`.** That address refers to the phone itself. No phone-access network path is approved or validated here. Do not change the backend bind, widen the origin allowlist, expose services to a LAN, or start phone play until a separate safe network plan is explicitly approved.
- The successful automated harness uses a disposable single-member Mongo replica set and a test-only launcher that verifies the backend's actual `127.0.0.1` bind. Keep its processes and data isolated; its safety does not authorize using the regular server for a phone session.
- Never copy, log, or save capabilities, admission tokens, TV tokens, or JWT secrets. Use synthetic names only. Do not clear or alter persistent data as cleanup.

## Validated directed E2E

The single authorized run, job-54, exited 0 after 44 seconds:

- Backend bind verified as `127.0.0.1:5101` before test actions; disposable in-memory MongoDB was used.
- 24/24 bots joined on cards 1–24; the browser player used card 25.
- Public game states were `playing` → `paused` → `playing`; both TV and player UIs displayed pause and resume. Pause lasted 30,072 ms.
- Bot connections returned to 0, and ports 5101/5174 were free after teardown.
- The original organizer-page `Pausado` wait still failed, and the host-control socket disconnected once. This is the known observer mismatch; the corrected observer uses the player page, whose pause/resume checks passed alongside the TV. Do not interpret the organizer-page comparison as a passing organizer UI assertion.

This was one focused synthetic E2E, not a human rehearsal or the full `run-e2e.mjs` suite after the observer correction. Do not rerun it or the full suite without separate authorization. Do not run `e2e/phase4-load.mjs` as part of this rehearsal.

## Browser entry points

The frontend uses state-driven views, not separate organizer/player page routes:

| URL | Actual flow |
| --- | --- |
| `http://127.0.0.1:5173/` | Landing page. Choose **Comenzar a Jugar**, then **Multijugador**. The organizer selects **Crear Sala**, enters a synthetic organizer name and room name, and reaches the organizer dashboard. |
| `http://127.0.0.1:5173/?room=ABC123` | Quick Join for room `ABC123`. The player enters a synthetic name and follows the card-selection flow. A room code is an identifier, not a credential. |
| `http://127.0.0.1:5173/?tv=ABC123` | TV display view for room `ABC123`. A bare URL is not authorization. In local mode, open TV from the organizer's authorized popup/handoff; do not copy or store the TV capability. |

These loopback URLs work only from a browser on the same host. They are not phone URLs. The organizer dashboard owns game start, room configuration, and TV handoff. Human players use the player card view. The UI's **Iniciar** action starts the room; players should only mark called numbers and claim Bingo when the selected pattern is complete.

## Local prerequisites

The backend requires `MONGODB_URI`, `JWT_SECRET`, and `FRONTEND_URL`; `PORT` defaults to `5001`, and `NODE_ENV` defaults to development. Keep `BINGO_ACCESS_MODE=local`; its local allowlist includes loopback frontend origins on ports 5173 and 5174. A local JWT secret must be generated for the isolated environment and kept out of source control and logs. No secret values belong in this runbook.

The normal admission implementation requires a Mongo replica set or sharded deployment that supports transactions. Automated browser verification uses a disposable single-member replica set and isolated `bingo-e2e` database; do not substitute a developer's persistent MongoDB URI. The E2E frontend uses `http://127.0.0.1:5174` and backend uses `http://127.0.0.1:5101`; the ordinary frontend API default is `http://localhost:5001`.

## Automated local checks

```sh
cd e2e
npm run test:virtual-players
```

The focused suite passed 16/16 before job-54. After this implementation, `npm run test:virtual-players` passes 27/27, including the guarded preflight and unknown-argument redaction regression tests; `node --test contabo-trial-load.test.mjs` passes 17/17. These are local unit/mocked checks, not network runs. `node diagnose-group-pause.mjs` is the one-run diagnostic already consumed by job-54; it creates its own disposable MongoDB and loopback services and cleans up only resources it created. Do not repeat it without a new explicit authorization. The full `node run-e2e.mjs` was not run after the observer correction, so its integrated behavior remains unverified.

## Same-host local rehearsal procedure — not for a phone

Use this procedure only when the organizer, human-player browser, TV, backend, and frontend all run on the same host, with an isolated disposable database and verified loopback bind. It documents a possible local rehearsal; it was not performed with real people in job-54.

1. Start the backend against a dedicated disposable replica-set database and use an explicitly loopback-isolated launcher. Confirm the actual listener is `127.0.0.1` before continuing; `BINGO_ACCESS_MODE=local` alone is not sufficient.
2. Start the frontend on loopback at `http://127.0.0.1:5173/` and verify it reports the local backend. Do not expose either service to a LAN or public network.
3. In the organizer browser, create a new room with a synthetic name. Confirm the room is open and has at least 25 participant slots: the organizer is not counted, while 24 bots plus one human player are.
4. From the repository root, start the fixed 24-player fleet in a second terminal:

   ```sh
   node e2e/virtual-player-bots.mjs start \
     --backend-url http://127.0.0.1:5001 \
     --room-code ABC123 \
     --seed local-rehearsal-01
   ```

   Replace `ABC123` with the six-character room code and choose a reproducible non-secret seed. The runner uses public room-admission, card-selection, and Socket.IO contracts. It assigns cards 1–24 and keeps generated admission credentials in memory; logs show synthetic aliases/status and a seed fingerprint, not credentials. Confirm `connected=24/24` and `admitted=24`.
5. In a separate browser on the **same host**, open `/?room=ABC123`, complete Quick Join with a synthetic name, and select unassigned card 25. Do not join with real personal data. A phone is not supported by this loopback-only procedure.
6. Open the authorized local TV popup from the organizer dashboard. Start the game only as the human organizer. Humans perform physical challenges, dancing, singing, and karaoke; bots intentionally do not pretend to perform those activities. Bots may act only on supported digital/text contracts and valid public game state.
7. Keep the bot process in the foreground. Stop it with **Ctrl-C** (or `kill -INT <PID>` from another local terminal). Wait for the final line to report `connected: 0`; then close the room through the organizer UI. Dispose only the dedicated ephemeral database and processes created for this rehearsal. Do not delete database files or alter shared services.

## Contabo remote mode — prepared, not executed

This is a future procedure, not authorization to connect or start a game. No production or infrastructure change, remote request, one-bot probe, or 24-bot run was performed for this change. Remote writes and game actions still require separate authorization.

The simulator's only remote origin is `https://bingo.31.220.98.21.sslip.io`; it rejects other schemes, hosts, ports, paths, queries, fragments, and URL credentials before making requests. It uses the existing Basic Auth environment names `BINGO_BASIC_AUTH_USER` and `BINGO_BASIC_AUTH_PASSWORD`. Populate them only through the existing protected local mechanism; do not put values in command arguments, URLs, shell examples, logs, or repository files. The bot code uses public room-admission, card-selection, and Socket.IO contracts and does not query MongoDB.

### Compatibility evidence and limits

The previously recorded trial metadata identified backend image `bingo-contabo-trial-020d654-backend:l105`. The authorized L106 runbook entry records a 50-player run through the existing `contabo-trial-load.mjs`: 50/50 players received unique cards, all 50 sockets stayed stable through the 300-second hold, and there were zero unexpected disconnects. The run nevertheless exited with `success=false` because player 50's full confirmation was 61,086.93 ms, 1,086.93 ms beyond the strict 60-second deadline. The runbook also records that independent L105 startup/readiness clearance remained unavailable and was accepted only as a limitation. This supports compatibility of the shared public HTTP/WSS transport at the time of that run; it does not live-verify the new 24-bot CLI, phone route, TV handoff, or the deployment's current version. No remote check was repeated here.

### Guarded one-player preflight — one S4 run authorized after gates

The guarded wrapper fixes the target to the approved origin and the player count to one. With no arguments or `--help`, it performs no network requests. `--run` creates a new room with two slots, admits one synthetic player, selects a card, and opens WSS through public APIs; it does not delete/close the room. This is a remote write, not a health check. S4 authorizes exactly one run after directed local tests and fresh read-only health/auth gates pass; do not retry if it fails:

```sh
node e2e/contabo-one-bot-preflight.mjs --run
```

Credentials must already be supplied by the existing protected process-environment mechanism. The wrapper rejects all URL, count, and credential options. Its 10-second window is the global post-room-setup confirmation acceptance criterion; HTTP requests, WSS handshake, and Socket.IO acknowledgment keep separate 15-second timeouts, and the whole run is capped at 30 seconds. The JSON summary records admission/confirmation counts, card validity, Socket.IO confirmation and active sockets, confirmation offset/end-to-end/total timings, sanitized auth/error codes and status, and whether the single client disconnect was controlled. It never includes room/player IDs, credentials, capabilities, response bodies, or raw exception text. Do not use the generic load-runner CLI as a substitute.

### 24-bot procedure — requires separate authorization

Only after the one-player preflight passes and an authorized operator confirms the trial remains healthy, the public HTTPS route is usable from the Mac and phone, the room has at least 25 player slots, and TV access is authorized through the organizer handoff:

1. From the organizer Mac, open the approved HTTPS origin and create a fresh room. Do not use a URL containing credentials or any private token.
2. On the phone, use the HTTPS player URL `https://bingo.31.220.98.21.sslip.io/?room=ABC123` and complete the existing Basic Auth prompt. `127.0.0.1` is not a phone route. Confirm the phone can reach the player flow before proceeding; that access was not verified here.
3. Open the TV using the organizer UI's authorized TV popup/handoff. A room code alone does not authorize TV; never copy or log the TV capability.
4. From the repository root, with credentials already present in the protected process environment, run the fixed 24-bot CLI in the foreground:

   ```sh
   node e2e/virtual-player-bots.mjs start \
     --mode contabo \
     --backend-url https://bingo.31.220.98.21.sslip.io \
     --room-code ABC123 \
     --seed contabo-trial-01
   ```

   The runner assigns 24 independent player identities/cards through the public API. Confirm `admitted=24` and `connected=24` before any organizer game action. Do not start the game until the human player, organizer, and TV are ready and the game start is separately authorized.
5. Keep the runner foregrounded. Stop with Ctrl-C and confirm `connected: 0`. If the connection is partial or any UI/access precheck fails, stop the bots and do not start the game.

The remote endpoint/version, phone access, and 24-bot behavior have not been probed during this implementation. Prior read-only trial evidence and the earlier load-run result are recorded separately; they do not replace the pending single-player preflight or authorize this procedure.

## Phone-play gate

For local rehearsal, a separate-device human player still needs an approved network design that preserves isolation and authorizes the backend bind and browser origin; do not substitute a LAN IP for `127.0.0.1` or modify local network policy. For Contabo, the public HTTPS/Basic Auth player URL above is the only documented candidate, but phone DNS/TLS/auth access remains unverified and must be confirmed before any game. No remote service, deployment, remote TV link, human game, or load test was used for the validated E2E.
