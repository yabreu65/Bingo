# Private staging proposal — NO-GO pending review gates

**Decision: NO-GO for deployment today.** The package now includes a draft first-run/restart bootstrap for an authenticated single-node Mongo replica set and app user. It has only static checks; it has not been run against Docker or Mongo. Do not treat it as production-ready or start services until the gates below are approved and the bootstrap is tested in an isolated disposable environment. Use synthetic data only. Backups and a successful restore remain pending.

## Proposal at a glance

| Boundary | Proposal | Still required |
|---|---|---|
| Mongo | Mongo 7 is pinned directly in Compose as `mongo:7.0@sha256:e634fcaae4d0915b365fb88c076dd33c851ed61a611c7ee9816aba6d6b5159cd` for `linux/amd64`; `pull_policy: never`; keyfile internal auth; one-member `bingo-rs` at stable Compose DNS `mongo:27017`; separate root identity and `readWrite` app identity scoped to `bingo_private` | Review target-architecture digest/entrypoint; preload image out-of-band; securely provision keyfile and credentials; exercise first-run/restart tests in isolation. |
| Bootstrap | Official image first-run creates root; one-shot `mongo-bootstrap` authenticates as root, initiates/validates the one-member set, waits for primary and creates/verifies the app user. Bootstrap fails closed and emits generic errors only. | Not runtime-verified. Existing data/config mismatch, auth failure, changed app roles or unavailable primary stops startup; it does not repair or weaken auth. |
| Indexes/readiness | Backend waits for Mongo health and successful bootstrap. Backend startup initializes model indexes; `/api/ready` checks primary/replica-set state and required unique indexes before serving healthy. | Verify on a disposable replica set that models are loaded and all index definitions build successfully. |
| Private ingress | Dedicated Traefik file-provider instance on host loopback port `18443`; host Tailscale Serve would forward private HTTPS to `http://127.0.0.1:18443`. | Tailscale was absent/inactive on the inspected VPS. Do not change public Traefik or create an Internet TLS route. Test the Serve→Traefik→frontend Nginx→backend trust chain and exact `TRUST_PROXY_HOPS`. |
| Clients | Each organizer/phone/TV needs an approved compatible Tailscale client and tailnet authorization. | A TV without tailnet access cannot connect. Any private gateway alternative needs separate approval/design; no public-route bypass. |
| Exposure | Mongo and backend have no host-published ports; Mongo/backend are on internal networks; only Traefik binds `127.0.0.1`. | Tailnet ACL/Serve policy and local-host access remain part of the boundary. |
| Resources/data | CPU, memory and JSON log rotation are bounded per service. | Limits are provisional. Named local volumes have no enforceable quota here: storage quota for Mongo/uploads/logs is a hard prerequisite. Automatic backups/restore are pending. |

## Mongo bootstrap design and operator prerequisites

`ops/private-staging/compose.yaml` uses the official `mongo:7.0` entrypoint on first initialization: it receives the root username/password, performs its temporary initialization phase, creates the root user, then starts `mongod` with `--auth`, `--keyFile`, and `--replSet bingo-rs`. The temporary initialization phase must remain loopback-only as implemented by the official entrypoint. The image content is pinned to the Linux/amd64 child digest recorded in `ops/private-staging/m6.2-image-lock.json`; this does not establish support status or vulnerability posture. Review the exact image entrypoint and lifecycle before any use.

The keyfile is a read-only bind mount, **not** a Compose file-backed secret: local Compose's file-secret mount cannot reliably enforce ownership/mode. Before any deployment, the approved secret mechanism must materialize `ops/private-staging/secrets/mongo-keyfile` on the daemon host with restrictive permissions (mode `0400`) and ownership matching the `mongodb` UID/GID of the exact pinned image. Verify metadata without displaying file contents. The source file must already exist; Compose is configured not to create it. Do not put the keyfile in Git, command arguments, logs or this package.

Set the required Compose interpolation values only through an approved protected secret mechanism: `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`, `ALLOWED_ORIGINS` and `TRUST_PROXY_HOPS`. Never read an existing environment file for this task. The Mongo official entrypoint requires root credentials as environment values; backend and bootstrap also receive their needed values in environment. Privileged host users/container inspection may see these values, so a mechanism that accepts this exposure is a prerequisite. Never put secret values in command arguments or print resolved Compose configuration.

The app URI must be a percent-encoded URI with scheme `mongodb:`, host `mongo:27017`, database `bingo_private`, `replicaSet=bingo-rs` and `authSource=bingo_private`. Bootstrap parses that URI without logging it, creates the URI's user only if absent, requires exactly the `readWrite` role on `bingo_private` if it already exists, and verifies its credentials. The app identity is not the root identity. Do not reuse a volume initialized by another project or change credentials to make a failed bootstrap pass.

### First start (future, separately authorized)

