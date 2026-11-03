const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const stagingDir = __dirname;
const repoRoot = path.resolve(stagingDir, '../..');
const composeFiles = [
  path.join(stagingDir, 'compose-public-entry.fixture.yaml'),
  path.join(stagingDir, 'compose.contabo-trial-public-entry.yaml')
];

function composeEnvironment() {
  return {
    ...process.env,
    COMPOSE_DISABLE_ENV_FILE: '1',
    COMPOSE_PROFILES: '',
    BINGO_TEST_HOST: 'trial.invalid',
    BINGO_TRIAL_BASIC_AUTH: 'synthetic-user:$2y$12$synthetic-bcrypt-hash-for-static-test'
  };
}

const normalizeComposeDollarEscapes = (value) => value?.replaceAll('$$', '$');

function getComposeConfig() {
  const args = ['compose', '--project-name', 'bingo-contabo-trial-020d654'];
  for (const composeFile of composeFiles) args.push('--file', composeFile);
  args.push('config', '--format', 'json');
  const result = spawnSync('docker', args, {
    cwd: repoRoot,
    env: composeEnvironment(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `Compose static validation failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

test('public UI router exposes only explicit entry and required static paths', () => {
  const config = getComposeConfig();
  const labels = config.services.frontend.labels;
  const uiRule = normalizeComposeDollarEscapes(labels['traefik.http.routers.bingo-m6-trial-public-ui.rule']);

  assert.equal(
    uiRule,
    'Host(`trial.invalid`) && (Method(`GET`) || Method(`HEAD`)) && (Path(`/`) || PathRegexp(`^/player/[A-Za-z0-9]{6}/?$`) || PathRegexp(`^/tv/[A-Za-z0-9]{6}/?$`) || PathPrefix(`/assets/`) || PathPrefix(`/music/`) || PathPrefix(`/sounds/`) || Path(`/vite.svg`))'
  );
  assert.doesNotMatch(uiRule, /Query\(/);
  assert.equal(labels['traefik.http.routers.bingo-m6-trial-public-ui.priority'], '1000');
  assert.equal(labels['traefik.http.routers.bingo-m6-trial-public-ui.service'], 'bingo-m6-trial');
  assert.equal(labels['traefik.http.routers.bingo-m6-trial-public-ui.middlewares'], undefined);
});

test('public API router allowlists only capability-backed player and TV operations', () => {
  const config = getComposeConfig();
  const labels = config.services.frontend.labels;
  const apiRule = normalizeComposeDollarEscapes(labels['traefik.http.routers.bingo-m6-trial-public-api.rule']);

  assert.equal(
    apiRule,
    'Host(`trial.invalid`) && ((Method(`POST`) && Path(`/api/rooms/join`)) || (Method(`GET`) && PathRegexp(`^/api/rooms/[A-Za-z0-9]{6}$`)) || (Method(`POST`) && PathRegexp(`^/api/rooms/[A-Za-z0-9]{6}/(select-card|reconnect)$`)) || (Method(`GET`) && PathRegexp(`^/api/players/[a-fA-F0-9]{24}$`)) || (Method(`POST`) && PathRegexp(`^/api/rooms/[A-Za-z0-9]{6}/tv-authorization/(claim|renew)$`)))'
  );
  assert.doesNotMatch(apiRule, /Query\(|create|config|revoke|admin|recordings/);
  assert.equal(labels['traefik.http.routers.bingo-m6-trial-public-api.priority'], '1000');
  assert.equal(labels['traefik.http.routers.bingo-m6-trial-public-api.service'], 'bingo-m6-trial');
  assert.equal(labels['traefik.http.routers.bingo-m6-trial-public-api.middlewares'], undefined);
});

test('public Socket.IO router is method-limited and rate-limited without Basic Auth', () => {
  const config = getComposeConfig();
  const labels = config.services.frontend.labels;

  assert.equal(
    labels['traefik.http.routers.bingo-m6-trial-public-socket.rule'],
    'Host(`trial.invalid`) && (Path(`/socket.io`) || PathPrefix(`/socket.io/`)) && (Method(`GET`) || Method(`POST`))'
  );
  assert.equal(labels['traefik.http.routers.bingo-m6-trial-public-socket.priority'], '1000');
  assert.equal(labels['traefik.http.routers.bingo-m6-trial-public-socket.service'], 'bingo-m6-trial');
  assert.equal(labels['traefik.http.routers.bingo-m6-trial-public-socket.middlewares'], 'bingo-m6-trial-socket-limit');
  assert.equal(labels['traefik.http.middlewares.bingo-m6-trial-socket-limit.ratelimit.average'], '50');
  assert.equal(labels['traefik.http.middlewares.bingo-m6-trial-socket-limit.ratelimit.period'], '1s');
  const burst = Number(labels['traefik.http.middlewares.bingo-m6-trial-socket-limit.ratelimit.burst']);
  assert.equal(burst, 150);
  assert.ok(burst >= (24 + 3) * 3, 'burst must admit 24 bots plus player, organizer, and TV during a three-request handshake');
});

test('unmatched routes retain Basic Auth and backend/Mongo stay private', () => {
  const config = getComposeConfig();
  const frontend = config.services.frontend;
  const backend = config.services.backend;
  const mongo = config.services.mongo;
  const labels = frontend.labels;

  assert.equal(labels['traefik.http.routers.bingo-m6-trial.priority'], '1');
  assert.equal(labels['traefik.http.routers.bingo-m6-trial.middlewares'], 'bingo-m6-trial-auth');
  assert.ok(labels['traefik.http.middlewares.bingo-m6-trial-auth.basicauth.users']);
  for (const service of [backend, mongo, config.services['mongo-bootstrap']]) {
    assert.deepEqual(Object.keys(service.labels ?? {}).filter(key => key.startsWith('traefik.')), []);
    assert.equal(Object.hasOwn(service, 'ports'), false);
    assert.equal(Object.hasOwn(service.networks, 'pawtech_public'), false);
  }
  assert.equal(Object.hasOwn(frontend.networks, 'pawtech_public'), true);
});
