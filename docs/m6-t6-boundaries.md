# M6 T6 — Media boundaries and database readiness

T6 verifies S7–S9 without advancing to T7 load testing or T8 global audit. T4 logging and T5 admission behavior are preserved. No deployment, production database, external service, commit or infrastructure change is performed.

## Runtime behavior

| Boundary | Result |
|---|---|
| `/api/live` | Process liveness, HTTP 200; not a database readiness claim. |
| `/api/ready`, `/api/health` | HTTP 200 only with a responding, writable transaction-capable MongoDB and required unique indexes. Otherwise HTTP 503 with `NOT_READY`; no credential/error details. All health responses are `no-store`. |
| Startup | Connection and model index initialization complete before persisted-room recovery, cleanup scheduling and listener startup. Failure exits unsuccessfully rather than accepting players. |
| Mongo authentication | Checked using synthetic credentials against an isolated authenticated replica set; wrong credentials rejected. No real credentials inspected. |
| Production browser API/Socket.IO | Same-origin base, including when a stale development `VITE_BACKEND_URL` was configured. The public frontend must be served over HTTPS; Socket.IO then uses WSS. |
| Public CORS | Explicit HTTPS origins only; no wildcard. Proxy hops must be a nonnegative decimal integer, not silently truncated. |
| Production media | `LOCAL_TV` is disabled in production builds. The requested LOCAL_TV source is retained but rendering is blocked with a visible warning and no media URL; there is **no automatic SERVER fallback**. SERVER requires explicit organizer selection and authorized/synthetic assets. Real browser/OS/HTTPS loopback certification is not claimed. |
| Development LOCAL_TV | Still available for synthetic, authorized media and a trusted loopback host. Only the exact configured browser origin is allowed; originless local tools remain usable. This is not per-TV user authentication. |

Readiness checks do not create data or indexes. Startup initializes model indexes according to Mongoose configuration. If automatic indexing is disabled, operators must provision the documented indexes through a separately authorized maintenance process; readiness remains false until they exist. The checks have bounded driver operation timeouts.

## Local media confinement

The manifest generator skips symbolic links. The local server rejects symlinks in any path component, verifies canonical root confinement, opens the file with `O_NOFOLLOW`, validates descriptor identity and streams from that descriptor. File and directory symlinks introduced after startup return 404 without the outside canary bytes. Traversal manifests fail before opening a listener. Existing GET, HEAD and byte-range playback continue to work.

The root must be owned by a trusted operator and must not be concurrently writable by an adversary. This is not an OS sandbox or a defense against a hostile local administrator replacing directory trees. No local filesystem content or media is uploaded by these changes.

## Focused verification

```sh
node --test tools/local-tv-media-server.test.mjs
cd backend
./node_modules/.bin/jest --runInBand --no-cache tests/readiness.test.js tests/mongoReadinessIntegration.test.js tests/networkPolicy.test.js tests/tvAuthorization.test.js tests/roomHostCapability.test.js tests/playerSocketOwnership.test.js tests/challengeVotingOwnership.test.js tests/tvMediaStatus.test.js tests/connectionDisclosureSecurity.test.js
```

The Mongo fixture creates its own loopback-only authenticated single-node replica set, database and indexes. It tests missing indexes, rejected authentication, disconnect/reconnect persistence, actual isolated startup, and principal plus temporary TV coexistence/replay/revocation without creating Player memberships. Credentials are synthetic. It never accepts a production URI or reads `.env`.

Frontend targeted tests cover local media, diagnostics, effective production policy and same-origin API resolution. ESLint and a production Vite build are checked with an empty temporary `envDir` and fictional HTTPS origin, without loading repository environment files. The compiled JavaScript is scanned for visitor-localhost backend URLs. The verification build bypasses the development/preview-only Vite media middleware, so it does not certify the preview server or Nginx runtime.

## Remaining prerequisites — not a deployment approval

- Production MongoDB must support transactions and required indexes. The existing rehearsal Compose file still declares standalone MongoDB: do not use it unchanged for T5/T6 admission or T7 transactional tests. No persistent-volume migration is authorized here.
- Actual TLS termination, domain, reverse-proxy hop count, firewall and service isolation remain infrastructure checks. The production Compose file exposes only frontend port 8080 (bound to all interfaces by default); an operator must keep it private behind HTTPS. Backend and Mongo must not be publicly published.
- Nginx was inspected structurally only: `/api` and `/socket.io` proxy to the private backend and `/uploads` remains denied. The pre-existing missing runtime verifier/image remains unresolved; no container or image download was attempted.
- LOCAL_TV stays blocked without central fallback for production pending a separately scoped, real browser certification and playback authorization design. Its development service is not a public media distribution service.
- S7 focused permission/ownership/event-routing regressions are not 50/500-player throughput proof. Larger multi-room reconnection/load testing belongs to T7, which is not executed in this task.

Verified outcome: 10 backend suites / 83 tests, 5 frontend files / 20 tests, 2 Node media tests, ESLint and a fictional production build passed. Independent review's malformed partial-index readiness finding was reproduced, fixed and independently rechecked (1 passed, 4 skipped by test selection). The parent spot-check passed too. GO for isolated T7 using a disposable transactional fixture; NO-GO for unchanged standalone Compose or deployment. Exact commands and evidence are in L14 of `odd/tasks/bingo-m6-stabilization.md`.
