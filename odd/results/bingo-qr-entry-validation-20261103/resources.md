# Bingo QR temporary validation resources

Status: Runtime validation passed on the isolated entry-only Compose stack; it remains running for later owner-directed cleanup. The original partial staging directory remains untouched. No production database or active Bingo router was modified.

## Authorized target

- Compose project: `bingo-qr-entry-validation-20261103` (always pass `--project-name` explicitly).
- Test hostname: `bingo-qr-entry-validation-20261103.31.220.98.21.sslip.io`.
- Active entry-only staging directory: `/tmp/bingo-qr-entry-validation-20261103-entry-only` (Compose file and explicit `--project-name` are `bingo-qr-entry-validation-20261103`).
- Original partial staging directory: `/tmp/bingo-qr-entry-validation-20261103` (leave untouched; do not use).
- Existing shared ingress: `pawtech_public`; it is external and must never be removed.
- Existing Traefik listeners remain on their current ports; the test stack publishes no host ports.

## Actual test-stack resources

- Containers: `bingo-qr-entry-validation-20261103-mongo-1`, `bingo-qr-entry-validation-20261103-mongo-bootstrap-1`, `bingo-qr-entry-validation-20261103-backend-1`, `bingo-qr-entry-validation-20261103-frontend-1`.
- Project-private networks: `bingo-qr-entry-validation-20261103_database`, `bingo-qr-entry-validation-20261103_application`.
- Project-private volumes: `bingo-qr-entry-validation-20261103_mongo-data`, `bingo-qr-entry-validation-20261103_mongo-config-data`.
- Temporary Traefik routers: `bingo-qr-entry-validation-20261103-fallback`, `bingo-qr-entry-validation-20261103-public-ui`, `bingo-qr-entry-validation-20261103-public-api`, `bingo-qr-entry-validation-20261103-public-socket`; socket middleware `bingo-qr-entry-validation-20261103-socket-limit`.
- Original partial directory still contains `compose.yaml`, `nginx.conf`, `mongo-bootstrap.js`, and an incomplete `frontend-dist/` (139 files / 481,403,452 bytes; 55 of 71 music files; AppleDouble sidecars present). It is not used by the running stack; leave it untouched.
- The active clean entry-only bundle contains 39 frontend files / 1,186,328 bytes and omits the full `/music/` tree; no music playback will be tested. Transfer and input checks passed.
- The active directory now contains protected `secrets/compose.env` and `secrets/mongo-keyfile`, plus `existing-state.json`. Secret values are intentionally not recorded here. The Mongo keyfile and env file have restrictive permissions.
- Images are reused with Compose `pull_policy: never`; remote cached-image checks and `docker compose config --quiet` passed without printing configuration. No image was pulled or removed. Temporary Mongo helper containers used for keyfile ownership were auto-removed.

## Current remote state

- The original full-media staging transfer exited 1 after 12m19s; its partial directory remains untouched and unused.
- The stack-launch SSH session exited 255 with `Connection reset by peer`, but a separate read-only inspection confirmed readiness: Mongo/backend healthy, bootstrap exited 0, frontend running; no published host ports; both private networks internal; frontend-only `pawtech_public` attachment.
- Public runtime checks passed: player/TV UI and static JS were public; organizer and room creation remained Basic Auth-protected; config remained denied without host capability; TV issue/claim/renew flow passed; 24 same-source-IP guests admitted and connected without guest Authorization; no game started.
- Post-test inventory: 49 containers total, including the four expected test containers. Mongo/backend are healthy, frontend is running, bootstrap exited 0. Both project networks remain internal; frontend alone is attached to `pawtech_public`; two scoped volumes and four test router labels remain present; no host ports are published.
- The corrected comparison found all 45 pre-existing containers unchanged in state, health, and restart count (0 added/removed; 0 unhealthy/restarting). An initial comparison used the wrong baseline field names and falsely reported differences; it was corrected read-only.
- The test created one waiting room with its host and 24 guest records in the isolated MongoDB and issued a temporary TV session. These remain intentionally in the temporary stack; no game was started and no cleanup was performed. Music/karaoke was excluded.
- Pre-start snapshot: 45 containers total / 23 running; `/tmp` had 67,219,488 KB free. The background job did not write its planned remote runtime JSON inventory. This local document records observed topology and runtime outcomes. No logs, credentials, tokens, room codes, Authorization headers, or hashes were recorded. The failed staging directory remains separate and retained.

## Cleanup procedure — do not run without a later owner request

From `/tmp/bingo-qr-entry-validation-20261103-entry-only`, use the explicit project name and env file:

```sh
docker compose --project-name bingo-qr-entry-validation-20261103 \
  --file compose.yaml --env-file secrets/compose.env \
  down --volumes --remove-orphans
```

Only after confirming the project containers are gone, the active entry-only staging directory may be removed. The failed original partial directory is separate and also remains until an owner-authorized cleanup. Never remove `pawtech_public`, the existing Bingo trial project, shared Traefik, cached images, or any other project resource. The ACME certificate entry may remain in Traefik's shared storage after the routers disappear; do not edit that store as part of this validation.

This inventory contains no credential values, tokens, or capability material.
