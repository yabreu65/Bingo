#!/usr/bin/env bash
# M6.1B is an explicitly gated future runtime runner. Static checks must read
# this file, never source it. No runtime is authorized by this file's presence.
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
readonly REPO_ROOT
readonly COMPOSE_FILE="$SCRIPT_DIR/compose.yaml"
readonly MIN_FREE_BYTES=$((10 * 1024 * 1024 * 1024))
readonly MAX_DISK_DELTA_BYTES=$((5 * 1024 * 1024 * 1024))
readonly MAX_TOTAL_SECONDS=900
readonly OWNER_LABEL='com.bingo.owner'
readonly OWNER_VALUE='bingo-private-staging'
readonly PROJECT_LABEL='com.docker.compose.project'
readonly VALIDATION_LABEL='com.bingo.validation'
readonly M61B_PINNED_MONGO_IMAGE='mongo:7.0@sha256:e634fcaae4d0915b365fb88c076dd33c851ed61a611c7ee9816aba6d6b5159cd'
readonly M61B_PINNED_NODE_IMAGE='node:22-alpine@sha256:025b8e975a61d94e33abeafaad1255ef44e4898cf1a1b6446860009c72e6d284'

usage() {
  printf '%s\n' \
    'M6.1B MongoDB validation runner (runtime is not authorized by default).' \
    'Usage: M61B_RUNTIME_APPROVED=YES M61B_MONGO_IMAGE=mongo:7.0@sha256:e634fcaae4d0915b365fb88c076dd33c851ed61a611c7ee9816aba6d6b5159cd M61B_NODE_IMAGE=node:22-alpine@sha256:025b8e975a61d94e33abeafaad1255ef44e4898cf1a1b6446860009c72e6d284 validate-mongodb-m6.1b.sh --runtime' \
    'This command requires separate owner authorization before invocation.'
}

if [[ "${1:-}" == '--help' ]]; then usage; exit 0; fi
if [[ "$#" -ne 1 || "$1" != '--runtime' || "${M61B_RUNTIME_APPROVED:-}" != 'YES' ]]; then
  usage >&2
  exit 64
fi

PROJECT=''
RUN_ID=''
DOCKER_CONTEXT_PIN=''
WORK_DIR=''
INVENTORY_DIR=''
BASELINE_READY=0
SECRET_DIR=''
ENV_FILE=''
BACKEND_ENV_FILE=''
PROBE_ENV_FILE=''
KEYFILE=''
BACKEND_DIR=''
BACKEND_LOG_DIR=''
BACKEND_CONTAINER=''
START_FREE_BYTES=0
DOCKER_ROOT_DIR=''
START_SECONDS=$SECONDS
CLEANUP_FAILED=0
RUN_STATUS='NOT_STARTED'

docker() {
  env -i PATH="${PATH:-/usr/bin:/bin}" HOME="${HOME:-/}" \
    DOCKER_CONFIG="${DOCKER_CONFIG:-${HOME:-/}/.docker}" \
    DOCKER_CONTEXT="$DOCKER_CONTEXT_PIN" COMPOSE_DISABLE_ENV_FILE=1 \
    docker "$@"
}

compose() {
  docker compose --project-name "$PROJECT" \
    --env-file "$ENV_FILE" --file "$COMPOSE_FILE" "$@"
}

