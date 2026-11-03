# M6 T8 — Final source audit and verification limits

**T8 complete. M6 source/local-verification closure: GO after demonstrated corrections and the explicitly authorized fresh E run.** GitHub publication is technically GO only for selected reviewable source/tests/docs, excluding all runtime evidence, environments, databases and old residues. Contabo execution is NO-GO; a private-staging plan is prepared but has not been executed.

This is an audit of local code and isolated tests, not certification of 500 real users, Contabo hardware, internet connectivity, TLS/WSS, real browsers or media playback. No commit, push, merge, Actions, deployment, SSH or unrelated-project change was performed.

## Original blockers and T8 findings

| Severity | Finding | Reproduction and correction | Status |
|---|---|---|---|
| ALTO | Concurrent legitimate dance/riddle replies could award twice from pre-lock snapshots | Actual Socket.IO + disposable Mongo reproduced dance 100 instead of 50 and riddle 60 instead of 30. Conditional Mongo completion/event claim now precedes awards; stale game snapshots are not saved; only the winning riddle claim emits its results. | Corrected; independent limited recheck passed. |
| ALTO | Root-level Winston secret metadata was not redacted | A test leaked synthetic root `password`/`token` canaries. Root metadata now uses the same sensitive-key policy as nested values. | Corrected; independent limited recheck passed. |
| MEDIO | Two tabs without Web Locks could create different admission keys | Deterministic interleaved empty localStorage reads returned two distinct keys. New creation now fails closed without Web Locks; existing valid keys may recover. Both join forms show a typed compatibility message before any admission POST. | Corrected; independent limited recheck passed. |
| MEDIO, harness | Database teardown raced asynchronous Socket.IO disconnect handlers | Actual E warning captured a referenced 3000 ms MongoDB server-selection timer for a FindCursor. Socket count zero did not mean disconnect queries had finished. Harness now awaits the existing listener promises and emits PASS JSON only after cleanup assertions. | Cause established; bounded B validation passed. Fresh instrumented E timed out; scale limit remains explicit. |

Original arbitrary score deltas are rejected; server-side trivia/voting claims, host-authorized REST behavior, recording capability boundaries, direct-upload denial, nested error/log redaction, transactional admission/manual quota/card allocation, idempotent recovery, TV authorization and database-aware readiness were exercised by the final backend suite. Existing closed work was changed only for the reproduced defects above. T6 behavior was not changed.

## Final checks observed

| Check | Observed result |
|---|---|
| Backend complete except the expensive T7 load suite | 30 suites, 268 tests PASS, 23.367 s; includes admission races, replay fixes, privacy, logs, authentication/readiness and isolated HTTP/Socket.IO integration. |
| Frontend complete after all UI changes | 16 files, 51 tests PASS. |
| ESLint | PASS. |
| Fictional production Vite build | PASS, 20 JavaScript artifacts, 8.04 s; empty temporary env directory, fictional same-origin HTTPS configuration, no visitor-localhost backend URL. |
| Node local-media security | 2 tests PASS. |
| Independent correction recheck | Backend 4 suites / 44 tests PASS; frontend 3 files / 12 tests PASS. No new broad sweep. |
| Owner-authorized current normal E, after teardown correction | 1 PASS, 4 skipped by selection, 82.107 s; 500 guests, 10 rooms, 520 active sockets; zero remaining sockets/pending disconnect listeners; no Jest warning. |
| Parent bounded disconnect diagnostic | B: 1 PASS, 4 skipped by selection, 13.648 s; no Jest warning; zero active sockets/pending disconnect listeners; no referenced resources at beforeExit. |
| Historical T7 independent A–E | 5/5 PASS, 85.175 s; 500 guests in 10 rooms, 520 active sockets; not a fresh full-scale result after T8 teardown correction. |

Exact commands and run identities are retained in the local audit record. Counts from overlapping commands are not added together as unique tests. Test-selection skips are distinguished from unexecuted coverage.

### Failed checks and omissions — not hidden

