# Contabo temporary Bingo trial — gated runbook

**Status: RESOURCE PREFLIGHT, LOCKFILE INSTALL, AND `$2b$12$` COMPATIBILITY CHECK PASSED; RUNBOOK VALIDATOR UPDATED; PROTECTED FILE CREATION AND METADATA PASSED; PRE-PULL GATE PASSED; AUTHORIZED NODE/NGINX PULLS AND POST-PULL GATE PASSED; QUIET COMPOSE CONFIG VALIDATION PASSED; COMPOSE BUILDS PASSED; MONGO-BOOTSTRAP STARTUP RACE DIAGNOSED (L74); LOCAL FIX/STATIC VERIFICATION PASSED (L75-L78); CORRECTED CONTABO OVERLAY INSTALLED WITH EXPECTED SHA-256 (L80); `CONFIG --QUIET` PASSED; L81/L90 root-auth failures were false negatives from comparing auth results to numeric `1`; L91's corrected read-only probe returned `{"ok":1}`. The corrected bootstrap and healthcheck have been installed through the protected SSH/Node writer; quiet Compose config validation passed, and only Mongo was recreated on the existing `_reinit` volumes. Mongo bootstrap passed; Mongo is healthy and `bingo-rs` reports PRIMARY. Root auth is `{ok:1}`; app auth and the `readWrite@bingo_private` role pass. The pre-app resource gate passed (load1 1.12, MemAvailable 22.32 GiB, `/srv` free 69.60 GB, 20 other services running with none unhealthy/restarting, exact six Bingo volumes). Backend/frontend now run healthy; unauthenticated HTTPS returns 401. L99 preserves stage 10 as a failure under its original strict criterion: all 10 dispatches fit the window, but player 10's full confirmation arrived at 10,692.28 ms. L100 authorizes stage25 then conditional stage50; L101 stage25 dispatched and confirmed 25/25 with 25 unique cards, no errors/disconnects, and completed the 300-second hold. Dispatch passed 30s; final confirmation at 30,506.46ms missed the strict 30s confirmation deadline by 506.46ms. Post-stage gates passed without degradation; stage50 job `job-28` failed: all 50 confirmed after 60 seconds, then 50 unexpected WSS disconnects left zero active sockets before cleanup. See L103; no further load under the L98 stop rule. L99's stage10 result remains unchanged. Preserve all existing resources and shared services.**

**Current outcome (L106):** The only actual 50-player diagnostic completed with 50/50 unique cards and all 50 sockets stable through the 300-second hold, zero unexpected disconnects, but final card/WSS confirmation was 61,086.93ms (1,086.93ms late), so `success=false`. L31 host guard emitted no STOP. No further load is authorized. One instantaneous backend CPU sample was 153.80% against a nominal 150% quota; this is a possible excursion, not a verified peak. Independent L105 clearance remains unavailable and accepted only as a limitation, not approval.

L86 authorized Phase 1 review and staged continuation after an authorized Mongo resolution; L89 then authorized a fresh-volume cutover while preserving the original pair and backup. The 469-byte fresh-volume overlay was transferred and installed in the existing release at mode `0644`; remote `docker compose config --quiet` passed. Compose created only the two new Mongo volumes and recreated/started only the Mongo container. The old volumes and cold backup remain. L90: Mongo is running but unhealthy; the init-complete marker did not appear during a bounded 60-second wait, and a direct root-auth probe failed. Stop before bootstrap/app; no smoke/load/cleanup. The original verifier's path mismatch was traced to the embedded `MANIFEST.json` being the one extra file. The one-shot revalidation passed: it allowed only that self-manifest outside its own `files` list, verified its size/SHA-256 with modes checked separately (`0644` embedded, `0600` sidecar), and checked all 262 listed files plus the separate overlay. The first targeted snapshot command stopped because SSH UID 1000 cannot list the intentionally restricted `0711 root:root` project root. After explicit owner authorization, the corrected read-only snapshot passed using the pinned Mongo image in a project-labeled, resource-capped, `--network none` helper with a read-only `/srv` mount. Gate results: load1 `1.15`, MemAvailable `21.03 GiB`, `/srv` free `66.55 GiB`, Bingo tree `4.09 MiB`, Mongo image `0.28 GiB`; 20 co-resident containers running, none unhealthy/restarting, and `pawtech_public` present. At L59 no Bingo containers/volumes/networks or secret files existed. The later authorized writer created only the protected Bingo files documented at L69. The Compose attempt created Bingo-only networks/volumes/containers; Mongo started, `mongo-bootstrap` exited 1, and backend/frontend were not started (L74). Preserve resources; no smoke/load. Secret generation initially paused because `backend/node_modules/bcryptjs/umd/index.js` was absent; the owner then authorized a lockfile-based local restore. The owner selected “Autorizar npm ci lockfile,” authorizing one local `npm ci --ignore-scripts` from the existing backend lockfile, replacing only `backend/node_modules`; no manifest/lockfile edits or remote writes. The authorized local `npm ci --ignore-scripts --no-audit --no-fund` exited 0; bcryptjs `3.0.3` passed a local synthetic hash/compare self-check, and package manifest/lockfile diffs are clean. The original `$2a$12$` check failed because bcryptjs `3.0.3` emits the verified 60-character `$2b$12$` format. Official Traefik v3.7.0/go-http-auth/Go bcrypt source review and the local synthetic shape check passed (task log L65-L66). The writer's strict validator now requires exactly 60 characters and the `$2b$12$` prefix. No real hash was printed/persisted. Remote writer job `job-9` exited 0. Metadata only: secrets directory `0700 1000:1000`; both shell env files `0600 1000:1000`; Mongo keyfile `0400 999:999` (`KEYFILE_UID_MODE_PASS`). No app-image pull or application service has started. The fresh post-secret/pre-image gate passed at L70: load1 `0.86`, MemAvailable `20.94 GiB`, `/srv` free `66.55 GiB`, Bingo tree `4.10 MiB`, Mongo image `0.28 GiB`, and 20 co-resident containers running with none unhealthy/restarting. Job `job-10` exited 0 after pulling only the exact authorized Node and Nginx digests. Sizes: Node `0.06 GiB`, Nginx `0.02 GiB`, Mongo `0.28 GiB`. Post-pull gate passed: load1 `1.44`, MemAvailable `20.92 GiB`, `/srv` free `66.33 GiB`, Bingo tree `4.10 MiB`, 20 running, none unhealthy/restarting, no project-labeled Bingo containers/volumes/networks. No app service or deployment has started. Quiet Compose config validation with Bingo's protected environment passed (`COMPOSE_CONFIG_QUIET_PASS`, L72). Job `job-11` exited 1 after both images built; `mongo-bootstrap` failed before Mongo accepted TCP. Read-only project-scoped state/log inspection and Compose-source review strongly indicate a startup race: bootstrap depends on `service_started`, while the Mongo healthcheck needs the replica set that bootstrap initializes. The runbook treats a failed bootstrap as a stop/report gate. The owner selected the separate Contabo overlay startup-wait correction and “luego revalidar” (L75); following local verification, only that overlay was transferred to the existing Bingo release and quiet Compose config passed (L80). The targeted bootstrap command returned 0 while its one-shot container exited 1 with `root-authentication/root-auth-failed`; a corrected read-only probe confirmed local ping passes but root authentication fails (L81). Mongo remains running/unhealthy; backend and frontend remain Created. Earlier malformed probes using a Mongo URI with `mongosh --host` are inconclusive. Do not retry bootstrap, alter credentials/database, start app services, or run smoke/load. The owner selected “Mantener el trial bloqueado” (L82). Preserve the listed resources and keep M6.2/shared services unchanged; do not retry bootstrap, repair credentials, start app services, run smoke/load, or clean up. Any future recovery or retirement requires new explicit owner authorization. Raw Mongo logs surfaced a synthetic privileged account identifier in tool output; no password, hash, URI, or keyfile value was exposed, and the identifier is recorded nowhere here. The SSH account cannot write `/srv`; no other-project secrets were accessed.

## Historical blocked-state inventory (L82; superseded by L90)

This records the pre-reinitialization state. L85's hold was narrowed by L86 and L89; the current runtime inventory and stop gate are recorded at L90 below. Current observed Compose project `bingo-contabo-trial-020d654` containers: `bingo-contabo-trial-020d654-mongo-1` (running, unhealthy), `bingo-contabo-trial-020d654-mongo-bootstrap-1` (exited 1), `bingo-contabo-trial-020d654-backend-1` (Created), `bingo-contabo-trial-020d654-frontend-1` (Created). Compose network keys: `ingress`, `application`, `database`. Named-volume keys: `mongo-data`, `mongo-config-data`, `uploads`, `backend-logs`. Protected files remain in `/srv/bingo-contabo-trial-020d654/secrets`: `compose.env.sh` and `client-auth.env.sh` (`0600`), `mongo-keyfile` (`0400`), directory `0700` (metadata last verified at L69; do not read values). Release: `/srv/bingo-contabo-trial-020d654/m6.2-020d6542-ad8f6dbbc614`. The separate Contabo overlay SHA-256 is `4545718a1e981716510f05336ab9c4719164b629bd54584e0e2fe69fe0daeabe` (2614 bytes); M6.2 is unchanged. No smoke, staged load, device/reconnect checks, or load metrics were run because root authentication failed. Preserve the listed resources. Any recovery, retry, or retirement requires new explicit owner authorization.