available_bytes() {
  local free_kib
  free_kib=$(df -Pk "$DOCKER_ROOT_DIR" | awk 'NR == 2 { print $4 }') || return 1
  [[ "$free_kib" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "$((free_kib * 1024))"
}

check_budget() {
  local free delta elapsed
  free=$(available_bytes)
  delta=$((START_FREE_BYTES - free))
  elapsed=$((SECONDS - START_SECONDS))
  if (( free < MIN_FREE_BYTES )); then
    printf 'STOP_DISK_FLOOR free_bytes=%s minimum_bytes=%s\n' "$free" "$MIN_FREE_BYTES" >&2
    return 1
  fi
  if (( delta > MAX_DISK_DELTA_BYTES )); then
    printf 'STOP_DISK_DELTA delta_bytes=%s maximum_bytes=%s\n' "$delta" "$MAX_DISK_DELTA_BYTES" >&2
    return 1
  fi
  if (( elapsed > MAX_TOTAL_SECONDS )); then
    printf 'STOP_RUNTIME_LIMIT elapsed_seconds=%s limit_seconds=%s\n' "$elapsed" "$MAX_TOTAL_SECONDS" >&2
    return 1
  fi
}

capture_inventory() {
  local prefix="$1"
  docker ps -a --no-trunc --format '{{.ID}}|{{.Names}}|{{.Image}}' | LC_ALL=C sort > "$prefix.containers" || return 1
  docker network ls --no-trunc --format '{{.ID}}|{{.Name}}' | LC_ALL=C sort > "$prefix.networks" || return 1
  docker volume ls --format '{{.Name}}' | LC_ALL=C sort > "$prefix.volumes" || return 1
  docker image ls --no-trunc --digests --format '{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Digest}}' | LC_ALL=C sort > "$prefix.images" || return 1
}

protected_services_healthy() {
  local name state health
  for name in buildingos-minio buildingos-mailpit cocinacore_redis_local \
    cocinacore_postgres_local buildingos-postgres buildingos-redis; do
    state=$(docker inspect --format '{{.State.Status}}' "$name") || return 1
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name") || return 1
    [[ "$state" == 'running' && "$health" == 'healthy' ]] || return 1
  done
}

run_bounded() {
  local limit="$1" output_name="$2"; shift 2
  local pid elapsed=0 exit_code
  "$@" > "$WORK_DIR/$output_name.log" 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if (( elapsed >= limit )) || ! check_budget; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  if wait "$pid"; then exit_code=0; else exit_code=$?; fi
  return "$exit_code"
}

wait_for_initial_mongo() {
  local container_id="$1" limit="$2" elapsed=0
  while (( elapsed < limit )); do
    if run_bounded 5 initial-mongo-ping docker exec "$container_id" mongosh --quiet --eval \
      'const a=db.getSiblingDB("admin"); if(a.auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD)!==1||a.runCommand({ping:1}).ok!==1)quit(1)'; then return 0; fi
    check_budget || return 1
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

wait_for_health() {
  local container_id="$1" limit="$2" elapsed=0 health
  while (( elapsed < limit )); do
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || printf 'missing')
    [[ "$health" == 'healthy' ]] && return 0
    check_budget || return 1
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

wait_for_http_status() {
  local container_id="$1" expected="$2" limit="$3" elapsed=0 status
  while (( elapsed < limit )); do
    status=$(docker exec "$container_id" node -e \
      'fetch("http://127.0.0.1:5001/api/ready",{signal:AbortSignal.timeout(10000)}).then(r=>{process.stdout.write(String(r.status));process.exit(0)}).catch(()=>process.exit(2))' \
      2>/dev/null || true)
    [[ "$status" == "$expected" ]] && return 0
    check_budget || return 1
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

read_resource_label() {
  local kind="$1" resource="$2" label="$3"
  case "$kind" in
    container) docker inspect --format "{{index .Config.Labels \"$label\"}}" "$resource" ;;
    volume|network) docker "$kind" inspect --format "{{index .Labels \"$label\"}}" "$resource" ;;
    *) return 2 ;;
  esac
}

baseline_contains() {
  local kind="$1" value="$2" file="$3" status
  [[ -r "$file" ]] || return 2
  case "$kind" in
    container)
      awk -F'|' -v id="$value" '$1 == id { found=1 } END { exit found ? 0 : 1 }' "$file"
      status=$?
      ;;
    volume)
      grep -Fxq "$value" "$file"
      status=$?
      ;;
    network)
      awk -F'|' -v name="$value" '$2 == name { found=1 } END { exit found ? 0 : 1 }' "$file"
      status=$?
      ;;
    *) return 2 ;;
  esac
  case "$status" in 0|1) return "$status" ;; *) return 2 ;; esac
}

collect_cleanup_candidates() {
  docker ps -aq --no-trunc --filter "label=$PROJECT_LABEL=$PROJECT" --filter "label=$VALIDATION_LABEL=$RUN_ID" \
    > "$INVENTORY_DIR/candidates.containers" || return 1
  docker volume ls -q --filter "label=$PROJECT_LABEL=$PROJECT" --filter "label=$VALIDATION_LABEL=$RUN_ID" \
    > "$INVENTORY_DIR/candidates.volumes" || return 1
  docker network ls --format '{{.Name}}' --filter "label=$PROJECT_LABEL=$PROJECT" --filter "label=$VALIDATION_LABEL=$RUN_ID" \
    > "$INVENTORY_DIR/candidates.networks" || return 1
}

validate_resource_owned() {
  local kind="$1" resource="$2" baseline_kind="$3" baseline_file="$4"
  local project owner validation baseline_status
  project=$(read_resource_label "$kind" "$resource" "$PROJECT_LABEL" 2>/dev/null) || {
    printf 'CLEANUP_LABEL_INSPECT_FAILED\n' >&2; return 1;
  }
  owner=$(read_resource_label "$kind" "$resource" "$OWNER_LABEL" 2>/dev/null) || {
    printf 'CLEANUP_LABEL_INSPECT_FAILED\n' >&2; return 1;
  }
  validation=$(read_resource_label "$kind" "$resource" "$VALIDATION_LABEL" 2>/dev/null) || {
    printf 'CLEANUP_LABEL_INSPECT_FAILED\n' >&2; return 1;
  }
  if [[ "$project" != "$PROJECT" || "$owner" != "$OWNER_VALUE" || "$validation" != "$RUN_ID" ]]; then
    printf 'CLEANUP_REFUSED_RESOURCE_NOT_OWNED\n' >&2; return 1;
  fi
  baseline_contains "$baseline_kind" "$resource" "$baseline_file"
  baseline_status=$?
  if (( baseline_status != 1 )); then
    printf 'CLEANUP_RESOURCE_BASELINE_VALIDATION_FAILED\n' >&2; return 1;
  fi
}

