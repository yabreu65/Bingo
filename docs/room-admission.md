# Atomic guest admission (M6 T5)

New rooms default to **51 total members: one organizer and 50 guests**. Digital and paper guests share those 50 places. TV sockets are not members. Existing explicitly stored `config.maxPlayers` values retain their total-member meaning; a historical limit of 50 still allows 49 guests, unless the organizer explicitly raises it to 51. No persistent data migration is executed automatically.

## Admission and recovery

1. The browser generates 32 cryptographically random bytes and persists `<ROOMCODE>.<base64url secret>` under `bingo-admission:<ROOMCODE>` in localStorage **before** sending a join. Storage failure stops admission. Web Locks is required to serialize **new** key creation across tabs. Without Web Locks, creation fails closed before the POST and the UI explains the browser/secure-context requirement; an already persisted valid key can still recover its guest. Use a modern browser on HTTPS or a trusted localhost origin. There is no non-atomic localStorage creation fallback.
2. `POST /api/rooms/join` accepts `{ roomCode, playerName, admissionToken }`. Missing/malformed tokens or another room's prefix return 400. Send the token only in the JSON body, never in a QR, URL, analytics or logs. A QR contains the room identifier, not a credential.
3. MongoDB atomically checks total digital plus manual occupancy, appends the member, and saves the Player in one transaction. An aborted insert leaves neither a Player nor an occupied slot. Transient transaction conflicts retry through the MongoDB driver, not a process-local mutex.
4. The same room/token returns the same Player and guest capability, even if the room is full or the first HTTP response was lost. The server does not rename the existing Player. Selecting the same card preserves its marks; join recovery returns the stored card. QuickJoin skips reselection when a stored card already exists.

The server stores only SHA-256 token hashes, with a partial unique `{room, admissionTokenHash}` index. Legacy players without this field are excluded. Guest capabilities are derived with a domain-separated HMAC keyed by the browser secret, bound to room and player; their existing authorization hashes remain in use. The admission token is **not** accepted as a host, TV or player action credential. Recovery refuses detached membership or a rotated player credential.

The token is a bearer recovery secret. A different randomly generated key cannot access someone else's identity; deliberate theft of the exact key can recover that guest. localStorage has the same XSS exposure as the existing saved guest session. Use HTTPS, trusted same-origin scripts and a private browser profile. Do not clear storage to retry. Clearing site storage loses this recovery key; it must not silently match someone by name.

## Manual guest policy

- Paper guests consume the same guest quota as digital guests.
- Only the organizer-authorized manual route admits them.
- Manual cards remain in 186–200. Card reservation and manual membership are committed together in a single atomic room update inside a transaction.
- Digital and manual card selection serialize through writes to the same Room document; a card cannot belong to both. Repeating an already assigned manual card returns 409 without consuming another place.
- Manual removal uses `$pull`, not replacement of stale arrays; concurrent admissions are preserved.
- Lowering capacity below occupied membership is rejected with 409 using an atomic predicate.

## Deployment prerequisites (not executed here)

MongoDB **must be a replica set or sharded deployment supporting transactions**. Standalone operation fails closed with 503; there is no unsafe non-transaction fallback. Provisioning or converting a real database requires a separate infrastructure decision and backup plan. No Contabo changes are part of T5.

Before admitting traffic, create the new partial unique index from `backend/models/Player.js` (Mongoose `Player.init()` builds it when automatic indexing is enabled). With automatic indexing disabled, explicitly create the equivalent index in an authorized maintenance window. Do not drop/rebuild unrelated indexes or delete data. Existing card uniqueness remains unchanged.

Deploy the updated frontend and backend together: older admission clients without `admissionToken` receive 400. Previously issued guest capabilities continue to reconnect existing players without an admission token; no legacy player's identity is inferred from a name or imported browser token. Historical manual guests continue to count toward occupancy.

## Reproducible isolated checks

```sh
cd backend
./node_modules/.bin/jest --runInBand --no-cache tests/admissionConcurrency.test.js
./node_modules/.bin/jest --runInBand --no-cache tests/playerCapabilitySecurity.test.js tests/roomHostCapabilityRoutes.test.js
```

The concurrency suite starts its own loopback-only single-node disposable MongoDB replica set and HTTP server on ephemeral ports. It never reads `.env`, accepts a persistent MongoDB URI, or contacts production. Only its uniquely created temporary data directory is removed. MongoDB's test failpoint injects a real insert failure, then is disabled in `finally`.

See `odd/tasks/bingo-m6-stabilization.md` for observed results and limits. Local concurrency measurements are not Contabo capacity claims. T4 logging work and unrelated M6 tasks are outside this change.

## Verified T5 baseline (historical, not rerun for T6)

T5 closed with 5 backend suites / 69 tests (including 11 real disposable Mongo scenarios), 14 frontend files / 44 tests, ESLint and Vite build passing. Two high-risk stale-write findings were corrected and independently rechecked. Exact commands, measurements and final Mongo state are in L8–L11 of `odd/tasks/bingo-m6-stabilization.md`, mirrored in Engram observation 3654. T6 does not change the admission implementation or repeat its 50/100-request load merely to reconfirm this evidence.