## Current runtime inventory and stop gate (L90)

After the owner-approved fresh-volume cutover, Mongo container `bingo-contabo-trial-020d654-mongo-1` is `running`, `unhealthy`, exit code 0, restart count 0, and mounted on `bingo-contabo-trial-020d654_mongo-data-reinit` and `bingo-contabo-trial-020d654_mongo-config-data-reinit`. Both original volumes `bingo-contabo-trial-020d654_mongo-data` and `bingo-contabo-trial-020d654_mongo-config-data` still exist with matching Bingo project labels. The new volumes also have matching Bingo labels. `mongo-bootstrap` remains exited; backend/frontend remain Created. The verified cold backup remains present with directory mode `0700` and archive/manifest modes `0600`.

A bounded wait of 60 seconds did not observe the image's `MongoDB init process complete` marker; that command exited before attempting authentication. A separate direct root-auth probe then returned `ROOT_AUTH=FAIL`; the root-role query was therefore not reached. The job-18 read-only status check found no known keyfile-permission, dbPath-permission, or fatal markers in the last 200 log lines, but this classifier is not exhaustive. The exact cause remains unproven. Per L89, stop here: do not run bootstrap, start the app, smoke/load, alter credentials/auth, restart/recreate Mongo again, or remove/clear any volumes or backup. A new explicit owner decision naming an authorized recovery procedure was required at L90; L91 now authorizes only the focused auth-result correction and ordinary bootstrap/validation using existing credentials and the active `_reinit` volumes.

## Current runtime inventory and next gate (L93)

After L91, the Bingo Mongo container is `running` and `healthy`, mounted only on the active volumes `bingo-contabo-trial-020d654_mongo-data-reinit` and `bingo-contabo-trial-020d654_mongo-config-data-reinit`. The original volume pair and verified cold backup remain preserved. Job `job-19` exited 0 after printing `Mongo private-staging replica set and least-privilege app user are ready.` Job `job-20` verified root auth `{ok:1}`, `bingo-rs` PRIMARY, and Mongo healthy. The read-only app probe passed role `readWrite@bingo_private`, `authSource=bingo_private`, `replicaSet=bingo-rs`, and app auth. Backend/frontend are now running and healthy (restart count 0); unauthenticated HTTPS to the trial URL returns the expected 401. Post-app resource gate passed: load1 1.65, MemAvailable 22.41 GiB, `/srv` free 69.60 GB, 20 other containers running/0 unhealthy or restarting. The first positive-auth launcher failed before Node because workstation Bash lacked `mapfile` (L95); the wrapper was corrected and synthetic splitting tests passed. One-player smoke job `job-22` then passed: 1 dispatched/confirmed, 1 unique valid card, all confirmation within the 10-second window, WSS active, zero unexpected disconnects, and no errors. The real `/api/rooms/join` path calls `admitGuest()` via `mongoose.connection.transaction()` and card selection uses the same transaction helper, so the smoke exercised transaction commit paths. Staged load remains pending.

A corrected read-only root-auth probe using the actual `mongosh` result passed and reported only `ROOT_AUTH_RESPONSE={"ok":1}`; no credentials were printed. A full comparison of the local and deployed `ops/private-staging/compose.yaml` found exactly one difference: the remote Mongo healthcheck compares the entire `auth(...)` result with numeric `1`, while local checks `.ok !== 1`. The remote file's other settings match the local file. Local `mongo-bootstrap.js` accepts numeric `1` or object `{ok:1}` for root and application auth, rejects failed results, and the local healthcheck uses the `.ok` field.

Local focused bootstrap+Compose tests passed 13/13 after adding the object-shaped app-auth failure and healthcheck assertions. The remote bootstrap and healthcheck were updated with exact old-content preconditions and post-write checks; the remote Compose file differed only at the auth predicate. `docker compose config --quiet` passed. Only Mongo was recreated; active `_reinit` mounts and the six-volume Bingo inventory were preserved. The corrected root probe returned `{"ok":1}`, app authentication/least-privilege role passed, and Mongo is `healthy` with `bingo-rs` PRIMARY. Pre-app host gate: load1 1.12, MemAvailable 22.32 GiB, `/srv` free 69.60 GB, 20 other services running and none unhealthy/restarting. Smoke metrics from job `job-22`: room setup 888.36 ms; end-to-end confirmation 2,397.64 ms; join p50 751.95 ms; card p50 582.87 ms; WSS p50 1,062.44 ms; 1 active socket before cleanup; zero errors/disconnects. Basic Auth succeeded for API and WSS. L99 preserves the original stage-10 strict-window failure: all dispatches fit 10 seconds, but player 10's full card/WSS confirmation took 10,692.28 ms. L100 now authorizes a new stage-25 run and conditional stage 50 using separate dispatch and confirmation metrics. No stage after L99 has started yet. Refresh Mongo/app/host/co-resident-service gates before stage 25; preserve the running trial, credentials, both volume pairs, and cold backup.

## Scope and fixed identities

- Verified source package: `m6.2-020d6542-ad8f6dbbc614.tar.gz`, SHA-256 `11cb48a46007e71131bc33bbfa81679113b75f19aa1ff29bb3238514e728bbc2`, in `/private/tmp/bingo-m6.2-release-020d654/` with its `MANIFEST.json` and `SHA256SUMS` sidecar. Do not rebuild or alter the artifact.
- Candidate HTTPS origin: `https://bingo.31.220.98.21.sslip.io`.
- Future Compose project: `bingo-contabo-trial-020d654`; proposed host root: `/srv/bingo-contabo-trial-020d654` (absent at the prior read-only preflight; recheck if and when authorized).
- The trial overlay adds a BasicAuth middleware only to the Bingo frontend router on existing Traefik. It is a separate operational sidecar, not part of the immutable M6.2 archive; transfer and verify that file separately without rebuilding/repacking M6.2. Mongo and backend remain private; do not modify/restart global Traefik or other services.
- This is distinct from `docs/m6-private-staging-runbook.md`, which describes a separate private/Tailscale design and remains NO-GO. Neither document authorizes deployment.

## Mandatory gates before any runtime action

Reconfirm all gates using read-only checks after runtime authorization; prior observations can become stale:

1. L25 explicitly authorizes the temporary deployment, functional smoke, and staged 10/10s, 25/30s, 50/60s load. L29 narrowly authorizes pulling only the three locked image digests below and npm registry access only for existing lockfile-driven `npm ci`. No other downloads or retirement/removal are authorized. Do not extend to unrequested work.
2. Project/container/volume/network ownership and route collision checks are clean. Recheck DNS, HTTPS/TLS resolver behavior, existing `pawtech_public`, Traefik entrypoints, disk, RAM, CPU, and co-resident workload. Do not change global Traefik.
3. Use only the verified package and synthetic records/media. Provision fresh project data; never reuse another project's volume.
4. L33 authorizes new Bingo-only credentials and the host keyfile at `/srv/bingo-contabo-trial-020d654/secrets/mongo-keyfile`; do not read any other project's secrets. The SSH identity is UID/GID `1000:1000`, `/srv` is `root:root` `0755`, and direct writes plus `sudo -n` are unavailable. Pull only the pinned Mongo image after other read-only gates, then use the labeled `--network none` helper below to create only this project's directories and identify the exact image `mongodb` UID/GID. After generating the Bingo keyfile with the protected writer, use the same isolated helper to verify its owner/mode metadata without reading its contents; complete this check before starting any application service. The Bash environment files must be owned by UID 1000, mode `0600`, in a mode `0700` directory; keep the Compose variables and external-client BasicAuth credentials in separate files. The keyfile must be owned by the pinned Mongo `mongodb` UID/GID and mode `0400`. Use the tested single-quoted shell environment file sourced by Bash; do not use Compose `--env-file` for a bcrypt hash because `$` interpolation changes it. Required Compose values include `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, `MONGODB_URI`, `MONGO_KEYFILE_PATH`, `JWT_SECRET`, `FRONTEND_URL`, `ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, `BINGO_TEST_HOST`, and `BINGO_TRIAL_BASIC_AUTH`. The proxy chain is Traefik then frontend Nginx; use `TRUST_PROXY_HOPS=2`.
5. The owner accepted supervised short-lived storage, not a hard quota, and selected the conservative host stop limits in L31. Stop immediately if `/srv` free space is below 10 GiB, observed trial growth exceeds 5 GiB, 1-minute load average reaches 6 on this 8-vCPU host, `MemAvailable` falls below 8 GiB, any service limit/restart condition is breached, or any service that was running at baseline becomes unhealthy/restarting/exited. Record a baseline and observe host load/RAM and existing-service status during and after every stage; compare Mongo/trial storage after each stage. These monitored limits are not quotas. Do not infer different limits from the old preflight snapshot.
6. The package has no image layers or `node_modules`. L29 authorizes network retrieval of exactly the three pinned base images shown below and npm registry access only for the existing backend/frontend lockfile-driven `npm ci`; no other image/package download is authorized. After read-only prechecks, pull only the pinned Mongo digest first because the protected-file helper must inspect its `mongodb` UID/GID. If that helper/mode check passes, provision Bingo secrets and then pull the pinned Node and Nginx digests; build with `--pull never`. `--pull never` does not make `npm ci` network-free. Stop if any digest differs or the build requests any unapproved network input.
7. Review the existing Mongo bootstrap/keyfile gates and secret exposure. The BasicAuth hash is placed in a Docker label and is visible to Docker administrators; use a dedicated temporary account/password, never reuse it, and do not print resolved Compose configuration or secret files.
8. Prepare the approved results location and retention owner. Do not remove containers, volumes, files, images, certificates, or access mappings without separate retirement authorization.