validate_cleanup_candidates() {
  local id volume network attached
  : > "$INVENTORY_DIR/delete.containers" || return 1
  : > "$INVENTORY_DIR/delete.volumes" || return 1
  : > "$INVENTORY_DIR/delete.networks" || return 1
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    validate_resource_owned container "$id" container "$INVENTORY_DIR/before.containers" || return 1
    printf '%s\n' "$id" >> "$INVENTORY_DIR/delete.containers" || return 1
  done < "$INVENTORY_DIR/candidates.containers"
  while IFS= read -r volume; do
    [[ -n "$volume" ]] || continue
    validate_resource_owned volume "$volume" volume "$INVENTORY_DIR/before.volumes" || return 1
    attached=$(docker ps -aq --filter "volume=$volume") || return 1
    if [[ -n "$attached" ]]; then
      printf 'CLEANUP_REFUSED_VOLUME_MOUNTED\n' >&2; return 1;
    fi
    printf '%s\n' "$volume" >> "$INVENTORY_DIR/delete.volumes" || return 1
  done < "$INVENTORY_DIR/candidates.volumes"
  while IFS= read -r network; do
    [[ -n "$network" ]] || continue
    validate_resource_owned network "$network" network "$INVENTORY_DIR/before.networks" || return 1
    printf '%s\n' "$network" >> "$INVENTORY_DIR/delete.networks" || return 1
  done < "$INVENTORY_DIR/candidates.networks"
}

remove_owned_containers() {
  local id
  [[ -r "$INVENTORY_DIR/delete.containers" ]] || { CLEANUP_FAILED=1; return 1; }
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    docker rm -f "$id" >/dev/null || { CLEANUP_FAILED=1; return 1; }
  done < "$INVENTORY_DIR/delete.containers"
}

remove_owned_volumes() {
  local volume
  [[ -r "$INVENTORY_DIR/delete.volumes" ]] || { CLEANUP_FAILED=1; return 1; }
  while IFS= read -r volume; do
    [[ -n "$volume" ]] || continue
    docker volume rm "$volume" >/dev/null || { CLEANUP_FAILED=1; return 1; }
  done < "$INVENTORY_DIR/delete.volumes"
}

remove_owned_networks() {
  local network
  [[ -r "$INVENTORY_DIR/delete.networks" ]] || { CLEANUP_FAILED=1; return 1; }
  while IFS= read -r network; do
    [[ -n "$network" ]] || continue
    docker network rm "$network" >/dev/null || { CLEANUP_FAILED=1; return 1; }
  done < "$INVENTORY_DIR/delete.networks"
}

on_signal() { exit 130; }

