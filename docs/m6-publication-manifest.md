# M6.2 publication manifest — review only

This is the selection policy and release record contract, not deployment authorization. The exact archive file list and per-file hashes are generated as `MANIFEST.json` inside the package and alongside it. The archive SHA-256 and manifest SHA-256 are recorded in the external `SHA256SUMS` sidecar; they are deliberately not embedded here because this document is itself packaged.

## Source identity

- Branch/base: `main` / `020d654276d2b6b4a98b886a37deebe2ae51bc72`.
- The working tree is dirty; the archive includes selected current working-tree bytes, not HEAD alone. `MANIFEST.json` records each file's source class, Git status, mode, size, and SHA-256.
- Target: `linux/amd64`.
- Exact selection policy: `ops/private-staging/m6.2-package-inputs.json`.
- Filtered tracked path snapshot: 229 files under `backend/` and `bingo-react/`, path-list SHA-256 `584905c5b2533d1f213d4866065de4c81f4e0ac08afec74743a39722c982698a`.
- The policy adds 33 exact M6 source, acceptance-test, operations, image-lock, package-builder and review-document paths. The final generated manifest is authoritative for the complete names and content hashes.

## Included

- Tracked backend and frontend build inputs, source, lockfiles, and acceptance tests from the fixed path snapshot.
- Explicit M6 backend/frontend source and tests, private-staging Compose/bootstrap/ingress/validation, and staging/review documents listed in `m6.2-package-inputs.json`.
- The digest lock and deterministic package builder. The package is source-only; it does not contain Docker image layers, installed dependencies, or runtime data.

## Excluded

- All `.env*` files including examples, credentials, keyfiles, private keys, backups, certificates, logs and uploads.
- `backend/.tmp-*`, WiredTiger/WT/BSON/journal/diagnostic database files, T7/T8 metrics and diagnostic JSON, and `docs/m6-t8-inventory.json`.
- `bingo-react/public/music/**`, including ignored commercial and karaoke media; `.DS_Store`; `node_modules`, `dist`, coverage, and other generated output.
- `odd/**`, internal patches/task ledgers, rehearsal configuration, unrelated root docs, and local-media tools.

The package builder independently rejects excluded paths and symlinks. It verifies the Git base/index, the filtered tracked-path hash, exact explicit untracked paths, size bounds, manifest/archive equality and high-confidence secret patterns. The scanner is heuristic, not a guarantee that arbitrary secrets cannot exist. No excluded local contents are read or transferred.

## Immutable references and integrity

`ops/private-staging/m6.2-image-lock.json` records official Docker Hub metadata for the currently configured image tags, both their OCI index digests and the selected Linux/amd64 child digests. Compose and Dockerfiles use the child digests directly. Version selection was not upgraded or vulnerability-reviewed; older Nginx/Traefik tag lifecycle/security review remains a gate.

The builder computes a release ID from the base HEAD, platform, image lock, exact source path snapshot and every included file hash. It writes deterministic gzip/USTAR bytes with normalized owner, mode and mtime, then verifies every archive member before writing to the owner-authorized, exclusive temporary directory `/private/tmp/bingo-m6.2-release-020d654`. The builder refuses a different output path or an existing target; it does not overwrite. Rebuilding requires the same base HEAD, empty staged index, allowlisted bytes and image lock. Any changed byte/path produces a different release identity.

## Validation boundary

Only static tests and metadata-only image digest lookups are in scope. No image or npm dependency download, Docker build/runtime, service start, MongoDB, VPS contact, deployment, push, commit, or deletion is performed. npm dependencies are represented by lockfiles but Docker builds still require a controlled package source. Runtime/bootstrap/ingress, quota, backups/restore, Tailscale access, resource headroom and image lifecycle/security remain separate staging gates.