1. Review the locked Mongo image's entrypoint temporary-init behavior, support status, security posture and runtime UID/GID. Confirm storage quota, secret delivery, resource headroom, backup/restore plan, tailnet policy and all approval checklist items below.
2. Provision the keyfile and credentials out-of-band. Check keyfile owner/mode without revealing contents. Do not stage the keyfile or create secrets in the repository.
3. In a clean, dedicated project environment, review the fully resolved Compose plan only using an approved method that does not expose values in captured output. Verify it refers only to the `bingo-private-staging` project and its fresh volumes.
4. After explicit deployment approval, the documented `compose up -d --build` starts Mongo and the one-shot bootstrap. Bootstrap authenticates as the root user, initiates `bingo-rs` with the reachable member `mongo:27017` if and only if no replica-set config exists, waits for a writable primary, and creates/verifies the least-privilege app user. Backend waits for Mongo health and bootstrap success, then initializes model indexes and becomes healthy only when `/api/ready` passes.
5. Validate `/api/ready`, WSS, private ingress, direct backend/Mongo inaccessibility, and negative cases (wrong credentials, absent keyfile, missing indexes, Mongo unavailable). These tests are not certified by this static proposal.

### Restart and failure behavior

On an existing data volume, the official entrypoint does not rerun first-init user creation. Mongo starts with keyfile auth and the persisted replica-set config. The bootstrap one-shot is idempotent for the expected one-member config and existing `readWrite` app user; it verifies rather than rotates credentials. A different replica-set name/member, bad credentials/roles, or a missing/unusable keyfile must fail closed and require an independently reviewed recovery procedure. Do not delete data or silently reconfigure the set to recover. Backend startup waits for bootstrap and Mongo health; its own model initialization/readiness checks ensure required indexes exist.

Backend readiness currently requires unique `players` indexes on `(room, admissionTokenHash)` with partial filter `admissionTokenHash: {$type: "string"}`, `(room, cardNumber)` with partial filter `cardNumber: {$type: "number"}`, and unique `rooms.code`. `connectDB()` initializes loaded Mongoose model indexes before startup, and `/api/ready` checks the replica-set primary and those index definitions. Mongo bootstrap does not create application indexes. Missing/wrong indexes must keep readiness unhealthy; verify the actual model registration path in the disposable validation.

## Private ingress and device limits

HTTPS terminates at Tailscale Serve; the Serve→loopback Traefik→frontend Nginx→backend links are HTTP on local/private networks. Confirm the actual forwarded headers and proxy-hop count before setting `TRUST_PROXY_HOPS`; do not infer the value from this sketch. The Compose Traefik instance is separate from existing public Traefik and must never be changed into a public route. Do not use Funnel or expose a public TLS endpoint as a fallback. An unaffiliated TV or other device without an authorized tailnet client cannot access this topology.

## Resource, data and rollback boundaries

The Compose proposal bounds per-service CPU, memory, and Docker JSON logs. The values are provisional and need owner approval against existing co-resident workloads. There is deliberately no volume-size claim: local named volumes do not enforce per-project storage quotas. Enforceable quotas for Mongo data, uploads and logs are mandatory before start. Backups and restore verification are pending; never put production/personal data in staging.

After separate rollback authorization, the project-scoped `compose down` below stops/removes only resources tracked by this Compose project and preserves its named volumes. It is not a data-erasure command. No `down -v`, volume prune, global cleanup, shared Traefik change, or unrelated project command is allowed. Data disposal requires a distinct reviewed retention decision.

## Static review checks and future commands (not executed)

The static Compose check disables automatic `.env` loading and interpolation. The Node VM test mocks the public mongosh interface to cover transient `rs.conf()` failure after initiation, already-initialized configuration, and bounded retry exhaustion. The M6.1B runner test reads Compose and shell source as text; it never sources or invokes the runner. These checks prove neither the existence/permissions of the keyfile, credential correctness, entrypoint behavior, actual Mongo/bootstrap compatibility, network security nor service health. No Docker daemon, image download, container or service was used for this preparation.

```sh
# Offline structural validation only; safe with no secrets or .env reads.
COMPOSE_DISABLE_ENV_FILE=1 docker compose -f ops/private-staging/compose.yaml config --no-interpolate --quiet
node --check ops/private-staging/mongo-bootstrap.js
node --test ops/private-staging/mongo-bootstrap.test.js ops/private-staging/validate-mongodb-m6.1b.test.js
bash -n ops/private-staging/validate-mongodb-m6.1b.sh

# Future isolated validation only after separate runtime approval; not executed.
# The runner requires preloaded target-architecture digests and does not pull images.
# It does run npm ci in a temporary Node container on the bridge network.

# Future deployment after review gates and explicit approval; not executed.
docker compose -p bingo-private-staging -f ops/private-staging/compose.yaml up -d --build

# Future scoped rollback; not executed. Preserves named volumes and data.
docker compose -p bingo-private-staging -f ops/private-staging/compose.yaml down
```