preflight() {
  [[ "${M61B_MONGO_IMAGE:-}" == "$M61B_PINNED_MONGO_IMAGE" ]] || {
    printf 'PREFLIGHT_FAIL_MONGO_IMAGE_MUST_BE_IMMUTABLE_DIGEST\n' >&2; return 1;
  }
  [[ "${M61B_NODE_IMAGE:-}" == "$M61B_PINNED_NODE_IMAGE" ]] || {
    printf 'PREFLIGHT_FAIL_NODE_IMAGE_MUST_BE_IMMUTABLE_DIGEST\n' >&2; return 1;
  }
  command -v docker >/dev/null || { printf 'PREFLIGHT_FAIL_DOCKER_CLI_UNAVAILABLE\n' >&2; return 1; }
  command -v env >/dev/null || { printf 'PREFLIGHT_FAIL_ENV_UNAVAILABLE\n' >&2; return 1; }
  command -v openssl >/dev/null || { printf 'PREFLIGHT_FAIL_OPENSSL_UNAVAILABLE\n' >&2; return 1; }
  command -v node >/dev/null || { printf 'PREFLIGHT_FAIL_NODE_UNAVAILABLE\n' >&2; return 1; }
  command -v tar >/dev/null || { printf 'PREFLIGHT_FAIL_TAR_UNAVAILABLE\n' >&2; return 1; }
  [[ "$(uname -s)" == 'Linux' ]] || {
    printf 'PREFLIGHT_FAIL_LINUX_HOST_REQUIRED_FOR_DISK_GUARD\n' >&2; return 1;
  }
  local docker_host repo_device docker_device
  DOCKER_CONTEXT_PIN=$(env -i PATH="${PATH:-/usr/bin:/bin}" HOME="${HOME:-/}" \
    DOCKER_CONFIG="${DOCKER_CONFIG:-${HOME:-/}/.docker}" docker context show) || return 1
  [[ -n "$DOCKER_CONTEXT_PIN" ]] || { printf 'PREFLIGHT_FAIL_DOCKER_CONTEXT_UNAVAILABLE\n' >&2; return 1; }
  docker_host=$(docker context inspect --format '{{(index .Endpoints "docker").Host}}' "$DOCKER_CONTEXT_PIN") || return 1
  [[ "$docker_host" == unix://* ]] || { printf 'PREFLIGHT_FAIL_LOCAL_UNIX_DOCKER_CONTEXT_REQUIRED\n' >&2; return 1; }
  [[ "$(docker info --format '{{.ServerVersion}}')" ]] || {
    printf 'PREFLIGHT_FAIL_DOCKER_ENGINE_UNAVAILABLE\n' >&2; return 1;
  }
  DOCKER_ROOT_DIR=$(docker info --format '{{.DockerRootDir}}')
  [[ -d "$DOCKER_ROOT_DIR" ]] || { printf 'PREFLIGHT_FAIL_DOCKER_ROOT_NOT_HOST_VISIBLE\n' >&2; return 1; }
  repo_device=$(df -Pk "$REPO_ROOT" | awk 'NR == 2 { print $1 }') || return 1
  docker_device=$(df -Pk "$DOCKER_ROOT_DIR" | awk 'NR == 2 { print $1 }') || return 1
  [[ -n "$repo_device" && -n "$docker_device" && "$repo_device" == "$docker_device" ]] || {
    printf 'PREFLIGHT_FAIL_REPOSITORY_AND_DOCKER_STORAGE_MUST_SHARE_DEVICE\n' >&2; return 1;
  }
  protected_services_healthy || { printf 'PREFLIGHT_FAIL_PROTECTED_SERVICE_HEALTH\n' >&2; return 1; }
  START_FREE_BYTES=$(available_bytes) || { printf 'PREFLIGHT_FAIL_DISK_CAPACITY_UNAVAILABLE\n' >&2; return 1; }
  (( START_FREE_BYTES >= MIN_FREE_BYTES )) || { printf 'PREFLIGHT_FAIL_DISK_HEADROOM\n' >&2; return 1; }
  PROJECT="bingo-m61b-$(date -u +%Y%m%d%H%M%S)-$(openssl rand -hex 4)" || return 1
  RUN_ID=$(openssl rand -hex 16) || return 1
  [[ "$RUN_ID" =~ ^[a-f0-9]{32}$ ]] || { printf 'PREFLIGHT_FAIL_RUN_ID_GENERATION\n' >&2; return 1; }
  local existing_containers existing_networks existing_volumes
  existing_containers=$(docker ps -aq --filter "label=$PROJECT_LABEL=$PROJECT") || return 1
  existing_networks=$(docker network ls -q --filter "label=$PROJECT_LABEL=$PROJECT") || return 1
  existing_volumes=$(docker volume ls -q --filter "label=$PROJECT_LABEL=$PROJECT") || return 1
  if [[ -n "$existing_containers" || -n "$existing_networks" || -n "$existing_volumes" ]]; then
    printf 'PREFLIGHT_FAIL_PROJECT_COLLISION\n' >&2; return 1;
  fi
  WORK_DIR=$(mktemp -d "$SCRIPT_DIR/.m6.1b-$PROJECT.XXXXXX") || return 1
  chmod 700 "$WORK_DIR" || return 1
  printf '%s' "$PROJECT" > "$WORK_DIR/OWNER-MARKER" || return 1
  trap cleanup EXIT
  SECRET_DIR="$WORK_DIR/secrets"
  INVENTORY_DIR="$WORK_DIR/inventory"
  BACKEND_DIR="$WORK_DIR/backend"
  BACKEND_LOG_DIR="$WORK_DIR/backend-logs"
  mkdir -m 700 "$SECRET_DIR" "$INVENTORY_DIR" "$BACKEND_DIR" "$BACKEND_LOG_DIR" || return 1
  ENV_FILE="$SECRET_DIR/compose.env"
  BACKEND_ENV_FILE="$SECRET_DIR/backend.env"
  PROBE_ENV_FILE="$SECRET_DIR/probe.env"
  KEYFILE="$SECRET_DIR/mongo-keyfile"
  BACKEND_CONTAINER="${PROJECT}-backend"
  capture_inventory "$INVENTORY_DIR/before" || { printf 'PREFLIGHT_FAIL_DOCKER_INVENTORY\n' >&2; return 1; }
  docker system df > "$INVENTORY_DIR/docker-system-df.before" || { printf 'PREFLIGHT_FAIL_DOCKER_SYSTEM_DF\n' >&2; return 1; }
  BASELINE_READY=1
  if ! docker image inspect "$M61B_MONGO_IMAGE" >/dev/null 2>&1 ||
    ! docker image inspect "$M61B_NODE_IMAGE" >/dev/null 2>&1; then
    printf 'PREFLIGHT_FAIL_PINNED_IMAGES_NOT_PRELOADED; runner never pulls images\n' >&2
    return 1
  fi

}

write_synthetic_inputs() {
  node - "$ENV_FILE" "$BACKEND_ENV_FILE" "$PROBE_ENV_FILE" "$KEYFILE" "$RUN_ID" "$BACKEND_LOG_DIR" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const [composePath, backendPath, probePath, keyPath, runId, logDir] = process.argv.slice(2);
const hex = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
const rootUser = `m6b_root_${hex(8)}`;
const rootPassword = hex(48);
const appUser = `m6b_app_${hex(8)}`;
const appPassword = hex(48);
const jwtSecret = hex(48);
const uri = `mongodb://${appUser}:${appPassword}@mongo:27017/bingo_private?replicaSet=bingo-rs&authSource=bingo_private`;
const common = [
  `MONGODB_URI=${uri}`,
  `M6B_RUN_ID=${runId}`
];
const composeValues = [
  `MONGO_KEYFILE_PATH=${keyPath}`,
  `MONGO_ROOT_USERNAME=${rootUser}`,
  `MONGO_ROOT_PASSWORD=${rootPassword}`,
  `MONGO_INITDB_ROOT_USERNAME=${rootUser}`,
  `MONGO_INITDB_ROOT_PASSWORD=${rootPassword}`,
  ...common,
  `JWT_SECRET=${jwtSecret}`,
  'NODE_ENV=production',
  'PORT=5001',
  'FRONTEND_URL=https://m6-1b.invalid',
  'BINGO_ACCESS_MODE=public',
  'ALLOWED_ORIGINS=https://m6-1b.invalid',
  'TRUST_PROXY_HOPS=1',
  'SPOTIFY_CLIENT_ID=',
  'SPOTIFY_CLIENT_SECRET=',
  'SPOTIFY_REDIRECT_URI=http://localhost:5001/api/spotify/callback',
  'YOUTUBE_API_KEY=',
  'ANTHROPIC_API_KEY='
];
const backendValues = [
  ...common,
  `JWT_SECRET=${jwtSecret}`,
  'NODE_ENV=production',
  'PORT=5001',
  'FRONTEND_URL=https://m6-1b.invalid',
  'BINGO_ACCESS_MODE=public',
  'ALLOWED_ORIGINS=https://m6-1b.invalid',
  'TRUST_PROXY_HOPS=1',
  'SPOTIFY_CLIENT_ID=',
  'SPOTIFY_CLIENT_SECRET=',
  'SPOTIFY_REDIRECT_URI=http://localhost:5001/api/spotify/callback',
  'YOUTUBE_API_KEY=',
  'ANTHROPIC_API_KEY='
];
const probeValues = [
  `MONGO_ROOT_USERNAME=${rootUser}`,
  `MONGO_ROOT_PASSWORD=${rootPassword}`,
  ...common
];
for (const [file, values] of [[composePath, composeValues], [backendPath, backendValues], [probePath, probeValues]]) {
  fs.writeFileSync(file, `${values.join('\n')}\n`, { mode: 0o600 });
}
fs.writeFileSync(keyPath, crypto.randomBytes(512).toString('base64'), { mode: 0o400 });
fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
NODE
  chmod 600 "$ENV_FILE" "$BACKEND_ENV_FILE" "$PROBE_ENV_FILE"
  chmod 400 "$KEYFILE"
}

prepare_backend_source() {
  tar -C "$REPO_ROOT/backend" \
    --exclude='./.env' --exclude='./.env.*' --exclude='./node_modules' \
    --exclude='./logs' --exclude='./uploads' --exclude='./secrets' --exclude='./.git' \
    --exclude='./.tmp-*' --exclude='./.t7-*.json' --exclude='./.t8-*.json' \
    --exclude='./WiredTiger*' --exclude='./*.wt' --exclude='./*.bson' \
    --exclude='./journal' --exclude='./diagnostic.data' \
    -cf - . | tar -C "$BACKEND_DIR" -xf -
  [[ ! -e "$BACKEND_DIR/.env" && ! -e "$BACKEND_DIR/node_modules" ]] || return 1
  mkdir -p "$BACKEND_DIR/logs"
  chmod 777 "$BACKEND_DIR/logs" "$BACKEND_LOG_DIR"
  run_bounded 300 npm-install docker run --pull=never --rm --label "$PROJECT_LABEL=$PROJECT" --label "$OWNER_LABEL=$OWNER_VALUE" --label "$VALIDATION_LABEL=$RUN_ID" --network bridge --memory 1g --cpus 1 \
    --mount "type=bind,source=$BACKEND_DIR,target=/workspace" \
    --workdir /workspace --entrypoint sh "$M61B_NODE_IMAGE" -c \
    'npm ci --omit=dev --cache /tmp/m6.1b-npm-cache --silent' || return 1
  check_budget
}

install_probe() {
  cat > "$WORK_DIR/m6.1b-probe.js" <<'NODE'
'use strict';
const mongoose = require('mongoose');
const fail = () => { process.stderr.write('M6_1B_MONGO_PROBE_FAIL\n'); process.exit(1); };
const connect = async uri => {
  const instance = new mongoose.Mongoose();
  await instance.connect(uri, { serverSelectionTimeoutMS: 3000, maxPoolSize: 2 });
  return instance;
};
async function rejects(uri) {
  let instance;
  try {
    instance = await connect(uri);
    await instance.connection.db.admin().command({ ping: 1 });
    return false;
  } catch { return true; }
  finally { if (instance) await instance.disconnect().catch(() => {}); }
}
async function main() {
  const runId = process.env.M6B_RUN_ID;
  const appUri = process.env.MONGODB_URI;
  if (process.env.M6B_MODE === 'verify-persisted') {
    const app = await connect(appUri);
    const col = app.connection.db.collection('m6_1b_runner_probe');
    const committed = await col.countDocuments({ _id: `${runId}-committed` });
    const rolledBack = await col.countDocuments({ _id: `${runId}-rolled-back` });
    if (committed !== 1 || rolledBack !== 0) throw new Error('persistence-check');
    await col.deleteMany({ runId }); await app.disconnect();
    process.stdout.write('M6_1B_MONGOOSE_TRANSACTION_PERSISTENCE_PASS\n'); return;
  }
  const rootUri = `mongodb://${encodeURIComponent(process.env.MONGO_ROOT_USERNAME)}:${encodeURIComponent(process.env.MONGO_ROOT_PASSWORD)}@mongo:27017/admin?replicaSet=bingo-rs&authSource=admin`;
  const admin = await connect(rootUri);
  await admin.connection.db.admin().command({ ping: 1 }); await admin.disconnect();
  if (!(await rejects(rootUri.replace(/:[^:@/]+@/, ':invalid-m6b-test-password@')))) throw new Error('root-negative-auth');
  if (!(await rejects(appUri.replace(/:[^:@/]+@/, ':invalid-m6b-test-password@')))) throw new Error('app-negative-auth');
  const app = await connect(appUri);
  const col = app.connection.db.collection('m6_1b_runner_probe');
  await col.insertOne({ _id: `${runId}-baseline`, runId });
  await app.connection.transaction(async session => {
    await col.insertOne({ _id: `${runId}-committed`, runId }, { session });
  });
  let rollbackObserved = false;
  try {
    await app.connection.transaction(async session => {
      await col.insertOne({ _id: `${runId}-rolled-back`, runId }, { session });
      throw new Error('synthetic-abort');
    });
  } catch { rollbackObserved = true; }
  if (!rollbackObserved || await col.countDocuments({ _id: `${runId}-committed` }) !== 1 ||
      await col.countDocuments({ _id: `${runId}-rolled-back` }) !== 0) throw new Error('transaction-check');
  await app.disconnect(); process.stdout.write('M6_1B_MONGOOSE_AUTH_TRANSACTION_PASS\n');
}
main().catch(() => fail());
NODE
  chmod 600 "$WORK_DIR/m6.1b-probe.js"
}

run_mongo_probe() {
  local name="$1"; shift
  run_bounded 90 "$name" docker run --pull=never --rm \
    --label "$PROJECT_LABEL=$PROJECT" --label "$OWNER_LABEL=$OWNER_VALUE" \
    --label "$VALIDATION_LABEL=$RUN_ID" --network "$DB_NETWORK" \
    --memory 256m --cpus 0.5 --env-file "$PROBE_ENV_FILE" "$@" \
    --mount "type=bind,source=$BACKEND_DIR,target=/workspace,readonly" \
    --mount "type=bind,source=$WORK_DIR/m6.1b-probe.js,target=/workspace/m6.1b-probe.js,readonly" \
    --workdir /workspace --entrypoint node "$M61B_NODE_IMAGE" /workspace/m6.1b-probe.js
}

assert_no_published_ports() {
  local id ports
  for id in "$@"; do
    [[ -n "$id" ]] || return 1
    ports=$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$id") || return 1
    [[ "$ports" != *'HostPort'* ]] || return 1
  done
}

cleanup() {
  local exit_code=$? inventory_match=1 evidence_dir
  trap - EXIT INT TERM HUP
  set +e
  printf 'RUN_EXIT status=%s exit_code=%s\n' "$RUN_STATUS" "$exit_code"
  if (( BASELINE_READY != 1 )); then
    printf 'CLEANUP_SKIPPED_BASELINE_UNAVAILABLE\n' >&2
    CLEANUP_FAILED=1
  elif collect_cleanup_candidates && validate_cleanup_candidates; then
    if remove_owned_containers; then
      if remove_owned_volumes; then
        remove_owned_networks || CLEANUP_FAILED=1
      else
        CLEANUP_FAILED=1
      fi
    else
      CLEANUP_FAILED=1
    fi
  else
    printf 'CLEANUP_CANDIDATE_VALIDATION_FAILED\n' >&2
    CLEANUP_FAILED=1
  fi

  if [[ -n "$INVENTORY_DIR" && -f "$INVENTORY_DIR/before.containers" ]]; then
    capture_inventory "$INVENTORY_DIR/after" || inventory_match=0
    docker system df > "$INVENTORY_DIR/after.system-df" || inventory_match=0
    diff -u "$INVENTORY_DIR/docker-system-df.before" "$INVENTORY_DIR/after.system-df" >/dev/null || inventory_match=0
    for kind in containers networks volumes images; do
      diff -u "$INVENTORY_DIR/before.$kind" "$INVENTORY_DIR/after.$kind" >/dev/null || inventory_match=0
    done
    if (( inventory_match )); then printf 'DOCKER_INVENTORY_DIFF_PASS\n';
    else printf 'DOCKER_INVENTORY_DIFF_FAIL\n'; CLEANUP_FAILED=1; fi
  else
    printf 'DOCKER_INVENTORY_DIFF_NOT_RUN\n'; CLEANUP_FAILED=1
  fi
  if protected_services_healthy; then printf 'SIX_PROTECTED_CONTAINERS_HEALTHY_PASS\n';
  else printf 'SIX_PROTECTED_CONTAINERS_HEALTHY_FAIL\n'; CLEANUP_FAILED=1; fi

  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" && -f "$WORK_DIR/OWNER-MARKER" &&
    "$(<"$WORK_DIR/OWNER-MARKER")" == "$PROJECT" ]]; then
    if (( CLEANUP_FAILED )); then
      mkdir -p -- "$REPO_ROOT/odd/evidence"
      evidence_dir=$(mktemp -d "$REPO_ROOT/odd/evidence/m6.1b-failed-$PROJECT.XXXXXX") || evidence_dir=''
      if [[ -n "$evidence_dir" ]] && cp -- "$INVENTORY_DIR"/before.* \
        "$INVENTORY_DIR"/after.* "$INVENTORY_DIR"/docker-system-df.before "$evidence_dir"/ 2>/dev/null; then
        printf 'SANITIZED_INVENTORY_EVIDENCE=%s\n' "$evidence_dir"
      else
        printf 'SANITIZED_INVENTORY_EVIDENCE_SAVE_FAIL\n' >&2
      fi
    fi
    if ! rm -rf -- "$WORK_DIR" || [[ -e "$WORK_DIR" ]]; then
      printf 'TEMP_WORKDIR_REMOVE_FAIL path=%s\n' "$WORK_DIR" >&2
      CLEANUP_FAILED=1
    fi
  else
    printf 'TEMP_OWNER_MARKER_MISMATCH path=%s\n' "$WORK_DIR" >&2
    CLEANUP_FAILED=1
  fi
  local free_after
  free_after=$(available_bytes 2>/dev/null || printf '0')
  printf 'DISK_BEFORE_BYTES=%s DISK_AFTER_BYTES=%s\n' "$START_FREE_BYTES" "$free_after"
  if (( CLEANUP_FAILED )); then printf 'CLEANUP_FAIL\n'; exit_code=1; else printf 'CLEANUP_PASS\n'; fi
  printf 'M6_1B_RESULT=%s\n' "$([[ $exit_code == 0 && $CLEANUP_FAILED == 0 ]] && printf PASS || printf FAIL)"
  exit "$exit_code"
}