## Artifact transfer and verification (after targeted preflight)

L25 authorizes the trial transfer as part of deployment, after the requested preflight passes. Use the existing SSH alias `pawtech` (remote UID/GID `1000:1000`). The alias cannot write `/srv`; the exact pinned Mongo image is the only authorized root-capable helper. It must have `--network none`, resource caps, Compose project/owner/validation labels, and touch only `/srv/bingo-contabo-trial-020d654`. L29 does not authorize copying secret files or a `.env`; do not copy secrets with the package. Pull Mongo only after read-only gates, then create the Bingo-only transfer/release/secrets directories with the helper; `incoming`, release, and `secrets` are owned by UID/GID 1000, mode `0700`, while the project root is root-owned mode `0711`. Run the local commands from the repository root:

```bash
# Verify the existing immutable artifact and the separate overlay file locally.
set -eu
REPO_ROOT="$(git rev-parse --show-toplevel)"
ARTIFACT_DIR=/private/tmp/bingo-m6.2-release-020d654
(cd "$ARTIFACT_DIR" && shasum -a 256 -c SHA256SUMS)
OVERLAY_SOURCE="$REPO_ROOT/ops/private-staging/compose.contabo-trial.yaml"
OVERLAY_SHA256="$(shasum -a 256 "$OVERLAY_SOURCE" | awk '{print $1}')"

# COMPLETED at L42: exact Mongo pull and protected-directory helper passed; do not rerun this initial pull/helper block.
SSH_TARGET=pawtech
MONGO_IMAGE='mongo:7.0@sha256:e634fcaae4d0915b365fb88c076dd33c851ed61a611c7ee9816aba6d6b5159cd'
VALIDATION_ID="$(ssh "$SSH_TARGET" 'openssl rand -hex 8')"
ssh "$SSH_TARGET" "docker pull '$MONGO_IMAGE'"
ssh "$SSH_TARGET" "docker run --pull=never --rm --label com.docker.compose.project=bingo-contabo-trial-020d654 --label com.bingo.owner=bingo-contabo-trial-020d654 --label com.bingo.validation=$VALIDATION_ID --label com.bingo.role=secret-preflight --network none --memory 128m --cpus 0.25 --mount type=bind,source=/srv,target=/host --user 0:0 --entrypoint sh '$MONGO_IMAGE' -euc 'root=/host/bingo-contabo-trial-020d654; test ! -e \"\$root\"; mkdir -m 0711 \"\$root\"; mkdir -m 0700 \"\$root/incoming\" \"\$root/m6.2-020d6542-ad8f6dbbc614\" \"\$root/secrets\"; chown 0:0 \"\$root\"; chown 1000:1000 \"\$root/incoming\" \"\$root/m6.2-020d6542-ad8f6dbbc614\" \"\$root/secrets\"'"

# FUTURE ONLY: verify the pinned image's mongodb identity and the protected directories without opening other project files.
MONGO_UID="$(ssh "$SSH_TARGET" "docker run --pull=never --rm --label com.docker.compose.project=bingo-contabo-trial-020d654 --label com.bingo.owner=bingo-contabo-trial-020d654 --label com.bingo.validation=$VALIDATION_ID --label com.bingo.role=secret-preflight --network none --memory 128m --cpus 0.25 --entrypoint id '$MONGO_IMAGE' -u mongodb")"
MONGO_GID="$(ssh "$SSH_TARGET" "docker run --pull=never --rm --label com.docker.compose.project=bingo-contabo-trial-020d654 --label com.bingo.owner=bingo-contabo-trial-020d654 --label com.bingo.validation=$VALIDATION_ID --label com.bingo.role=secret-preflight --network none --memory 128m --cpus 0.25 --entrypoint id '$MONGO_IMAGE' -g mongodb")"
[[ "$MONGO_UID" =~ ^[0-9]+$ && "$MONGO_GID" =~ ^[0-9]+$ ]]
printf 'Pinned Mongo UID/GID: %s:%s\n' "$MONGO_UID" "$MONGO_GID"
ssh "$SSH_TARGET" 'stat -c "%A %a %u:%g %n" /srv/bingo-contabo-trial-020d654 /srv/bingo-contabo-trial-020d654/incoming /srv/bingo-contabo-trial-020d654/m6.2-020d6542-ad8f6dbbc614 /srv/bingo-contabo-trial-020d654/secrets'

# COMPLETED in job-7; do not rerun after the manifest gate failure.
scp "$ARTIFACT_DIR/m6.2-020d6542-ad8f6dbbc614.tar.gz" \
  "$ARTIFACT_DIR/MANIFEST.json" "$ARTIFACT_DIR/SHA256SUMS" \
  "$REPO_ROOT/ops/private-staging/compose.contabo-trial.yaml" \
  "$SSH_TARGET:/srv/bingo-contabo-trial-020d654/incoming/"

# COMPLETED in job-7; do not rerun after the manifest gate failure.
REMOTE_INCOMING_OVERLAY_SHA256="$(ssh "$SSH_TARGET" 'sha256sum /srv/bingo-contabo-trial-020d654/incoming/compose.contabo-trial.yaml | cut -d" " -f1')"
test "$OVERLAY_SHA256" = "$REMOTE_INCOMING_OVERLAY_SHA256"

# COMPLETED in job-7 through extraction; do not rerun or overwrite.
ssh "$SSH_TARGET" 'set -eu
  root=/srv/bingo-contabo-trial-020d654
  incoming="$root/incoming"
  release="$root/m6.2-020d6542-ad8f6dbbc614"
  cd "$incoming"
  sha256sum -c SHA256SUMS
  test -d "$release"
  test "$(stat -c "%u:%g %a" "$release")" = "1000:1000 700"
  test -z "$(find "$release" -mindepth 1 -print -quit)"
  tar --no-same-owner -xzf m6.2-020d6542-ad8f6dbbc614.tar.gz -C "$release"
  overlay="$release/ops/private-staging/compose.contabo-trial.yaml"
  test ! -e "$overlay"
  install -m 0644 "$incoming/compose.contabo-trial.yaml" "$overlay"
  incoming_hash=$(sha256sum "$incoming/compose.contabo-trial.yaml" | cut -d" " -f1)
  release_hash=$(sha256sum "$overlay" | cut -d" " -f1)
  test "$incoming_hash" = "$release_hash"'
REMOTE_RELEASE_OVERLAY_SHA256="$(ssh "$SSH_TARGET" 'sha256sum /srv/bingo-contabo-trial-020d654/m6.2-020d6542-ad8f6dbbc614/ops/private-staging/compose.contabo-trial.yaml | cut -d" " -f1')"
test "$OVERLAY_SHA256" = "$REMOTE_RELEASE_OVERLAY_SHA256"

# OWNER AUTHORIZED: one final corrected read-only manifest/overlay validation; deployment stays stopped.
ssh "$SSH_TARGET" 'python3 -' <<'PY'
import hashlib, json, os, stat
root = "/srv/bingo-contabo-trial-020d654/m6.2-020d6542-ad8f6dbbc614"
manifest_path = "/srv/bingo-contabo-trial-020d654/incoming/MANIFEST.json"
manifest_rel = "MANIFEST.json"
overlay_rel = "ops/private-staging/compose.contabo-trial.yaml"
overlay_sha256_expected = "4545718a1e981716510f05336ab9c4719164b629bd54584e0e2fe69fe0daeabe"
with open(manifest_path, "r", encoding="utf-8") as stream:
    manifest = json.load(stream)
expected = {entry["path"]: entry for entry in manifest["files"]}
expected_dirs = set()
for rel in expected:
    parent = os.path.dirname(rel)
    while parent:
        expected_dirs.add(parent)
        parent = os.path.dirname(parent)
actual = {}
actual_dirs = set()
for base, dirs, files in os.walk(root, followlinks=False):
    for name in dirs:
        path = os.path.join(base, name)
        info = os.lstat(path)
        if not stat.S_ISDIR(info.st_mode):
            raise SystemExit("MANIFEST_NONREGULAR_DIRECTORY")
        actual_dirs.add(os.path.relpath(path, root))
    for name in files:
        path = os.path.join(base, name)
        rel = os.path.relpath(path, root)
        if rel == overlay_rel:
            continue
        info = os.lstat(path)
        if not stat.S_ISREG(info.st_mode):
            raise SystemExit("MANIFEST_NONREGULAR_FILE")
        actual[rel] = info
extra_files = set(actual) - set(expected)
missing_files = set(expected) - set(actual)
if extra_files != {manifest_rel} or missing_files or actual_dirs != expected_dirs:
    raise SystemExit("MANIFEST_PATH_MISMATCH")
embedded_manifest = actual.pop(manifest_rel)
if not stat.S_ISREG(embedded_manifest.st_mode):
    raise SystemExit("EMBEDDED_MANIFEST_NONREGULAR")
def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
sidecar_info = os.stat(manifest_path)
if stat.S_IMODE(embedded_manifest.st_mode) != 0o644 or stat.S_IMODE(sidecar_info.st_mode) != 0o600:
    raise SystemExit("EMBEDDED_MANIFEST_MODE_MISMATCH")
if embedded_manifest.st_size != sidecar_info.st_size or sha256_file(os.path.join(root, manifest_rel)) != sha256_file(manifest_path):
    raise SystemExit("EMBEDDED_MANIFEST_SIZE_OR_HASH_MISMATCH")
overlay_path = os.path.join(root, overlay_rel)
overlay_info = os.lstat(overlay_path)
if not stat.S_ISREG(overlay_info.st_mode) or overlay_info.st_size != 2614 or stat.S_IMODE(overlay_info.st_mode) != 0o644 or sha256_file(overlay_path) != overlay_sha256_expected:
    raise SystemExit("OVERLAY_METADATA_OR_HASH_MISMATCH")
for rel, entry in expected.items():
    info = actual[rel]
    if info.st_size != entry["sizeBytes"] or stat.S_IMODE(info.st_mode) != int(entry["mode"], 8):
        raise SystemExit("MANIFEST_METADATA_MISMATCH")
    if sha256_file(os.path.join(root, rel)) != entry["sha256"]:
        raise SystemExit("MANIFEST_HASH_MISMATCH")
print(f"MANIFEST_VERIFICATION_PASS files={len(expected)} embedded_manifest=PASS overlay=PASS")
PY
```

