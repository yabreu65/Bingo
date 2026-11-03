# Private Contabo staging — plan only, not executed

**Current execution status: NO-GO.** This document authorizes nothing. M6's measurements are local; neither 500 users nor HTTPS/WSS, Nginx, real browser playback or VPS capacity is certified on Contabo. No SSH, deployment, DNS, firewall, container or database change was performed during T8.

## Separate authorization required

Before provisioning, the owner must approve the exact isolated project, private ingress, ports, resources, database topology, secret delivery, rollback and maintenance window. VPS access requires the owner's separately approved access procedure.

1. **Read-only preflight:** inventory current services, ports, disk/RAM and backups. Choose a new project/network and non-conflicting loopback frontend port; do not alter existing PawTech or other applications. The current production Compose publishes frontend 8080 on all interfaces by default and is not a private staging security boundary.
2. **Dedicated disposable data:** provision a new authenticated MongoDB replica set for synthetic staging data. Do not reuse production URIs, credentials, volumes or the old local failed-test residue. A single-node replica set enables transactions but does not provide high availability. The existing rehearsal Compose uses standalone MongoDB and must not be run unchanged. Any conversion of a persistent database requires its own backup/migration/rollback authorization; it is not part of this plan.
3. **Indexes and readiness:** create/verify the unique room-code index and the precise partial unique Player indexes for admission-token strings and numeric cards. With automatic indexing disabled, explicitly provision them in the new database. `/api/live` is process liveness, not permission to admit guests. `/api/ready` and `/api/health` must return 200 only with usable transaction-capable Mongo and the required index definitions; missing/wrong indexes and disconnection must return 503.
4. **Private HTTPS ingress:** bind the frontend to loopback/private networking and expose it only through an owner-approved VPN, IP allowlist or authenticated private ingress. Keep Node and Mongo ports unexposed. Obtain and verify the chosen TLS domain/certificate. Validate Nginx configuration in the isolated runtime before routing traffic. None of this was runtime-tested in this audit because the local Nginx verifier/image was unavailable; no image was downloaded.
5. **Explicit environment:** supply new secrets through the approved secret mechanism, never commits or logs. Required configuration names include `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`, `BINGO_ACCESS_MODE=public`, exact HTTPS `ALLOWED_ORIGINS` and validated `TRUST_PROXY_HOPS`. Derive the hop count from the actual edge → frontend Nginx → Node topology; do not blindly copy 1 when more than one trusted proxy exists. Production API and Socket.IO use the browser's origin; confirm WSS and prevent direct backend access.
6. **Synthetic/authorized media only:** keep production `LOCAL_TV` blocked until a separate real-client certification. It does not automatically fall back to SERVER. Select SERVER explicitly only for assets authorized for server distribution; do not upload the operator's private/commercial media library. Keep `/uploads` denied by the proxy and backend; recording streams require the existing authorization route.
7. **Bounded private smoke:** verify health/readiness transitions, organizer and guest capabilities, 50-person quota, one-time TV claim/revoke, recording denial/authorized access, same-origin API/WSS and reconnect using modern HTTPS browsers with Web Locks. Measure actual VPS CPU/RSS and network before any larger load. Test failure is NO-GO, not justification to weaken auth, CSP, loopback or database guards.
8. **Rollback scope:** record every newly created resource and the exact revision/image identity. Stop or remove only that new isolated project when separately authorized. Never use a global prune, broad volume deletion, reset, or cleanup of unrelated/old residues. Do not remove any existing persistent data.

## Evidence still required before execution or broader exposure

- Approved private ingress and ownership of the TLS domain.
- Resource and port headroom alongside existing services.
- Authenticated transaction-capable staging Mongo with exact indexes and isolation.
- Runtime Nginx validation, HTTPS/WSS, proxy-hop and origin checks.
- Actual browser admission/reconnect and synthetic TV playback on target hardware.
- Reviewed rollback and secret delivery.

A GO for reviewing/publishing selected source files is not a GO for this infrastructure work. No automatic progression toward staging or production is permitted.