trap on_signal INT TERM HUP

preflight || exit 1
trap cleanup EXIT
RUN_STATUS='PREFLIGHT_PASS'
write_synthetic_inputs
install_probe
compose config --no-interpolate --quiet

RUN_STATUS='KEYFILE_PREFLIGHT'
MONGO_UID=$(docker run --pull=never --rm --label "$PROJECT_LABEL=$PROJECT" --label "$OWNER_LABEL=$OWNER_VALUE" --label "$VALIDATION_LABEL=$RUN_ID" --memory 128m --cpus 0.25 --network none --entrypoint id "$M61B_MONGO_IMAGE" -u mongodb)
MONGO_GID=$(docker run --pull=never --rm --label "$PROJECT_LABEL=$PROJECT" --label "$OWNER_LABEL=$OWNER_VALUE" --label "$VALIDATION_LABEL=$RUN_ID" --memory 128m --cpus 0.25 --network none --entrypoint id "$M61B_MONGO_IMAGE" -g mongodb)
[[ "$MONGO_UID" =~ ^[0-9]+$ && "$MONGO_GID" =~ ^[0-9]+$ ]] || exit 1
docker run --pull=never --rm --label "$PROJECT_LABEL=$PROJECT" --label "$OWNER_LABEL=$OWNER_VALUE" --label "$VALIDATION_LABEL=$RUN_ID" --memory 128m --cpus 0.25 --network none --mount "type=bind,source=$KEYFILE,target=/keyfile" \
  --entrypoint chown "$M61B_MONGO_IMAGE" "$MONGO_UID:$MONGO_GID" /keyfile >/dev/null 2>&1
