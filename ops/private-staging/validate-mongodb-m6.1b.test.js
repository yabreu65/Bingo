const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const runnerPath = path.join(__dirname, 'validate-mongodb-m6.1b.sh');
const runner = fs.readFileSync(runnerPath, 'utf8');
const compose = fs.readFileSync(path.join(__dirname, 'compose.yaml'), 'utf8');
const backendDockerignore = fs.readFileSync(path.join(__dirname, '../../backend/.dockerignore'), 'utf8');
const backendDockerfile = fs.readFileSync(path.join(__dirname, '../../backend/Dockerfile'), 'utf8');
const frontendDockerfile = fs.readFileSync(path.join(__dirname, '../../bingo-react/Dockerfile'), 'utf8');
const imageLock = JSON.parse(fs.readFileSync(path.join(__dirname, 'm6.2-image-lock.json'), 'utf8'));

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing section end: ${endMarker}`);
  return source.slice(start, end);
}

test('static tests inspect runner and Compose as text without launching them', () => {
  assert.ok(runner.startsWith('#!/usr/bin/env bash'));
  assert.ok(compose.startsWith('# Review-only private staging proposal'));
});

test('embedded Node helpers parse without executing or connecting to MongoDB', () => {
  const scripts = [
    runner.match(/write_synthetic_inputs\(\) \{[\s\S]*?<<'NODE'\n([\s\S]*?)\nNODE/)?.[1],
    runner.match(/install_probe\(\) \{[\s\S]*?<<'NODE'\n([\s\S]*?)\nNODE/)?.[1]
  ];
  assert.ok(scripts.every(Boolean));
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script));
});

test('runner requires explicit runtime intent and preloaded immutable image digests', () => {
  const gate = runner.indexOf('if [[ "$#" -ne 1 || "$1" != \'--runtime\' || "${M61B_RUNTIME_APPROVED:-}" != \'YES\' ]]');
  const preflight = runner.indexOf('preflight || exit 1');
  assert.ok(gate >= 0 && preflight > gate);
  assert.ok(runner.includes(`M61B_PINNED_MONGO_IMAGE='${imageLock.images.find(image => image.configuredTag === 'mongo:7.0').pinnedReference}'`));
  assert.ok(runner.includes(`M61B_PINNED_NODE_IMAGE='${imageLock.images.find(image => image.configuredTag === 'node:22-alpine').pinnedReference}'`));
  assert.ok(runner.includes('"${M61B_MONGO_IMAGE:-}" == "$M61B_PINNED_MONGO_IMAGE"'));
  assert.ok(runner.includes('"${M61B_NODE_IMAGE:-}" == "$M61B_PINNED_NODE_IMAGE"'));
  assert.match(runner, /PREFLIGHT_FAIL_PINNED_IMAGES_NOT_PRELOADED; runner never pulls images/);
  assert.doesNotMatch(runner, /docker\s+pull\b/);
  assert.match(compose, /pull_policy:\s*never/);
  assert.match(runner, /--pull=never/);
});

test('runtime and build images use the exact locked linux/amd64 child digests', () => {
  assert.equal(imageLock.targetPlatform, 'linux/amd64');
  const images = Object.fromEntries(imageLock.images.map(image => [image.configuredTag, image.pinnedReference]));
  const mongo = section(compose, '  mongo:\n', '\n  mongo-bootstrap:');
  const bootstrap = section(compose, '  mongo-bootstrap:\n', '\n  backend:');
  const ingress = section(compose, '  ingress:\n', '\nvolumes:');
  assert.match(mongo, new RegExp(`^\\s+image: ${images['mongo:7.0'].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'm'));
  assert.match(bootstrap, new RegExp(`^\\s+image: ${images['mongo:7.0'].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'm'));
  assert.match(ingress, new RegExp(`^\\s+image: ${images['traefik:v3.3'].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'm'));
  assert.match(backendDockerfile, new RegExp(`^FROM ${images['node:22-alpine'].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'm'));
  assert.match(frontendDockerfile, new RegExp(`^FROM ${images['node:22-alpine'].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')} AS build$`, 'm'));
  assert.match(frontendDockerfile, new RegExp(`^FROM ${images['nginx:1.27-alpine'].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')} AS runtime$`, 'm'));
  assert.equal((compose.match(/^    platform: linux\/amd64$/gm) || []).length, 5);
  assert.ok(runner.includes(images['mongo:7.0']));
  assert.ok(runner.includes(images['node:22-alpine']));
});

test('Compose gives Mongo explicit labelled persistent db and configdb volumes', () => {
  const mongo = section(compose, '  mongo:\n', '\n  mongo-bootstrap:');
  assert.match(mongo, /mongo-data:\/data\/db/);
  assert.match(mongo, /mongo-config-data:\/data\/configdb/);
  assert.match(mongo, /com\.bingo\.owner:\s*bingo-private-staging/);
  assert.match(mongo, /com\.bingo\.role:\s*mongo/);
  assert.match(mongo, /com\.bingo\.validation:\s*\$\{M6B_RUN_ID:-not-a-validation-run\}/);
  assert.match(mongo, /source:\s*\$\{MONGO_KEYFILE_PATH:-\.\/secrets\/mongo-keyfile\}/);
  assert.match(mongo, /target:\s*\/run\/secrets\/mongo-keyfile[\s\S]*?read_only:\s*true/);
  assert.doesNotMatch(mongo, /^\s+ports:/m);
});

test('database and application networks are internal and backend/Mongo publish no host ports', () => {
  const backend = section(compose, '  backend:\n', '\n  frontend:');
  const networks = compose.slice(compose.indexOf('networks:\n'));
  assert.doesNotMatch(backend, /^\s+ports:/m);
  assert.match(backend, /- database/);
  assert.match(compose, /database:\n\s+internal:\s+true/);
  assert.match(compose, /application:\n\s+internal:\s+true/);
  assert.match(compose, /mongo-config-data:\n\s+labels:[\s\S]*?com\.bingo\.owner:/);
  assert.match(compose, /database:\n\s+internal:\s+true[\s\S]*?com\.bingo\.validation:/);
  assert.ok(networks.includes('internal: true'));
});

test('keyfile probe fails closed and checks image UID/GID and mode before Mongo starts', () => {
  const statProbe = runner.indexOf('if ! KEYFILE_STAT=$(');
  const statCompare = runner.indexOf('if [[ "$KEYFILE_STAT" != "$MONGO_UID:$MONGO_GID 400" ]]');
  const startMongo = runner.indexOf('compose up -d --no-deps mongo');
  assert.ok(statProbe >= 0 && statCompare > statProbe && startMongo > statCompare);
  assert.match(runner, /--entrypoint stat[\s\S]*?-c '%u:%g %a' \/keyfile/);
  assert.match(runner, /PREFLIGHT_FAIL_KEYFILE_STAT_EXIT/);
  assert.match(runner, /PREFLIGHT_FAIL_KEYFILE_METADATA/);
  assert.match(runner, /--entrypoint chown[\s\S]*?"\$MONGO_UID:\$MONGO_GID" \/keyfile/);
  assert.match(runner, /chmod 400 "\$KEYFILE"/);
});

test('runner sanitizes and pins the Docker context before using Compose inputs', () => {
  assert.match(runner, /env -i PATH=[\s\S]*?DOCKER_CONTEXT="\$DOCKER_CONTEXT_PIN" COMPOSE_DISABLE_ENV_FILE=1/);
  assert.match(runner, /DOCKER_CONTEXT_PIN=\$\(env -i[\s\S]*docker context show\)/);
  assert.match(runner, /docker context inspect[\s\S]*?"\$DOCKER_CONTEXT_PIN"/);
  assert.match(runner, /RUN_ID=\$\(openssl rand -hex 16\)/);
  assert.match(runner, /--label "\$VALIDATION_LABEL=\$RUN_ID"/);
});

test('backend build and validation snapshots exclude local Mongo residues and T7/T8 metrics', () => {
  const copy = section(runner, 'prepare_backend_source() {', '\n}\n\ninstall_probe() {');
  for (const pattern of [
    /--exclude='\.\/\.tmp-\*'/,
    /--exclude='\.\/\.t7-\*\.json'/,
    /--exclude='\.\/\.t8-\*\.json'/,
    /--exclude='\.\/WiredTiger\*'/,
    /--exclude='\.\/\*\.wt'/
  ]) {
    assert.match(copy, pattern);
  }
  for (const pattern of [
    /^\.tmp-\*/m,
    /^\.t7-\*\.json$/m,
    /^\.t8-\*\.json$/m,
    /^WiredTiger\*$/m,
    /^\*\.wt$/m
  ]) {
    assert.match(backendDockerignore, pattern);
  }
  assert.match(backendDockerignore, /^\.env\.\*$/m);
  assert.match(backendDockerignore, /^tests$/m);
});

test('runner bounds runtime/storage and compares pre/post Docker inventories', () => {
  assert.match(runner, /MAX_TOTAL_SECONDS=900/);
  assert.match(runner, /MIN_FREE_BYTES=\$\(\(10 \* 1024 \* 1024 \* 1024\)\)/);
  assert.match(runner, /MAX_DISK_DELTA_BYTES=\$\(\(5 \* 1024 \* 1024 \* 1024\)\)/);
  assert.match(runner, /capture_inventory "\$INVENTORY_DIR\/before"/);
  assert.match(runner, /capture_inventory "\$INVENTORY_DIR\/after"/);
  assert.match(runner, /docker-system-df\.before/);
  assert.match(runner, /after\.system-df/);
  assert.match(runner, /diff -u "\$INVENTORY_DIR\/before\.\$kind" "\$INVENTORY_DIR\/after\.\$kind"/);
  assert.match(runner, /--label "\$PROJECT_LABEL=\$PROJECT"/);
  assert.match(runner, /--label "\$OWNER_LABEL=\$OWNER_VALUE"/);
  assert.match(runner, /CLEANUP_REFUSED_RESOURCE_NOT_OWNED/);
  assert.match(runner, /before\.containers/);
  assert.match(runner, /before\.volumes/);
  assert.match(runner, /before\.networks/);
  assert.match(runner, /validation.*!=.*\$RUN_ID/);
  assert.match(runner, /baseline_contains "\$baseline_kind" "\$resource" "\$baseline_file"/);
  assert.match(runner, /validate_resource_owned container[\s\S]*?before\.containers/);
  assert.match(runner, /validate_resource_owned volume[\s\S]*?before\.volumes/);
  assert.match(runner, /validate_resource_owned network[\s\S]*?before\.networks/);
  assert.match(runner, /baseline_status != 1/);
  assert.match(runner, /docker ps -aq --no-trunc[\s\S]*?> "\$INVENTORY_DIR\/candidates\.containers" \|\| return 1/);
  assert.match(runner, /docker network ls --format '\{\{\.Name\}\}'/);
  assert.match(runner, /read_resource_label "\$kind" "\$resource"[\s\S]*?CLEANUP_LABEL_INSPECT_FAILED/);
  const cleanup = section(runner, 'read_resource_label() {', '\non_signal() {');
  assert.doesNotMatch(cleanup, /read_resource_label[\s\S]*?\|\| true/);
  assert.match(runner, /capture_inventory "\$INVENTORY_DIR\/before" \|\| \{/);
  assert.match(runner, /capture_inventory "\$INVENTORY_DIR\/after" \|\| inventory_match=0/);
  assert.match(runner, /BASELINE_READY=0/);
  assert.match(runner, /BASELINE_READY=1/);
  const cleanupBody = section(runner, 'cleanup() {', '\ntrap on_signal INT TERM HUP');
  assert.match(cleanupBody, /if \(\( BASELINE_READY != 1 \)\)/);
  assert.match(cleanupBody, /elif collect_cleanup_candidates && validate_cleanup_candidates; then/);
  assert.match(cleanupBody, /remove_owned_containers[\s\S]*?remove_owned_volumes[\s\S]*?remove_owned_networks/);
  assert.match(runner, /collect_cleanup_candidates\(\) \{[\s\S]*?candidates\.containers[\s\S]*?candidates\.volumes[\s\S]*?candidates\.networks/);
  const validationBody = section(runner, 'validate_cleanup_candidates() {', '\n}\n\nremove_owned_containers() {');
  for (const resourceList of ['candidates.containers', 'candidates.volumes', 'candidates.networks', 'delete.containers', 'delete.volumes', 'delete.networks']) {
    assert.ok(validationBody.includes(resourceList), `missing staged cleanup list: ${resourceList}`);
  }
  assert.doesNotMatch(validationBody, /docker (?:rm|volume rm|network rm)/);
  assert.match(validationBody, /printf '%s\\n'/);
  assert.doesNotMatch(validationBody, /\\\\n/);
  const ownershipValidation = section(runner, 'validate_resource_owned() {', 'validate_cleanup_candidates() {');
  assert.match(ownershipValidation, /CLEANUP_LABEL_INSPECT_FAILED\\n/);
  assert.doesNotMatch(ownershipValidation, /\\\\n/);
  assert.ok(runner.indexOf('collect_cleanup_candidates && validate_cleanup_candidates') < runner.indexOf('remove_owned_containers; then'));
  assert.match(cleanupBody, /if ! rm -rf -- "\$WORK_DIR" \|\| \[\[ -e "\$WORK_DIR" \]\]/);
  assert.match(cleanupBody, /TEMP_WORKDIR_REMOVE_FAIL/);
  assert.match(runner, /docker-system-df\.before[\s\S]*?after\.\*[\s\S]*?docker-system-df\.before/);
  assert.doesNotMatch(runner, /docker\s+system\s+prune|docker\s+volume\s+prune/);
});

test('backend never receives root credentials; isolated probe checks Mongoose transactions', () => {
  const backendEnv = section(runner, 'const backendValues = [', 'const probeValues = [');
  assert.doesNotMatch(backendEnv, /MONGO_ROOT_USERNAME|MONGO_ROOT_PASSWORD|MONGO_INITDB_ROOT/);
  assert.match(runner, /--env-file "\$BACKEND_ENV_FILE"/);
  assert.match(runner, /--env-file "\$PROBE_ENV_FILE"/);
  assert.match(runner, /app\.connection\.transaction\(/);
  assert.match(runner, /run_mongo_probe mongo-probe/);
  assert.match(runner, /run_mongo_probe persistence-probe --env M6B_MODE=verify-persisted/);
});

test('runner excludes backend secrets and source diagnostics avoid env-file contents', () => {
  assert.match(runner, /--exclude='\.\/\.env' --exclude='\.\/\.env\.\*'/);
  assert.match(runner, /--exclude='\.\/secrets'/);
  assert.match(runner, /BOOTSTRAP_FAIL %s/);
  assert.doesNotMatch(runner, /cat\s+"\$ENV_FILE"|set -x/);
});
