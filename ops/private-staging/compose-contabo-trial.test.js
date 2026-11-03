const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const stagingDir = __dirname;
const repoRoot = path.resolve(stagingDir, '../..');
const baseCompose = path.join(stagingDir, 'compose.yaml');
const trialOverride = path.join(stagingDir, 'compose.contabo-trial.yaml');
const freshMongoOverride = path.join(stagingDir, 'compose.contabo-trial-fresh-mongo.yaml');

function composeEnvironment() {
  return {
    ...process.env,
    COMPOSE_DISABLE_ENV_FILE: '1',
    COMPOSE_PROFILES: '',
    MONGO_ROOT_USERNAME: 'synthetic-root',
    MONGO_ROOT_PASSWORD: 'synthetic-root-password',
    MONGODB_URI: 'mongodb://synthetic-app:synthetic-app-password@mongo:27017/bingo_private?replicaSet=bingo-rs&authSource=bingo_private',
    JWT_SECRET: 'synthetic-jwt-secret',
    FRONTEND_URL: 'https://trial.invalid',
    ALLOWED_ORIGINS: 'https://trial.invalid',
    TRUST_PROXY_HOPS: '2',
    BINGO_TEST_HOST: 'trial.invalid',
    BINGO_TRIAL_BASIC_AUTH: 'synthetic-user:$2y$12$synthetic-bcrypt-hash-for-static-test'
  };
}

test('Contabo trial uses existing Traefik and keeps Mongo/backend private', () => {
  const env = composeEnvironment();
  const result = spawnSync('docker', [
    'compose', '--project-name', 'bingo-contabo-trial-020d654',
    '--file', baseCompose, '--file', trialOverride,
    'config', '--format', 'json'
  ], { cwd: repoRoot, env, encoding: 'utf8' });

  assert.equal(result.status, 0, `Compose static validation failed: ${result.stderr}`);
  const config = JSON.parse(result.stdout);
  const frontend = config.services.frontend;
  const backend = config.services.backend;
  const mongo = config.services.mongo;
  const owner = 'bingo-contabo-trial-020d654';

  assert.equal(config.name, owner);
  assert.equal(Object.hasOwn(config.services, 'ingress'), false);
  for (const service of ['mongo', 'mongo-bootstrap', 'backend', 'frontend']) {
    assert.equal(config.services[service].labels['com.bingo.owner'], owner);
  }
  for (const volume of ['mongo-data', 'mongo-config-data', 'uploads', 'backend-logs']) {
    assert.equal(config.volumes[volume].labels['com.bingo.owner'], owner);
  }
  for (const network of ['database', 'application', 'ingress']) {
    assert.equal(config.networks[network].labels['com.bingo.owner'], owner);
  }
  assert.equal(Object.hasOwn(config.networks.pawtech_public, 'labels'), false);
  assert.equal(frontend.labels['traefik.enable'], 'true');
  assert.equal(frontend.labels['traefik.docker.network'], 'pawtech_public');
  assert.equal(frontend.labels['traefik.http.routers.bingo-m6-trial.rule'], 'Host(`trial.invalid`)');
  assert.equal(frontend.labels['traefik.http.routers.bingo-m6-trial.entrypoints'], 'websecure');
  assert.equal(frontend.labels['traefik.http.routers.bingo-m6-trial.middlewares'], 'bingo-m6-trial-auth');
  assert.equal(
    frontend.labels['traefik.http.middlewares.bingo-m6-trial-auth.basicauth.users'],
    env.BINGO_TRIAL_BASIC_AUTH.replaceAll('$', () => '$$')
  );
  for (const service of [backend, mongo, config.services['mongo-bootstrap']]) {
    assert.deepEqual(Object.keys(service.labels).filter(key => key.startsWith('traefik.')), []);
  }
  assert.equal(frontend.labels['traefik.http.routers.bingo-m6-trial.tls.certresolver'], 'letsencrypt');
  assert.equal(frontend.labels['traefik.http.services.bingo-m6-trial.loadbalancer.server.port'], '80');
  assert.equal(config.networks.pawtech_public.external, true);
  assert.equal(config.networks.pawtech_public.name, 'pawtech_public');
  assert.ok(Object.hasOwn(frontend.networks, 'pawtech_public'));
  assert.ok(!Object.hasOwn(backend.networks, 'pawtech_public'));
  assert.ok(!Object.hasOwn(mongo.networks, 'pawtech_public'));
  assert.equal(Object.hasOwn(backend, 'ports'), false);
  assert.equal(Object.hasOwn(mongo, 'ports'), false);
  assert.equal(config.networks.database.internal, true);
  assert.equal(config.networks.application.internal, true);
});