if ! KEYFILE_STAT=$(docker run --pull=never --rm --label "$PROJECT_LABEL=$PROJECT" --label "$OWNER_LABEL=$OWNER_VALUE" --label "$VALIDATION_LABEL=$RUN_ID" --memory 128m --cpus 0.25 --network none \
  --mount "type=bind,source=$KEYFILE,target=/keyfile,readonly" \
  --entrypoint stat "$M61B_MONGO_IMAGE" -c '%u:%g %a' /keyfile 2>/dev/null); then
  printf 'PREFLIGHT_FAIL_KEYFILE_STAT_EXIT\n' >&2
  exit 1
fi
if [[ "$KEYFILE_STAT" != "$MONGO_UID:$MONGO_GID 400" ]]; then
  printf 'PREFLIGHT_FAIL_KEYFILE_METADATA\n' >&2
  exit 1
fi
printf 'KEYFILE_UID_MODE_PASS\n'
check_budget

RUN_STATUS='PREPARE_BACKEND_SOURCE'
prepare_backend_source
install_probe

RUN_STATUS='START_MONGO_AND_BOOTSTRAP'
run_bounded 120 compose-up compose up -d --no-deps mongo || { printf 'MONGO_START_FAIL\n'; exit 1; }
MONGO_CONTAINER=$(compose ps -q mongo)
[[ -n "$MONGO_CONTAINER" ]]
wait_for_initial_mongo "$MONGO_CONTAINER" 120 || { printf 'MONGO_INITIAL_AUTHENTICATED_PING_FAIL\n'; exit 1; }
run_bounded 240 compose-bootstrap compose run --rm --no-deps mongo-bootstrap || {
  BOOTSTRAP_CLASS=$(grep -Eo 'phase=[a-z-]+ reason=[a-z-]+' "$WORK_DIR/compose-bootstrap.log" | tail -1 || true)
  printf 'BOOTSTRAP_FAIL %s\n' "${BOOTSTRAP_CLASS:-class=unclassified}"
  exit 1
}
wait_for_health "$MONGO_CONTAINER" 150 || { printf 'MONGO_HEALTH_FAIL\n'; exit 1; }
assert_no_published_ports "$MONGO_CONTAINER" || { printf 'PREFLIGHT_FAIL_HOST_PORT_MAPPING\n'; exit 1; }