Compare the extracted archive paths/hashes against `MANIFEST.json`, and compare the two overlay hashes. The separate overlay is intentionally not added to the M6.2 archive/manifest. A failed check or an existing project/release path means stop and inspect; do not overwrite or retry into that directory. The exact Mongo pull/helper and transfer/extraction are complete (see task log L42/L46). Original archive/manifest sidecar and overlay checks passed; path-only comparison identified the embedded `MANIFEST.json` as the sole extra path. The first corrected revalidation failed because it incorrectly required the embedded manifest mode to equal the separately copied sidecar mode. A metadata-only diagnostic showed both are regular and have matching size/SHA-256, with expected modes `0644` embedded and `0600` sidecar. That final read-only validation passed (`MANIFEST_VERIFICATION_PASS files=262 embedded_manifest=PASS overlay=PASS`). The first SSH-user resource snapshot stopped at `du` with `Permission denied` on the intentionally restricted `0711 root:root` directory. After the owner authorized the bounded helper, the read-only host/resource/service gate passed (see task log L59). No secrets or application services have been created. Continue only with protected Bingo secret/keyfile setup and its metadata gates; deployment remains stopped until those pass.

## Protected Compose setup and deployment (future only)

L33 resolves the secret and exposure gate: generate new Bingo-only Mongo root/app credentials, JWT secret, BasicAuth account and Mongo keyfile. Do not read any other project's secret files; do not install a secret provider or helper package. The approved SSH identity owns the mode-`0700` Bingo secrets directory, so its mode-`0600` environment file can be read by the Compose client. The Mongo keyfile is separately set to mode `0400` and chowned to the exact pinned image's `mongodb` UID/GID. The Docker helper is project-labeled, resource-capped and network-isolated; it mounts only the authorized Bingo keyfile when changing/checking its metadata.

Remote `htpasswd` is unavailable; use the local `backend/node_modules/bcryptjs` to generate a unique temporary BasicAuth password/hash in memory. If that dependency is absent, stop unless the owner explicitly authorizes one lockfile-based local `npm ci --ignore-scripts`. Such authorization now exists: rebuild only `backend/node_modules` from the existing backend lockfile; do not edit the package manifest/lockfile or run install scripts, and verify the runtime file plus clean manifest/lockfile diff before secret generation. Send the generated JSON only through the SSH stdin pipe to a remote Node writer; never tee or display the stream. The remote writer creates `compose.env.sh` and a separate `client-auth.env.sh` with single-quoted `export KEY='value'` lines and mode `0600`, plus the keyfile at the exact L33 path with mode `0400`. This was tested with synthetic values through Bash sourcing and the existing Compose process-environment path. Do not use Compose `--env-file` for the bcrypt value: raw `$` interpolation failed the synthetic test. Do not put secrets in argv, stdout, logs, resolved Compose output or reports. The external load client's BasicAuth user/password are stored in a separate mode-`0600` `client-auth.env.sh` and are never passed to application containers. Privileged host users may inspect process variables and Docker admins can inspect the BasicAuth hash label; the owner explicitly accepted this exposure. Keep the Tailscale sidecar profile disabled.

FUTURE ONLY — generate and persist Bingo-only secrets (run from the verified repository root on the approved workstation). This command emits JSON only into the encrypted SSH stdin stream; it prints only the success marker from the remote writer:

```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
SSH_TARGET=pawtech
MONGO_IMAGE='mongo:7.0@sha256:e634fcaae4d0915b365fb88c076dd33c851ed61a611c7ee9816aba6d6b5159cd'
test -f "$REPO_ROOT/backend/node_modules/bcryptjs/umd/index.js"
node -e '
const crypto = require("node:crypto");
const bcrypt = require("./backend/node_modules/bcryptjs");
const username = "bingo_" + crypto.randomBytes(8).toString("hex");
const password = crypto.randomBytes(32).toString("hex");
const hash = bcrypt.hashSync(password, 12);
process.stdout.write(JSON.stringify({ username, password, hash }));
' | ssh "$SSH_TARGET" "node -e '
const fs = require(\"node:fs\");
const crypto = require(\"node:crypto\");
const dir = \"/srv/bingo-contabo-trial-020d654/secrets\";
const envPath = dir + \"/compose.env.sh\";
const clientAuthPath = dir + \"/client-auth.env.sh\";
const keyPath = dir + \"/mongo-keyfile\";
const input = JSON.parse(fs.readFileSync(0, \"utf8\"));
const isHex = (s) => typeof s === \"string\" && s.length > 0 && [...s].every((c) => \"0123456789abcdef\".includes(c));
const dollar = String.fromCharCode(36);
if (typeof input.username !== \"string\" || !input.username.startsWith(\"bingo_\") || !isHex(input.username.slice(6)) || !isHex(input.password) || input.password.length !== 64 || typeof input.hash !== \"string\" || input.hash.length !== 60 || !input.hash.startsWith(dollar + \"2b\" + dollar + \"12\" + dollar)) throw new Error(\"BINGO_AUTH_INPUT_INVALID\");
const dirStat = fs.lstatSync(dir);
if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || dirStat.uid !== process.getuid() || (dirStat.mode & 0o777) !== 0o700) throw new Error(\"BINGO_SECRET_DIR_METADATA\");
if (fs.existsSync(envPath) || fs.existsSync(clientAuthPath) || fs.existsSync(keyPath)) throw new Error(\"BINGO_SECRET_TARGET_EXISTS\");
const hex = (n = 48) => crypto.randomBytes(n).toString(\"hex\");
const rootUser = \"bingo_root_\" + crypto.randomBytes(8).toString(\"hex\");
const rootPass = hex();
const appUser = \"bingo_app_\" + crypto.randomBytes(8).toString(\"hex\");
const appPass = hex();
const uri = \"mongodb://\" + encodeURIComponent(appUser) + \":\" + encodeURIComponent(appPass) + \"@mongo:27017/bingo_private?replicaSet=bingo-rs&authSource=bingo_private\";
const values = {
  MONGO_ROOT_USERNAME: rootUser,
  MONGO_ROOT_PASSWORD: rootPass,
  MONGODB_URI: uri,
  MONGO_KEYFILE_PATH: keyPath,
  JWT_SECRET: hex(),
  FRONTEND_URL: \"https://bingo.31.220.98.21.sslip.io\",
  ALLOWED_ORIGINS: \"https://bingo.31.220.98.21.sslip.io\",
  TRUST_PROXY_HOPS: \"2\",
  BINGO_TEST_HOST: \"bingo.31.220.98.21.sslip.io\",
  BINGO_TRIAL_BASIC_AUTH: input.username + \":\" + input.hash
};
const clientValues = {
  BINGO_BASIC_AUTH_USER: input.username,
  BINGO_BASIC_AUTH_PASSWORD: input.password
};
const quote = String.fromCharCode(39);
const lines = Object.entries(values).map(([key, value]) => {
  const s = String(value);
  if (s.includes(quote) || s.includes(\"\\n\") || s.includes(\"\\r\")) throw new Error(\"BINGO_ENV_VALUE_INVALID\");
  return \"export \" + key + \"=\" + quote + s + quote;
});
fs.writeFileSync(envPath, lines.join(\"\\n\") + \"\\n\", { mode: 0o600, flag: \"wx\" });
fs.chmodSync(envPath, 0o600);
const clientLines = Object.entries(clientValues).map(([key, value]) => \"export \" + key + \"=\" + quote + value + quote);
fs.writeFileSync(clientAuthPath, clientLines.join(\"\\n\") + \"\\n\", { mode: 0o600, flag: \"wx\" });
fs.chmodSync(clientAuthPath, 0o600);
fs.writeFileSync(keyPath, crypto.randomBytes(512).toString(\"base64\") + \"\\n\", { mode: 0o400, flag: \"wx\" });
fs.chmodSync(keyPath, 0o400);
process.stdout.write(\"BINGO_PROTECTED_FILES_CREATED\\n\");
'"

# FUTURE ONLY: set the keyfile owner/mode using the exact locked image; output metadata only.
VALIDATION_ID="$(ssh "$SSH_TARGET" 'openssl rand -hex 8')"
MONGO_UID="$(ssh "$SSH_TARGET" "docker run --pull=never --rm --label com.docker.compose.project=bingo-contabo-trial-020d654 --label com.bingo.owner=bingo-contabo-trial-020d654 --label com.bingo.validation=$VALIDATION_ID --label com.bingo.role=secret-preflight --network none --memory 128m --cpus 0.25 --entrypoint id '$MONGO_IMAGE' -u mongodb")"
MONGO_GID="$(ssh "$SSH_TARGET" "docker run --pull=never --rm --label com.docker.compose.project=bingo-contabo-trial-020d654 --label com.bingo.owner=bingo-contabo-trial-020d654 --label com.bingo.validation=$VALIDATION_ID --label com.bingo.role=secret-preflight --network none --memory 128m --cpus 0.25 --entrypoint id '$MONGO_IMAGE' -g mongodb")"
[[ "$MONGO_UID" =~ ^[0-9]+$ && "$MONGO_GID" =~ ^[0-9]+$ ]]
ssh "$SSH_TARGET" "docker run --pull=never --rm --label com.docker.compose.project=bingo-contabo-trial-020d654 --label com.bingo.owner=bingo-contabo-trial-020d654 --label com.bingo.validation=$VALIDATION_ID --label com.bingo.role=secret-preflight --network none --memory 128m --cpus 0.25 --mount type=bind,source=/srv/bingo-contabo-trial-020d654/secrets/mongo-keyfile,target=/keyfile --user 0:0 --entrypoint chown '$MONGO_IMAGE' '$MONGO_UID:$MONGO_GID' /keyfile"
KEYFILE_STAT="$(ssh "$SSH_TARGET" "docker run --pull=never --rm --label com.docker.compose.project=bingo-contabo-trial-020d654 --label com.bingo.owner=bingo-contabo-trial-020d654 --label com.bingo.validation=$VALIDATION_ID --label com.bingo.role=secret-preflight --network none --memory 128m --cpus 0.25 --mount type=bind,source=/srv/bingo-contabo-trial-020d654/secrets/mongo-keyfile,target=/keyfile,readonly --user 0:0 --entrypoint stat '$MONGO_IMAGE' -c '%u:%g %a' /keyfile")"
test "$KEYFILE_STAT" = "$MONGO_UID:$MONGO_GID 400"
printf 'KEYFILE_UID_MODE_PASS %s:%s 400\n' "$MONGO_UID" "$MONGO_GID"
ssh "$SSH_TARGET" 'stat -c "%A %a %u:%g" /srv/bingo-contabo-trial-020d654/secrets /srv/bingo-contabo-trial-020d654/secrets/compose.env.sh /srv/bingo-contabo-trial-020d654/secrets/client-auth.env.sh /srv/bingo-contabo-trial-020d654/secrets/mongo-keyfile'
```

The remote writer's output contains only a success marker. Never rerun it if either protected target already exists; a partial write or metadata mismatch is a stop condition, not permission to overwrite. The SSH environment file is for Bash `source`, not Compose `--env-file`. It must be sourced only in trusted Bash processes before Compose and monitoring commands.

FUTURE ONLY — deploy after the package/overlay checks, keyfile metadata checks, and all preflight gates pass. Source the protected Bash file, explicitly disable default Compose `.env` loading, and keep the Tailscale profile disabled:

```bash
# FUTURE ONLY: run this block in Bash on the authorized VPS after all gates above pass.
set -euo pipefail
cd /srv/bingo-contabo-trial-020d654/m6.2-020d6542-ad8f6dbbc614
export COMPOSE_DISABLE_ENV_FILE=1
export COMPOSE_PROFILES=
SECRET_DIR=/srv/bingo-contabo-trial-020d654/secrets
source "$SECRET_DIR/compose.env.sh"
COMPOSE=(docker compose --project-name bingo-contabo-trial-020d654 \
  --file ops/private-staging/compose.yaml \
  --file ops/private-staging/compose.contabo-trial.yaml)

# The exact Mongo digest was pulled only for the authorized helper. Pull the other two pinned digests now.
docker pull node:22-alpine@sha256:025b8e975a61d94e33abeafaad1255ef44e4898cf1a1b6446860009c72e6d284
docker pull nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8

# Read-only: verify every exact locked image after the authorized pulls.
docker image inspect \
  mongo:7.0@sha256:e634fcaae4d0915b365fb88c076dd33c851ed61a611c7ee9816aba6d6b5159cd \
  node:22-alpine@sha256:025b8e975a61d94e33abeafaad1255ef44e4898cf1a1b6446860009c72e6d284 \
  nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8

# The separate Contabo overlay makes up to 60 Mongo ping attempts. Each uses `directConnection=true` and `serverSelectionTimeoutMS=1000`, followed by a one-second interval; the readiness wait is bounded to roughly two minutes before the unchanged one-shot bootstrap script is invoked.
# Quiet structural/interpolation validation; do not run `config` without --quiet.
"${COMPOSE[@]}" config --quiet

# L25 authorizes deployment; run only after the targeted preflight and all image/dependency gates pass.
"${COMPOSE[@]}" up --pull never --build --detach
```

The exact digest pulls and lockfile-only npm registry access are the complete L29 download scope. If a command fails or requests any additional image/package/network input, stop and preserve evidence; do not pull a different image, change an image, weaken bootstrap/auth, or broaden the Compose project.

## Remote auth smoke and staged load

Run the generator from an approved external test machine with the verified source tree and its already-installed `backend/node_modules/socket.io-client`; it does not start local services. Keep one trusted local Bash session open for the smoke and staged commands. The wrapper below retrieves only Bingo's two test credentials over the existing SSH alias, captures them in shell memory (never terminal output), and supplies them as environment variables to the generator process; it does not read any other project's files. Do not enable `set -x`, print the captured values, tee the SSH stream, or put either value in command arguments. The tool prints sanitized JSON metrics, not credentials or capabilities.

After the L25-authorized deployment, successful bootstrap/readiness, and route creation, verify unauthenticated access is denied (expect HTTP 401) without sending credentials:

```sh
# After preflight/deployment gates; this denial check sends no credentials.
set -eu
status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --max-time 10 https://bingo.31.220.98.21.sslip.io/)"
printf '%s\n' "$status"
test "$status" = 401  # the unauthenticated request must be denied
```

The generator applies BasicAuth to both HTTPS requests and the WSS handshake. Run the one-player positive-auth smoke first; it exercises room creation, guest admission, card selection and Socket.IO acknowledgment. The wrapper below avoids `mapfile` so it works with older workstation Bash, validates the two-line credential response without printing it, and clears the local variables after each invocation. Define it in the trusted local Bash session, then use it for each stage:

```bash
set -euo pipefail
SSH_TARGET=pawtech
with_trial_auth() {
  local payload separator auth_user auth_password status
  payload="$(ssh "$SSH_TARGET" 'bash -s' <<'REMOTE'
set -euo pipefail
source /srv/bingo-contabo-trial-020d654/secrets/client-auth.env.sh
printf '%s\n%s\n' "$BINGO_BASIC_AUTH_USER" "$BINGO_BASIC_AUTH_PASSWORD"
REMOTE
)"
  separator=$'\n'
  case "$payload" in
    *"$separator"*) ;;
    *) unset payload; printf '%s\n' 'CLIENT_AUTH_RESPONSE_INVALID' >&2; return 1 ;;
  esac
  auth_user="${payload%%"$separator"*}"
  auth_password="${payload#*"$separator"}"
  unset payload
  case "$auth_password" in
    *"$separator"*) unset auth_user auth_password; printf '%s\n' 'CLIENT_AUTH_RESPONSE_INVALID' >&2; return 1 ;;
  esac
  if [[ -z "$auth_user" || -z "$auth_password" ]]; then
    unset auth_user auth_password
    printf '%s\n' 'CLIENT_AUTH_RESPONSE_INVALID' >&2
    return 1
  fi
  if BINGO_BASIC_AUTH_USER="$auth_user" \
    BINGO_BASIC_AUTH_PASSWORD="$auth_password" \
      "$@"; then
    status=0
  else
    status=$?
  fi
  unset auth_user auth_password
  return "$status"
}

# L25-authorized positive-auth smoke; only after deployment/bootstrap/readiness pass.
with_trial_auth node e2e/contabo-trial-load.mjs --url https://bingo.31.220.98.21.sslip.io --players 1 --window-seconds 10 --hold-seconds 0 --request-timeout-seconds 15 --max-runtime-seconds 300
```