Do not run `docker compose config` with interpolation to a terminal/log: it can disclose credentials. Do not execute deployment/rollback commands before approval, use a different project/file, or add broad options such as `--remove-orphans`. Never use `down -v`.

## Approval checklist

- [ ] Owner approves exact project, domain/origin, ingress, tailnet ACLs, ports, resource limits and maintenance window.
- [ ] Mongo image digest and official entrypoint behavior reviewed; runtime Mongo UID/GID confirmed for keyfile provisioning.
- [ ] Protected secret delivery is approved despite environment/container-inspection exposure; credentials and keyfile are absent from argv/logs/Git.
- [ ] Disposable first-run and restart tests prove the keyfile-authenticated one-member set, stable `mongo:27017` identity, root authentication, app-user least privilege and failure behavior; no unauthenticated externally reachable interval.
- [ ] Backend readiness/index checks pass against that replica set and fail closed when an index or Mongo is missing.
- [ ] Tailscale Serve is installed/active/authorized; organizer, phones and intended TV have approved clients/ACLs, or a private gateway is separately approved. No public TLS bypass.
- [ ] HTTPS/WSS, exact origin, proxy trust hops and denial of direct backend/Mongo access are tested; existing public Traefik remains untouched.
- [ ] Enforceable quotas cover Mongo, uploads and logs; resource headroom approved.
- [ ] Synthetic-only fixture plan, backups and successful restore test approved before any data requiring retention.
- [ ] Scoped rollback, retained-volume inventory and recovery owner approved.

## Scope

This follow-up covers S3 (bootstrap design, app identity, replica set, model indexes/readiness and health checks) and S5 (resource bounds, quota prerequisite, synthetic-only data, backup status and scoped rollback). After successful `replSetInitiate`, bootstrap retries `rs.conf()` up to 30 times at one-second intervals for transient NotYetInitialized (code 94), then fails closed; a returned but incorrect replica-set config is still rejected by the exact identity/member check. The seven pure Node VM cases cover retry success, already-initialized behavior, retry exhaustion, auth/role failures, redacted diagnostics and exit status. They do not start services, validate bootstrap against Mongo at runtime, audit secrets/history, certify ingress, provision infrastructure or authorize deployment/publication. S3 remains **prepared but unverified**; overall status remains **NO-GO**.

## M6.1B runner: scope and gates

`ops/private-staging/validate-mongodb-m6.1b.sh` is a new persistent runner; it does not recreate the deleted Job-5. Do not execute it as part of static validation. Its `M61B_RUNTIME_APPROVED=YES` flag is only an accidental-run guard—not owner consent or deployment authorization.

When separately authorized, it requires already-loaded immutable Mongo and Node image digests for the target architecture, a local Linux Unix-socket Docker context, Docker storage on the same filesystem as the repository, and the six protected containers healthy. Docker CLI calls run with a sanitized environment and a context pinned after local-endpoint validation; Compose interpolation uses only the generated private env file. It creates a unique Compose project and random validation ID, labels `/data/db`, `/data/configdb`, the database network and test containers with that ID, and generates a temporary keyfile and synthetic credentials. It checks keyfile UID/GID and mode `0400` inside the pinned Mongo image before starting Mongo; Mongo then must pass authenticated ping before the one-shot bootstrap runs. It starts only Mongo/bootstrap plus the backend source in a separately labelled container on the internal database network; it does not start frontend or ingress and does not build the Compose backend image.

The probe environment containing the root credential is separate from the backend process environment. The isolated Mongoose probe checks positive/negative root and app authentication, `connection.transaction()` commit/rollback, `/api/ready` before/after Mongo stop/restart, and committed-record persistence. Cleanup requires a complete pre-run inventory and successful candidate enumeration, then matching project, owner and per-run validation labels plus absence from the baseline before removal. Any baseline, candidate-list or label-inspection failure blocks deletion; the first cleanup failure stops later resource classes, and mounted volumes are refused. A failed temporary-workdir removal is reported as cleanup failure with its path rather than counted as success. Docker inventories and `docker system df` are retained until comparison; failure evidence contains only sanitized inventory snapshots, including the system-df baseline. The runner does not pull images, prune resources, or remove preloaded images.

Limits are a 15-minute overall budget, command-specific timeouts, at least 10 GiB free on Docker storage, at most 5 GiB observed disk growth, and per-container CPU/memory caps. **These are not per-volume quotas.** Compose local named volumes still have no enforced size limit; a hard quota for Mongo data/logs remains a deployment/runtime NO-GO gate. The runner also executes `npm ci --omit=dev` in a temporary Node container using the bridge network, so a future run may fetch package tarballs even though it never downloads images. Obtain separate approval for that network use or prepare a reviewed offline dependency source first.

A future runtime result can be considered only after the target image digests/architecture, quota mechanism, headroom, protected-service inventory, synthetic-only test data, secret handling, backup/restore plan, and owner authorization are reviewed. This runner does not access Contabo, alter shared services, verify production ingress, or authorize staging deployment. Current state remains **NO-GO**.