RUN_STATUS='START_BACKEND'
DB_NETWORK=$(docker network ls -q --filter "label=$PROJECT_LABEL=$PROJECT" --filter 'label=com.docker.compose.network=database' | head -1)
[[ -n "$DB_NETWORK" && "$(docker network inspect --format '{{.Internal}}' "$DB_NETWORK")" == 'true' ]]
if ! run_bounded 60 backend-start docker run --pull=never --detach --name "$BACKEND_CONTAINER" \
  --label "$PROJECT_LABEL=$PROJECT" --label "$OWNER_LABEL=$OWNER_VALUE" \
  --label "$VALIDATION_LABEL=$RUN_ID" \
  --network "$DB_NETWORK" --memory 1g --cpus 1.5 \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
  --env-file "$BACKEND_ENV_FILE" \
  --mount "type=bind,source=$BACKEND_DIR,target=/workspace,readonly" \
  --mount "type=bind,source=$BACKEND_LOG_DIR,target=/workspace/logs" \
  --user 1000:1000 --workdir /workspace --entrypoint node "$M61B_NODE_IMAGE" server.js; then
  printf 'BACKEND_START_FAIL\n'
  exit 1
fi
BACKEND_CONTAINER=$(<"$WORK_DIR/backend-start.log")
wait_for_http_status "$BACKEND_CONTAINER" 200 180 || { printf 'BACKEND_READINESS_200_FAIL\n'; exit 1; }
assert_no_published_ports "$MONGO_CONTAINER" "$BACKEND_CONTAINER" || { printf 'PREFLIGHT_FAIL_HOST_PORT_MAPPING\n'; exit 1; }

