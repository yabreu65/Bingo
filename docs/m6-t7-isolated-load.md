# T7 — Bounded local protocol/load verification

This harness exercises the real production Express application and Socket.IO handlers against its own authenticated MongoDB replica set. It does not start Docker/Compose, read `.env`, accept a database URL, or target an existing server. T4–T6 source behavior is preserved unless a separately reproduced regression requires correction.

## Run

```sh
cd backend
./node_modules/.bin/jest --runInBand --no-cache tests/t7IsolatedLoad.test.js
```

Do not run multiple copies concurrently. Each invocation owns a unique repository-local temporary directory, a database called `t7_only` inside its own newly created process, an ephemeral loopback HTTP/WebSocket listener, and at most 540 sockets. Only its owned fixture directory is removed; old residues are not touched. A failed resource/time guard means FAIL, not a result to extrapolate.

## Scenarios

| Scenario | Checks |
|---|---|
| A | 50 join requests dispatched within 1 second; exactly 50 identities; 50 distinct valid cards. This does not require admission completion within 1 second. |
| B | 50 joins dispatched over 5 seconds; card assignment, Socket.IO joins and later authorized event delivery. |
| C | 100 requests for 50 available places; exactly 50 accepted and 50 `Sala llena` rejections; no orphan Player documents or cards for rejected joins. |
| D | 50 guests admitted; 10 disconnect/reconnect with the same identity and card; admission-key retry is idempotent even at full occupancy; another guest's credential cannot take over. |
| E | 10 independent rooms, 50 guests each, plus organizers and principal TVs; 520 active sockets. Admission uses two-room batches (50 simultaneous requests per room), not 500 simultaneous TCP handshakes. Real number calls, dance-challenge routing, room events, per-player state sync and persisted cards must remain room-bound. |

The production rate limiters remain active. Only the test's loopback proxy is trusted: each scenario and each room in E uses a distinct synthetic forwarded IP. Guests in one room share that room's IP. These results therefore represent multiple room-level NATs, **not 500 guests behind one public NAT**. Production limits (100 joins/IP/hour, 120 card selections/IP/minute, 5 room creations/IP/hour) remain constraints. No rate-limit bypass is claimed.

## Measurements and safety

The test reports dispatch span separately from successful admission latency, card latency, socket setup, room-event latency and reconnection latency. It records p50/p95/p99, HTTP status counts, socket errors, Mongo command counts and data growth, Node CPU/RSS, sampled Mongo CPU/RSS, event-loop delay, active socket peaks and persisted membership/card consistency.

Client and backend execute in one Node/Jest process, so its CPU/RSS and admission latencies include load-generator work. Mongo is a separate sampled child process. This is not a server-only benchmark. No audio/video is played or downloaded and no browser or external network is involved.

Execution has a 180-second wall budget after setup, 160 CPU-seconds in the Node process, 1 GiB Node RSS, 1 GiB sampled Mongo RSS, 0.25 GiB WiredTiger cache and 540 sockets. The watchdog disconnects clients/closes the fixture listener when exceeded; tests still fail rather than claiming capacity. Mongo setup is independently limited by the test runner timeout.

Raw current-run measurements are written to an untracked local file and printed as `T7_SCENARIO` / `T7_FINAL`. They contain synthetic counts and timings, not guest capabilities or credentials. Reviewable observed results are copied into the M6 log and Engram; do not commit runtime logs or database files.

## Interpretation

Passing these checks establishes only the measured local protocol scenarios under the recorded machine/profile. It does not establish sustained throughput, real-device autoplay/LOCAL_TV playback, HTTPS/WSS proxy behavior, Contabo capacity, failover, internet reconnection, or 500 users in production. T8 is a separate owner decision; this harness does not approve publishing or deployment.

The first fixture attempt failed before Mongo startup because its database subdirectory was absent; the fixture now creates it explicitly. The first actual run passed A–D but its 500-at-once E admission schedule hit a loopback TCP connect timeout before 500 users were established. E was changed to bounded room batches without changing production code or the 500-user/520-socket objective. In-flight admissions are drained before reporting failure, so teardown cannot race with abandoned client promises. The failed E run is not evidence of completed capacity.

## Observed final independent run

Apple M1, Darwin arm64, 8 logical CPUs, 16 GiB RAM, Node 22.22.3. The independent final-version run passed all 5 cases in 85.175 seconds. Production middleware remained active.

| Case | Accepted / expected rejection | Admission p50 / p95 / p99 (ms) |
|---|---|---|
| A | 50 / 0; dispatch span 1 ms | 1611.60 / 2187.82 / 2226.62 |
| B | 50 / 0; dispatch span 4999 ms | 36.29 / 158.63 / 164.61 |
| C | 50 / 50 room-full HTTP 400 | 4330.82 / 4352.02 / 4352.64 |
| D | 50 / 0; 10 successful recoveries, 1 expected takeover HTTP 403 | 1092.84 / 1761.76 / 1789.84 |
| E | 500 / 0, 10 rooms, 520 active sockets | 2394.26 / 3600.36 / 3803.19 |

E's aggregate admission phase took 18.475 seconds (27.06 admissions/s), with the bounded two-room schedule. E socket setup p95 was 358.63 ms and number-event delivery p95 was 15.44 ms. D reconnect HTTP p95 was 41.29 ms. All socket-error counters and post-scenario active-socket counts were zero. Persisted audits found no duplicate identities or orphan Players; each room's assigned matrices matched its cards, and all 500 per-player sync checks stayed room-bound.

Peak Node RSS: 576,913,408 bytes; sampled Mongo RSS: 125,403,136 bytes; sampled Mongo CPU peak: 57.8%. Node CPU consumed 64.694 seconds over an 80.942-second measured workload. Event-loop delay p95/p99: 115.61/139.07 ms. Final own DB before teardown: 14 rooms, 714 Players (700 guests and 14 hosts across all scenarios), 10 Games, 773,251 data bytes growth, 70,773 Mongo commands. No resource guard aborted.

Related backend regressions: 6 suites / 65 tests passed. Parent spot-check of A: 1 passed, 4 deliberately excluded by test selection. No frontend source changed; T6's final lint/production-build evidence remains applicable, so those unchanged checks were not repeated for this test/documentation-only unit.

**Historical advisory, investigated in T8:** those T7 runs emitted Jest's one-second open-handles warning despite normal exit. An async-hooks E-only reproduction captured the sole referenced resource as a 3000 ms MongoDB server-selection timer for a FindCursor. Socket.IO had removed sockets before their asynchronous disconnect listeners finished querying Mongo, and the harness closed the database too early. It was a fixture shutdown race, not proof of a permanent production leak. T8 now awaits the existing disconnect-listener promises before closing Mongo and records PASS only after zero sockets and zero pending listeners. A bounded B run with the same diagnostic preload passed without the warning and with no referenced resources at beforeExit. An instrumented E revalidation exceeded its 90-second test deadline and remains explicitly FAIL; it was not automatically retried or used as a new throughput claim. The 500-user results above remain historical T7 results, not a fresh full-scale post-correction benchmark. See the T8 audit for exact commands, failed checks and acceptance status.

The T7 independent review found no blocking defect and recommended **GO for a separate owner decision to begin T8**. T8 was subsequently authorized; see `m6-t8-audit.md` for its demonstrated corrections, warning diagnosis and the separately authorized current E PASS without that warning. The historical T7 measurements above are preserved rather than overwritten. No infrastructure, publication or deployment approval is implied. Exact run identities, results and failures are retained in the local audit record.

Runtime measurements and the earlier failed-test database residue remain local and must not be committed.