test('Mongo bootstrap waits for Mongo readiness and retains the one-shot script', () => {
  const result = spawnSync('docker', [
    'compose', '--project-name', 'bingo-contabo-trial-020d654',
    '--file', baseCompose, '--file', trialOverride,
    'config', '--format', 'json'
  ], { cwd: repoRoot, env: composeEnvironment(), encoding: 'utf8' });

  assert.equal(result.status, 0, `Compose static validation failed: ${result.stderr}`);
  const config = JSON.parse(result.stdout);
  const bootstrap = config.services['mongo-bootstrap'];
  const command = Array.isArray(bootstrap.command)
    ? bootstrap.command.join('\n')
    : bootstrap.command;
  const runtimeCommand = command.replaceAll('$$', '$');

  assert.deepEqual(bootstrap.entrypoint, ['/bin/sh', '-ec']);
  assert.equal(bootstrap.command.length, 1, 'shell script must be passed as one -c argument');
  assert.match(command, /while \[ "\$\$i" -lt 60 \]/);
  assert.match(command, /i=\$\$\(\(i \+ 1\)\)/);
  assert.match(runtimeCommand, /while \[ "\$i" -lt 60 \]/);
  assert.match(runtimeCommand, /mongosh --quiet --eval/);
  assert.match(runtimeCommand, /mongodb:\/\/mongo:27017\/\?directConnection=true&serverSelectionTimeoutMS=1000/);
  assert.match(runtimeCommand, /db\.adminCommand\(\{ ping: 1 \}\)/);
  assert.match(runtimeCommand, /sleep 1/);
  assert.match(runtimeCommand, /exec mongosh --quiet --host mongo:27017 --file \/scripts\/bootstrap\.js/);
  assert.match(runtimeCommand, /Mongo readiness probe timed out before bootstrap/);
  const syntax = spawnSync('/bin/sh', ['-n', '-c', runtimeCommand], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `Bootstrap shell command has invalid syntax: ${syntax.stderr}`);
  assert.equal(bootstrap.restart, 'no');
  assert.equal(bootstrap.depends_on.mongo.condition, 'service_started');
  const mongoHealthcheck = config.services.mongo.healthcheck.test.join(' ');
  assert.match(mongoHealthcheck, /db\.getSiblingDB\("admin"\)\.auth\(process\.env\.MONGO_INITDB_ROOT_USERNAME, process\.env\.MONGO_INITDB_ROOT_PASSWORD\)\.ok !== 1/);
  assert.match(mongoHealthcheck, /rs\.status\(\)\.ok !== 1/);
  assert.doesNotMatch(mongoHealthcheck, /db\.getSiblingDB\("admin"\)\.auth\([^)]*\) !== 1/);
});

test('fresh Mongo override uses new Bingo volumes without changing other resources', () => {
  const env = composeEnvironment();
  const owner = 'bingo-contabo-trial-020d654';
  const baseline = spawnSync('docker', [
    'compose', '--project-name', owner,
    '--file', baseCompose, '--file', trialOverride,
    'config', '--format', 'json'
  ], { cwd: repoRoot, env, encoding: 'utf8' });
  assert.equal(baseline.status, 0, `Baseline Compose validation failed: ${baseline.stderr}`);

  const fresh = spawnSync('docker', [
    'compose', '--project-name', owner,
    '--file', baseCompose, '--file', trialOverride, '--file', freshMongoOverride,
    'config', '--format', 'json'
  ], { cwd: repoRoot, env, encoding: 'utf8' });
  assert.equal(fresh.status, 0, `Fresh-volume Compose validation failed: ${fresh.stderr}`);

  const currentConfig = JSON.parse(baseline.stdout);
  const freshConfig = JSON.parse(fresh.stdout);
  assert.equal(freshConfig.name, owner);
  assert.deepEqual(freshConfig.services, currentConfig.services);
  assert.deepEqual(freshConfig.networks, currentConfig.networks);
  assert.deepEqual(freshConfig.services.mongo.volumes, currentConfig.services.mongo.volumes);
  const expectedMongoVolumeNames = {
    'mongo-data': `${owner}_mongo-data-reinit`,
    'mongo-config-data': `${owner}_mongo-config-data-reinit`
  };
  for (const [volume, expectedName] of Object.entries(expectedMongoVolumeNames)) {
    const actualDefinition = { ...freshConfig.volumes[volume] };
    const baselineDefinition = { ...currentConfig.volumes[volume] };
    assert.equal(actualDefinition.name, expectedName);
    delete actualDefinition.name;
    delete baselineDefinition.name;
    assert.deepEqual(actualDefinition, baselineDefinition);
    assert.equal(freshConfig.volumes[volume].labels['com.bingo.owner'], owner);
    assert.equal(freshConfig.volumes[volume].labels['com.bingo.role'], volume);
  }
  for (const volume of ['uploads', 'backend-logs']) {
    assert.deepEqual(freshConfig.volumes[volume], currentConfig.volumes[volume]);
  }
});

test('Contabo trial refuses static config when Basic Auth credentials are missing', () => {
  const env = composeEnvironment();
  delete env.BINGO_TRIAL_BASIC_AUTH;
  const result = spawnSync('docker', [
    'compose', '--project-name', 'bingo-contabo-trial-020d654',
    '--file', baseCompose, '--file', trialOverride,
    'config', '--format', 'json'
  ], { cwd: repoRoot, env, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BINGO_TRIAL_BASIC_AUTH/);
  assert.match(result.stderr, /Set the dedicated Bingo Basic Auth hash/);
});