Only after that smoke passes, run the following stages one at a time. Inspect each JSON result before proceeding; stop on nonzero exit, any important error, or degraded service state. The exact arrival windows are 10 seconds, 30 seconds and 60 seconds. Each stage uses unique synthetic identities, validates assigned cards and WSS, and reports p50/p95/p99, errors, socket/disconnect, timing and client-process metrics.

L100 separates dispatch timing from full confirmation. Record `allArrivalsWithinWindow`, every player's dispatch and confirmation offsets, and the last card/WSS confirmation time independently. Before any configured 300-second hold, the generator now verifies that every player was dispatched within the arrival window; if any dispatch is late or missing, it skips the hold and returns failure. A late confirmation does not by itself skip the hold when dispatch timing passed and no errors or unexpected disconnects occurred; report confirmation timing separately and do not claim strict PASS if the confirmation deadline was missed. Preserve L99 as the original stage-10 strict-window failure; do not rerun or rewrite it. For stage 25, advance to stage 50 when all 25 are dispatched within 30 seconds, no player is lost, every player eventually has a unique valid card and confirmed Socket.IO connection, there are no critical errors, and no co-resident service/resource degradation; report confirmation time even if it exceeds 30 seconds. For stage 50, clearly report whether all 50 full confirmations complete before or after 60 seconds; do not claim PASS if any requested criterion is unmet. Keep sockets open for the existing bounded 300-second hold, then report active sockets and disconnects before cleanup. The prepared client uses `reconnection:false`; it counts unexpected disconnects but does not exercise reconnect recovery, so report reconnect recovery as not exercised.

```bash
# Historical stage 10 (job-24; L99). Do not rerun as part of L100; preserve its original strict-window result.
with_trial_auth node e2e/contabo-trial-load.mjs --url https://bingo.31.220.98.21.sslip.io --players 10 --window-seconds 10 --hold-seconds 0 --request-timeout-seconds 15 --max-runtime-seconds 300
```

```bash
# L100-authorized stage 25; keep all successful sockets open for the bounded 300-second stability hold.
with_trial_auth node e2e/contabo-trial-load.mjs --url https://bingo.31.220.98.21.sslip.io --players 25 --window-seconds 30 --hold-seconds 300 --request-timeout-seconds 15 --max-runtime-seconds 390
```

```bash
# L100-authorized stage 50 only after stage 25 has no critical errors or service degradation; keep sockets open for the bounded 300-second stability hold.
with_trial_auth node e2e/contabo-trial-load.mjs --url https://bingo.31.220.98.21.sslip.io --players 50 --window-seconds 60 --hold-seconds 300 --request-timeout-seconds 15 --max-runtime-seconds 390
```

L100 authorizes the existing bounded 300-second connection hold for stages 25 and 50 (`--hold-seconds 300 --max-runtime-seconds 390`). This is the tool's maximum hold; do not extend it. The hold checks connection stability only; device, game-action, and reconnect-recovery tests are not exercised by this generator. Preserve synthetic room/player data until an explicit retention/retirement decision.

Capture a baseline before deployment and repeat read-only snapshots before/after each stage to detect relevant impact on other existing services. During each load stage, run this read-only guard in a second SSH session; if it exits with `STOP` or any nonzero status, stop the client immediately. It samples host limits every five seconds and tracks health/state/restart counts of containers running at the start of that stage:

```bash
# Second SSH session on the VPS, started immediately before each client stage.
set -euo pipefail
mapfile -t baseline_names < <(docker ps --format '{{.Names}}')
declare -A baseline_restarts
for name in "${baseline_names[@]}"; do
  baseline_restarts["$name"]="$(docker inspect -f '{{.RestartCount}}' "$name")"
done
while :; do
  load1="$(awk '{print $1}' /proc/loadavg)"
  mem_kib="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
  disk_kib="$(df -Pk /srv | awk 'NR==2 {print $4}')"
  printf 'guard load1=%s mem_available_GiB=%s disk_free_GiB=%s\n' "$load1" "$(awk -v n="$mem_kib" 'BEGIN {printf "%.2f", n/1048576}')" "$(awk -v n="$disk_kib" 'BEGIN {printf "%.2f", n/1048576}')"
  if awk -v load1="$load1" -v mem="$mem_kib" -v disk="$disk_kib" 'BEGIN {exit !(load1 >= 6 || mem < 8388608 || disk < 10485760)}'; then
    printf '%s\n' 'STOP: L31 host load/RAM/disk threshold reached' >&2
    exit 2
  fi
  for name in "${baseline_names[@]}"; do
    state="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}' "$name")"
    IFS='|' read -r status health restarts <<<"$state"
    if [[ "$status" != running || "$health" == unhealthy || "$health" == starting || "$restarts" -gt "${baseline_restarts[$name]}" ]]; then
      printf 'STOP: baseline container changed: %s status=%s health=%s restarts=%s\n' "$name" "$status" "$health" "$restarts" >&2
      exit 2
    fi
  done
  sleep 5
done
```

Stop the guard with Ctrl-C only after the client stage completes without triggering it. The all-container commands below are status/CPU/RAM observation only; do not inspect their configuration or change them. Pair these with the Bingo-project-only Mongo/storage measurements:

```bash
# L25/L31-authorized read-only snapshots; run before deployment and after each load stage.
set -euo pipefail
printf 'load1='; awk '{print $1}' /proc/loadavg
awk '/MemAvailable:/ {printf "MemAvailable=%.2f GiB\n", $2/1048576}' /proc/meminfo
# Only names/status and aggregate CPU/RAM are read for existing services.
docker ps --format '{{.Names}}\t{{.Status}}'
docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'

# The rest queries only this Compose project and the trial containers.
cd /srv/bingo-contabo-trial-020d654/m6.2-020d6542-ad8f6dbbc614
export COMPOSE_DISABLE_ENV_FILE=1
export COMPOSE_PROFILES=
source /srv/bingo-contabo-trial-020d654/secrets/compose.env.sh
COMPOSE=(docker compose --project-name bingo-contabo-trial-020d654 \
  --file ops/private-staging/compose.yaml \
  --file ops/private-staging/compose.contabo-trial.yaml)
"${COMPOSE[@]}" ps
container_ids="$("${COMPOSE[@]}" ps -q)"
if [ -z "$container_ids" ]; then
  printf '%s\n' 'No trial containers found; stop.' >&2
  exit 1
fi
docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}' $container_ids
"${COMPOSE[@]}" exec -T mongo sh -c 'df -B1 /data/db /data/configdb; du -B1 -s /data/db /data/configdb'
"${COMPOSE[@]}" exec -T backend sh -c 'du -B1 -s /app/uploads /app/logs'
df -B1 /srv
```

Compare every sample against the starting baseline and stop immediately at any L31 load/RAM/disk/service-state threshold, failed auth, card mismatch, unexpected disconnect, or isolation failure; do not proceed to the next stage. The client tool does not measure VPS CPU/RAM/Mongo; record those explicitly using the approved host guard and project-scoped monitoring. Do not infer server capacity from the 13 static/mock tests or the old preflight snapshot.

## Stop, retention, and verification boundary

- L25 authorizes the deployment, listed smoke checks, and staged load only after the requested preflight and every essential runbook gate pass. Do not start if a gate fails.
- Do not change shared Traefik, expose backend/Mongo, download any image other than the three L29-pinned digests, install any package outside the existing lockfile `npm ci`, add application code, commit, push, or run global cleanup.
- The expected HTTP 401 from the unauthenticated check is success; any other status there fails the access gate. HTTP 401 from the authenticated one-player smoke, failed WSS, failed bootstrap, missing/incorrect keyfile, unavailable approved dependency/image, unhealthy service, exceeded resource/storage stop condition, or isolation mismatch means stop and report; do not retry by weakening controls.
- A project-scoped `down` preserves named volumes but is still a runtime change and needs separate authorization. Never use `down -v`, `--remove-orphans`, `docker system prune`, volume pruning, or deletion of shared images.
- Static evidence proves only Compose labels/interpolation and mocked client behavior. L25 now authorizes live checks but does not itself prove them. Record actual TLS, BasicAuth, HTTP/WSS, Mongo/bootstrap, capacity, other-service status, and storage results; do not report PASS unless every stated criterion is observed.

## Mongo authentication and readiness gate — L93 current status