- Initial full backend audit: 264 PASS and one recording authorization test failed with loopback `ECONNRESET`. The focused recording suite subsequently passed 23/23, and the final complete non-load backend run passed 268/268. No recording source change was justified.
- RED regressions for double awards, root-secret logging, cross-tab identity and the unsupported-browser UI message failed before their fixes, then passed. Intermediate test-double assertions and a malformed utility edit were repaired before final checks; neither is represented as a product PASS.
- Original diagnostic E with async-hooks passed and reproduced the Jest warning. Corrected E with the same stack instrumentation **failed the 90-second test deadline** (106.529 seconds total). It was not automatically retried, the deadline was not weakened, and this is not new 500-user evidence.
- Nginx parsing/runtime, real TLS/WSS, Contabo firewall/proxy/headroom, target browsers, media rights/playback and persistent-database rollout were not tested. No image or service was started to work around the previously unavailable Nginx verifier.
- No automatic production or staging progression is authorized.

## Jest warning: evidence and interpretation

A local diagnostic preload records async resource creation stacks at the actual warning and at beforeExit. The original E snapshot had exactly one referenced 3000 ms timeout from `mongodb` `Topology.selectServer` → operation execution → `FindCursor._initialize`. At beforeExit there were no active resources. This is evidence of a shutdown race, not a permanent leaked process and not justification to ignore the warning.

Socket.IO removes a socket from its map before awaiting application async event listeners. The production disconnect handler continues Room/Player reads, updates and broadcasts. The old harness saw zero sockets and closed Mongo while those operations were still in progress. The corrected harness wraps and awaits those existing listeners before disconnecting Mongo, asserts zero pending tasks and sockets, and records PASS after cleanup.

The bounded B experiment with the same preload passed without the warning; only unreferenced rate-limiter/Jest housekeeping timers remained. The timed-out corrected E experiment does **not** prove the full-scale correction passed. The owner explicitly selected `authorize-normal-e`. That one fresh E run, without the stack preload or concurrent test/build jobs and with unchanged budgets, passed in 82.107 s. The actual log contains no Jest open-handles warning; zero sockets and pending disconnect listeners remained. This resolves the former proof-acceptance block. The earlier instrumented E timeout remains a reported diagnostic failure, not retroactively a PASS.

## Decisions

| Decision | Current result |
|---|---|
| Formal M6 closure | **GO for source/local verification.** Independent findings are corrected and the owner-authorized current E proof passed. No infrastructure or production-capacity certification is implied. |
| GitHub publication | **Technical GO for the selected source/test/doc manifest only.** Not `git add .`; exclude untracked runtime JSON, diagnostic outputs/preload, logs, `.env`, uploads, dependency/build directories and old database residue. No publication executed. |
| Preparing private staging in Contabo | **GO for the written plan only; NO-GO for infrastructure execution** without new authorization and verified prerequisites. See `m6-private-staging-plan.md`. |

## Inventory and Git

The publication manifest is maintained separately for review. Runtime measurements, logs, diagnostics, environment files, generated output and old database residues are excluded. The baseline HEAD and twelve local commits were preserved during T8; no commit or push was made.

## Current authorized E metrics and remaining resource risk

Job 49 ran exactly one normal E after explicit owner authorization. Aggregate admission: 500 guests in 19.840 s (25.20/s); admission p50/p95/p99 2602.95/4176.94/4620.19 ms; socket setup p95 414.06 ms; number-event delivery p95 107.61 ms. There were 1020 expected HTTP 200 responses, zero socket errors, zero orphan/duplicate identities in the ten room audits, and 500 valid assigned cards. All room events/challenges/numbers/state sync remained isolated. Final disposable state: 10 rooms, 510 Players, 10 Games, 572,587 bytes data growth, 53,918 Mongo commands. Scenario duration 60.437 s and full measured workload 78.202 s; Jest total 82.107 s; no guard aborted.

Node peak RSS was 1,010,221,056 bytes (about 963.4 MiB, **94.1% of the 1 GiB harness limit**), sampled Mongo RSS 147,472,384 bytes, Node CPU 65.008 s, event-loop delay p95/p99 123.80/355.47 ms. These measurements include the load generator and server in one process. The near-limit RSS is a **MEDIO capacity/headroom risk** requiring measurements in the separately authorized staging environment; it is not evidence of VPS suitability or a production leak. No new performance threshold was invented and none of the existing safety limits was raised.