RUN_STATUS='MONGO_AUTH_TRANSACTION_AND_INDEX_PROBE'
if ! run_mongo_probe mongo-probe; then
  grep -q '^M6_1B_MONGO_PROBE_FAIL$' "$WORK_DIR/mongo-probe.log" && printf 'MONGO_PROBE_FAIL_CLASSIFIED\n' || printf 'MONGO_PROBE_FAIL_UNCLASSIFIED\n'
  exit 1
fi
grep -q '^M6_1B_MONGOOSE_AUTH_TRANSACTION_PASS$' "$WORK_DIR/mongo-probe.log" || exit 1
printf 'MONGO_AUTH_REPLICA_TRANSACTIONS_PASS\n'

RUN_STATUS='READINESS_STOP_RECOVERY_AND_PERSISTENCE'
run_bounded 60 mongo-stop compose stop mongo || { printf 'MONGO_STOP_FAIL\n'; exit 1; }
wait_for_http_status "$BACKEND_CONTAINER" 503 45 || { printf 'READINESS_503_AFTER_MONGO_STOP_FAIL\n'; exit 1; }
run_bounded 60 mongo-start compose start mongo || { printf 'MONGO_RESTART_FAIL\n'; exit 1; }
wait_for_health "$MONGO_CONTAINER" 150 || { printf 'MONGO_RECOVERY_HEALTH_FAIL\n'; exit 1; }
wait_for_http_status "$BACKEND_CONTAINER" 200 180 || { printf 'READINESS_RECOVERY_200_FAIL\n'; exit 1; }
run_mongo_probe persistence-probe --env M6B_MODE=verify-persisted || { printf 'TRANSACTION_PERSISTENCE_FAIL\n'; exit 1; }
grep -q '^M6_1B_MONGOOSE_TRANSACTION_PERSISTENCE_PASS$' "$WORK_DIR/persistence-probe.log" || exit 1
printf 'READINESS_STOP_RESTART_PERSISTENCE_PASS\n'
RUN_STATUS='RUNTIME_ASSERTIONS_PASS'
printf 'M6_1B_RUNTIME_ASSERTIONS_PASS\n'