The earlier `phase=root-authentication reason=root-auth-failed` and L90 `ROOT_AUTH=FAIL` were false negatives: the probes compared `admin.auth(...)` with numeric `1`, although the real result is object-shaped. The corrected read-only `mongosh` probe passed and reported `{"ok":1}`. Source review confirms bootstrap uses `db.getSiblingDB('admin').auth(...)` for root; the application URI uses `authSource=bingo_private` for the database-scoped app user. Mongo is currently `healthy` and `bingo-rs` PRIMARY; root auth returns `{ok:1}` and the app probe verifies `readWrite@bingo_private`, `authSource=bingo_private`, `replicaSet=bingo-rs`, and app auth. The deployed healthcheck checks `.ok !== 1`; local focused bootstrap+Compose tests passed 13/13. L96 positive-auth smoke exercised the real transaction-backed admission/card flow. L99's original stage-10 strict-window failure remains unchanged. L101 stage25 completed 25/25 dispatches within 30s, all 25 confirmations/unique cards, 25 sockets before cleanup, zero errors/disconnects, and the 300s hold. Final confirmation at 30,506.46ms missed the strict 30s confirmation deadline by 506.46ms; this is not a strict timing PASS. Post-stage Mongo/app/host/co-resident gates passed without degradation, so L100's conditional stage50 authorization is satisfied. No Mongo, Docker, credential, infrastructure, or cleanup changes are authorized.

### Verified cold backup

The owner authorized a backup-only stop/copy/restart cycle. MongoDB 7.0.45 stopped cleanly (exit code 0; not OOM-killed). Read-only mounts of the two existing local-driver volumes were archived after shutdown using the pinned image, a project-labeled helper, and `--network none`. Both archives passed checksum validation, tar readability, and tar comparison against their stopped source volumes. They are stored at `/srv/bingo-contabo-trial-020d654/secrets/mongo-recovery-backups/cold-20261102T033406Z`: directory `0700`; archives and checksum manifest `0600`. The data archive is 316,436,480 bytes; the config archive is 10,240 bytes. Hash values and archive contents are not logged or included here. The original Mongo container, image, mounts, and configuration were restarted unchanged; last observed state was running with health `starting`. No auth/user change, bootstrap, app, smoke, load, or cleanup was performed. L87 reverified the archive checksum manifest and both tar listings read-only; integrity and readability pass, with directory `0700` and archives/manifest `0600`. No archive contents or digests were disclosed.

### Recovery and volume cutover gate

MongoDB 7.0 documentation says disabling authorization grants unrestricted actions; its documented replica-set maintenance procedure starts a member as a standalone without `replSetName`, changes to standalone are not replicated and may conflict with oplog writes when the member rejoins. MongoDB's localhost exception cannot reset an existing user's password. The exact account and replica-set/local state here are unknown. The currently protected `compose.env.sh` contains more than root credentials; there is no separately prepared root-only credential-delivery file. Do not reuse the previous proposed maintenance command without resolving these points.

In-place auth recovery remains unapproved: the account and local replica-set state are unknown, and standalone maintenance writes may conflict with the oplog. Archive integrity is verified, but restore has not been rehearsed. Read-only provenance shows the current local-driver volumes `bingo-contabo-trial-020d654_mongo-data` (309624 KiB) and `bingo-contabo-trial-020d654_mongo-config-data` (4 KiB) are labeled for this Compose project and were created at the same time as the fresh Mongo container. Backend/frontend never started and bootstrap failed before replica-set/app-user steps. This strongly supports trial-only initialization data with no app-generated records; the logical catalog could not be enumerated because root authentication fails, so absolute absence of every possible record is not proven.

L89 authorized the fresh Bingo-only volume pair `bingo-contabo-trial-020d654_mongo-data-reinit` and `bingo-contabo-trial-020d654_mongo-config-data-reinit`, retaining the original pair and verified cold backup unchanged. `ops/private-staging/compose.contabo-trial-fresh-mongo.yaml` changes only those two Mongo volume names; its static test passed. The overlay was transferred/installed, Compose config passed, and only the Mongo container was recreated. The new Mongo init did not pass the bounded init-marker wait, and the direct root-auth probe failed. This fresh-volume attempt therefore did not resolve authentication. Stop before bootstrap/app; no further root-auth/credential changes, retries, volume writes, volume deletion, backup changes, smoke/load, or cleanup are authorized by L89. L91 now authorizes only correction of the auth-result comparisons and ordinary bootstrap/validation with existing credentials and the active `_reinit` volume pair. No credential mutation, standalone maintenance, volume reset, or new volume is authorized.

MongoDB 7.0 references reviewed: [configuration options](https://www.mongodb.com/docs/v7.0/reference/configuration-options/), [localhost exception](https://www.mongodb.com/docs/v7.0/core/localhost-exception/), [replica-set member maintenance](https://www.mongodb.com/docs/v7.0/tutorial/perform-maintenance-on-replica-set-members/), [backup methods](https://www.mongodb.com/docs/v7.0/core/backups/), and [restore a replica set from backup](https://www.mongodb.com/docs/v7.0/tutorial/restore-replica-set-from-backup/).

## L99 — Stage 10 result and stop gate

Pre-stage checks passed: Mongo healthy, root auth `{ok:1}`, `bingo-rs` PRIMARY; backend `/api/ready` 200; authenticated external frontend HTTPS 200 and `/api/ready` 200; all three running Bingo services healthy with zero restarts. The 20 other running containers remained running, with healthchecks healthy where configured and four containers without healthchecks. Before load: load1 0.82, MemAvailable 20.87 GiB, `/srv` free 64.80 GiB. The live guard baseline had 23 running containers; samples stayed within load1 0.69–0.86, MemAvailable 20.70–20.84 GiB, disk 64.80 GiB, with no STOP. Post-stage: load1 0.76, MemAvailable 20.80 GiB, disk 64.80 GiB; all 20 co-resident services remained running and none became unhealthy/restarting/exited.

Job `job-24` exited 0 after 13 seconds. Generator JSON: 10 requested, dispatched and confirmed; 10 unique cards; dispatch span 9,002.44 ms; `allArrivalsWithinWindow=true`; `allConfirmedWithinWindow=false`; `success=true`; 10 connections and active sockets before cleanup; zero unexpected disconnects, timeout, or errors. Player 10's card/WSS confirmation finished at 10,692.28 ms (692.28 ms after the 10-second full-confirmation deadline). Under the acceptance rule above, stage 10 failed; do not continue to 25/50 absent an owner decision.

Latency p50/p95/p99 (ms): end-to-end 1,613.38/1,977.02/1,977.02; join 428.31/636.56/636.56; card 423.38/459.98/459.98; WSS 788.10/880.48/880.48. Client process used 0.52 CPU seconds and 88,965,120 bytes RSS. Host/container CPU/RAM are pre/post snapshots, not peaks: Mongo 1.49%/210.6 MiB before and 1.30%/211.4 MiB after; backend 0.31%/115.9 MiB then 0.35%/123.2 MiB; frontend 0.00%/12.5 MiB then 0.00%/12.54 MiB. Mongo data directory grew 221,184 bytes (321,277,952 to 321,499,136); config directory remained 4,096 bytes. The post-stage command did not emit backend uploads/logs size or the final free-byte line; that submeasurement is unavailable and was not retried.

Exact project inventory after the test: containers `bingo-contabo-trial-020d654-mongo-1`, `...-backend-1`, and `...-frontend-1` running/healthy; `...-mongo-bootstrap-1` remains exited 1 from the earlier deployment attempt. Six project volumes: `bingo-contabo-trial-020d654_mongo-data`, `_mongo-config-data`, `_mongo-data-reinit`, `_mongo-config-data-reinit`, `_uploads`, `_backend-logs`. Three project networks: `bingo-contabo-trial-020d654_application`, `_database`, `_ingress`; shared `pawtech_public` unchanged. Cold backup directory `/srv/bingo-contabo-trial-020d654/secrets/mongo-recovery-backups/cold-20261102T033406Z` remains present, mode `0700`. The harness created only synthetic room/player/card records; no infrastructure, credentials, volumes, networks, containers, or backups were changed or removed. `hold-seconds=0` means no player sockets were retained after the stage.

## L100 — Separate dispatch/confirmation metrics and authorized continuation

Owner L100 preserves L99 as the original stage-10 strict-window failure and authorizes stage 25 (25 players/30 seconds), then stage 50 (50/60 seconds) if stage 25 has no critical errors or co-resident service degradation. Record all dispatch offsets separately from full card/WSS confirmation offsets; for stage 50, state whether the final confirmation is before or after 60 seconds. Do not declare PASS for any unmet condition. Keep successful sockets open for the bounded 300-second stability hold. The existing client disables automatic reconnect (`reconnection:false`), records unexpected disconnects, and does not exercise reconnect recovery; report that limitation rather than claiming recovery testing. No additional Mongo/Docker/credential/infrastructure changes or cleanup are authorized.

## L101 — Stage 25 results and conditional stage-50 authorization

Stage25 job `job-26` exited 0 after 5m34s. Generator output: 25 requested/dispatched/confirmed, 25 unique cards, dispatch span 28,800ms, `allArrivalsWithinWindow=true`, `allConfirmedWithinWindow=false`, `success=true`. Player 25 dispatched at 28,800.04ms and completed card/WSS confirmation at 30,506.46ms (506.46ms after the 30-second strict confirmation deadline). There were 25 peak/connected/active-before-cleanup sockets, zero unexpected disconnects, no timeout, and no errors. The 300-second hold completed (`totalDurationMs=331,263.92`, `roomSetupMs=755.42`, `loadDurationMs=30,506.46`).

Latency p50/p95/p99 (ms): end-to-end 1,719.22/1,870.91/2,153.70; join 372.92/473.50/755.43; card 452.29/535.53/664.00; WSS 876.61/1,009.50/1,343.64. Client CPU 1.17s; RSS 59,031,552 bytes.

The 420-second guard ended at its configured timeout after 161 events without reporting STOP. In streamed samples, load1 peaked at 2.28, MemAvailable stayed at or above 20.67 GiB, and `/srv` free space stayed at 64.81 GiB. Post-stage snapshot: load1 1.11, MemAvailable 20.84 GiB, `/srv` free 64.81 GiB; all 23 containers remained running (3 Bingo + 20 co-resident), with Bingo healthy and zero restarts. Mongo root auth and `bingo-rs` PRIMARY passed; backend readiness, authenticated external HTTPS, and external API readiness returned 200. Post-stage Docker stats: Mongo 66.12% CPU/213.7 MiB, frontend 0%/12.57 MiB, backend 0.82%/110.8 MiB. Mongo `/data/db` grew 282,624 bytes (322,142,208 to 322,424,832); configdb remained 4,096 bytes. All six Bingo volumes and three Bingo networks remained; cold backup preserved; no cleanup or infrastructure changes.

There were no critical errors, player loss, disconnects, or co-resident degradation. Therefore L100's conditional stage-50 gate is met. Stage25 missed its strict full-confirmation deadline and is not a strict timing PASS; preserve that result. Stage50 is next: 50 players dispatched across 60 seconds, with dispatch timing and final card/WSS confirmation reported separately and all 50 sockets held for the bounded 300-second stability period.

## L102 — Stage 50 started after fresh readiness/resource gates

Before stage50, fresh gates passed: load1 1.07, MemAvailable 20.84 GiB, `/srv` free 64.80 GiB; Mongo healthy, root auth and `bingo-rs` PRIMARY passed, backend readiness and authenticated external HTTPS/API readiness returned 200. All 23 containers were running (3 Bingo + 20 co-resident), and all six Bingo volumes/three Bingo networks remained present. Mongo data/config sizes were 322,457,600/4,096 bytes. The live L31 monitor `job-27` started with a baseline of 23 running containers. Stage50 generator `job-28` later exited 1 with 50 unexpected WSS disconnects; see L103. Per L98, stop further load after this failed stage.

## L103 — Stage 50 result and stop after failure

Stage50 job `job-28` exited 1 after 6m3s. Full generator output: 50 requested/dispatched/confirmed and 50 unique cards; dispatch span 58,800ms, `allArrivalsWithinWindow=true`, `allConfirmedWithinWindow=false`, `success=false`. Player 50 dispatched at 58,800.86ms and fully confirmed at 60,751.77ms, 751.77ms after the 60-second deadline. `activeSocketsAtPeak=50`, `socketConnections=50`, `activeSocketsBeforeCleanup=0`, `unexpectedDisconnects=50`, `timedOut=false`, and `errors` contained 50 `UNEXPECTED_DISCONNECT` events in the WSS phase. The 50-player criterion failed both the strict confirmation deadline and sustained-connection hold.

Latency p50/p95/p99 (ms): end-to-end 1,920.39/2,082.80/2,202.75; join 520.86/606.39/855.34; card 452.41/507.13/620.02; WSS 926.94/1,066.64/1,520.61. Client CPU 2.83s; RSS 62,013,440 bytes. `totalDurationMs=361,436.19`, `roomSetupMs=683.51`, `loadDurationMs=60,751.77`; the configured 300-second hold elapsed, but no sockets remained active before cleanup. The generator disables reconnection, so recovery, device, and game-action behavior remain untested.

The live guard `job-27` reached its 420-second timeout after 128 events and was stopped without reporting STOP. Among the streamed samples shown in the session, load1 reached 2.86, MemAvailable fell to 20.61 GiB, and disk stayed at 64.80 GiB; one instantaneous Docker stats sample showed Mongo 118.38% CPU/378.5 MiB, frontend 0.08%/14.15 MiB, and backend 0.49%/128.5 MiB. These are observed samples, not verified peaks. Post-stage snapshot: load1 0.49, MemAvailable 20.75 GiB, `/srv` free 64.80 GiB; all 23 containers remained running (3 Bingo + 20 co-residents), Bingo healthy with zero restarts. Mongo root auth and `bingo-rs` PRIMARY passed; backend readiness and authenticated external HTTPS/API readiness returned 200. Mongo `/data/db` was 322,752,512 bytes (322,457,600 pre-stage; +294,912); `/data/configdb` stayed 4,096 bytes. The six project volumes remain `bingo-contabo-trial-020d654_mongo-data`, `_mongo-config-data`, `_mongo-data-reinit`, `_mongo-config-data-reinit`, `_uploads`, and `_backend-logs`; the three project networks remain `bingo-contabo-trial-020d654_application`, `_database`, and `_ingress`; shared `pawtech_public` is unchanged. The previously recorded one-shot `mongo-bootstrap` container remains outside the running set (L99 inventory: exited 1); three Bingo services and all 20 co-residents were running at L103. Cold backup `/srv/bingo-contabo-trial-020d654/secrets/mongo-recovery-backups/cold-20261102T033406Z` remains preserved. No cleanup or infrastructure changes occurred.

Stop per the owner's L98 instruction: “Detener inmediatamente la carga si falla una etapa”. The historical L103 stop remained in effect until L106 explicitly authorized one separate diagnostic test. No further load is authorized after the single L106 run below.

## L106 — One authorized post-L105 diagnostic run

The owner authorized exactly one external 50-player run with a 60-second arrival window, 300-second hold, and `reconnection:false`, stopping on the first unexpected disconnect or critical error. The first shell launch (`job-32`) failed before Node loaded because it ran from the wrong local working directory; it sent no Bingo request. The owner then authorized one corrected launch only. `job-34` was the only actual test and ran from the repository directory under live L31 guard `job-33`.

`job-34` exited 1 after 6m4s; generator `success=false`. It requested, dispatched, and confirmed 50/50 players with 50 unique valid cards. All dispatches were inside 60 seconds (`allArrivalsWithinWindow=true`); player 50 was dispatched at 58,799.99ms but fully confirmed at 61,086.93ms, 1,086.93ms beyond the strict 60-second deadline (`allConfirmedWithinWindow=false`). Room setup was 941.23ms; total duration 362,029.72ms. Latency p50/p95/p99 (ms): end-to-end 2,054.01/2,506.65/3,242.58; join 595.23/750.42/919.09; card 505.42/637.71/1,327.66; WSS 982.61/1,227.56/1,733.39. Client CPU 3.17s; RSS 63,782,912 bytes.

There were no errors or unexpected disconnects. All 50 sockets remained active before cleanup and through the sampled 300-second hold (`holdCompleted=true`, `allConnectionsStableDuringHold=true`); `activeSocketsBeforeCleanup=50`. The hold interval was `2026-11-02T15:34:24.676Z`–`2026-11-02T15:39:24.674Z`. Client cleanup produced 50 expected `io client disconnect` events. The backend combined log contains 50 corresponding diagnostic records, all allowlisted `client namespace disconnect`, with UTC timestamps `2026-11-02T15:39:24.799Z`–`2026-11-02T15:39:24.940Z` and connection durations 300,524.686–359,351.610ms. L103's unexpected disconnect symptom was not reproduced; its root cause remains undetermined.

The L31 guard reported no STOP through delivered sample 60: observed load1 1.07–3.09, MemAvailable 20.65–20.88 GiB, `/srv` free 64.79 GiB. Post-stage snapshot: load1 1.70, MemAvailable 20.80 GiB, `/srv` free 64.79 GiB; all 23 containers running, Bingo services healthy with zero restarts, six project volumes and three project networks unchanged, and positive-auth `/api/ready` returned 200. Post-stage Docker stats: Mongo 2.27% CPU/221.3MiB, backend 0.36%/57.03MiB, frontend 0%/12.67MiB.

One in-run instantaneous Docker stats sample showed backend 153.80% CPU against configured `NanoCPUs=1500000000` (150% nominal). This is not a verified peak and no CPU-throttling delta was captured; treat it as a possible service CPU-limit excursion, not cleared. The L31 host/state guard did not emit STOP. Independent `gentle-ai-verify` remained “not cleared” regarding the L105 `server.js` startup/readiness wiring; the owner accepted the clearance gap as a limitation, not approval. No further load, device/gameplay/reconnection tests, cleanup, deployment, or infrastructure change is authorized.
