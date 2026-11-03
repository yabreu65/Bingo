import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { VirtualPlayerFleet, createSeededRandom, sampleReactionDelay } from './virtual-player-fleet.mjs';
import { parseVirtualPlayerArgs } from './virtual-player-bots.mjs';
import * as virtualPlayerCli from './virtual-player-bots.mjs';
import { basicAuthHeader } from './contabo-trial-load.mjs';

const roomCode = 'ABC123';
const capabilityFor = index => `capability-${String(index).padStart(2, '0')}`;
const admissionTokenFor = index => `${roomCode}.${String(index).padStart(43, '0')}`;
const matrixFor = cardNumber => Array.from({ length: 5 }, (_, row) =>
  Array.from({ length: 5 }, (_, col) => row * 5 + col + cardNumber));

class FakeSocket extends EventEmitter {
  constructor(joinPayloads, syncPayloads) {
    super();
    this.connected = false;
    this.disconnected = false;
    this.joinPayloads = joinPayloads;
    this.syncPayloads = syncPayloads;
  }

  connect() {
    queueMicrotask(() => {
      this.connected = true;
      super.emit('connect');
    });
  }

  timeout() { return this; }

  emit(event, ...args) {
    if (event === 'join-room') {
      const callback = args.at(-1);
      this.joinPayloads.push(args[0]);
      callback(null, { success: true });
      return true;
    }
    if (event === 'sync-game-state') {
      const [payload, callback] = args;
      this.syncPayloads.push(payload);
      callback(null, {
        success: true,
        data: {
          roomCode: payload.roomCode,
          gameState: 'playing',
          calledNumbers: [12],
          playerData: { playerId: payload.playerId, markedCells: [[1, 2]] }
        }
      });
      return true;
    }
    return super.emit(event, ...args);
  }

  disconnect() {
    this.connected = false;
    this.disconnected = true;
    super.emit('disconnect', 'io client disconnect');
  }
}

function fakeDependencies({ failJoinAt = null } = {}) {
  const requests = [];
  const sockets = [];
  const socketCalls = [];
  const socketJoinPayloads = [];
  const socketSyncPayloads = [];
  const logs = [];
  let joins = 0;
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    const body = JSON.parse(options.body);
    if (String(url).endsWith('/api/rooms/join')) {
      joins += 1;
      if (joins === failJoinAt) {
        return { ok: false, status: 503, json: async () => ({ error: 'DO_NOT_LOG_SECRET_SENTINEL' }) };
      }
      const index = joins;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          room: { code: roomCode },
          player: { _id: `player-${String(index).padStart(2, '0')}`, name: body.playerName },
          playerCapability: capabilityFor(index)
        })
      };
    }
    if (String(url).endsWith(`/api/rooms/${roomCode}/select-card`)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, cardNumber: body.cardNumber, bingoCard: { matrix: matrixFor(body.cardNumber) } })
      };
    }
    throw new Error('Unexpected test URL');
  };
  const socketFactory = (url, options) => {
    const socket = new FakeSocket(socketJoinPayloads, socketSyncPayloads);
    socketCalls.push({ url, options });
    sockets.push(socket);
    return socket;
  };
  const logger = entry => logs.push(entry);
  return { requests, sockets, socketCalls, socketJoinPayloads, socketSyncPayloads, logs, fetchImpl, socketFactory, logger };
}

function fleetWith(deps, overrides = {}) {
  return new VirtualPlayerFleet({
    backendUrl: 'http://127.0.0.1:5101',
    roomCode,
    seed: 'reproducible-seed-01',
    playerCount: 24,
    fetchImpl: deps.fetchImpl,
    socketFactory: deps.socketFactory,
    admissionTokenFactory: (_code, index) => admissionTokenFor(index + 1),
    logger: deps.logger,
    ...overrides
  });
}

test('joins 24 independent public player identities and sockets without logging credentials', async () => {
  const deps = fakeDependencies();
  const readyPlayers = [];
  const fleet = fleetWith(deps, { onPlayerReady: player => readyPlayers.push(player) });

  await fleet.start();

  const admissions = deps.requests.filter(request => request.url.endsWith('/api/rooms/join'));
  const cardSelections = deps.requests.filter(request => request.url.endsWith(`/api/rooms/${roomCode}/select-card`));
  assert.equal(admissions.length, 24);
  assert.equal(cardSelections.length, 24);
  assert.equal(deps.requests.every(request => request.options.headers.Authorization === undefined), true);
  assert.equal(deps.socketCalls.every(call => call.options.extraHeaders === undefined), true);
  const tokens = admissions.map(({ options }) => JSON.parse(options.body).admissionToken);
  const capabilities = cardSelections.map(({ options }) => options.headers['x-player-capability']);
  assert.equal(new Set(tokens).size, 24);
  assert.equal(new Set(capabilities).size, 24);
  assert.deepEqual(cardSelections.map(({ options }) => JSON.parse(options.body).cardNumber),
    Array.from({ length: 24 }, (_, index) => index + 1));
  assert.equal(deps.sockets.length, 24);
  assert.equal(readyPlayers.length, 24);
  assert.deepEqual(Object.keys(readyPlayers[0]).sort(), ['alias', 'bingoCardMatrix', 'cardNumber', 'gameMode']);
  assert.equal(Array.isArray(readyPlayers[0].bingoCardMatrix), true);
  assert.equal(new Set(deps.socketJoinPayloads.map(payload => payload.playerId)).size, 24);
  assert.equal(new Set(deps.socketJoinPayloads.map(payload => payload.playerCapability)).size, 24);
  assert.deepEqual(deps.socketJoinPayloads.map(payload => payload.roomCode), Array(24).fill(roomCode));
  assert.deepEqual(fleet.status(), { requested: 24, admitted: 24, connected: 24, stopped: false });

  const logText = JSON.stringify(deps.logs);
  for (const secret of [...tokens, ...capabilities, 'reproducible-seed-01']) assert.equal(logText.includes(secret), false);
  assert.equal(logText.includes('DO_NOT_LOG_SECRET_SENTINEL'), false);

  await fleet.stop();
  await fleet.stop();
  assert.equal(deps.sockets.every(socket => socket.disconnected), true);
  assert.deepEqual(fleet.status(), { requested: 24, admitted: 24, connected: 0, stopped: true });
});

test('reconnects using only the bot capability, rejoins its socket and syncs its public state', async () => {
  const deps = fakeDependencies();
  const fleet = fleetWith(deps);
  await fleet.start();

  const originalSocket = deps.sockets[0];
  const originalJoin = deps.socketJoinPayloads.find(payload => payload.playerId === 'player-01');
  const restored = await fleet.reconnect('bot-01');

  assert.equal(originalSocket.disconnected, true);
  assert.equal(deps.sockets.length, 25);
  assert.deepEqual(deps.socketJoinPayloads.at(-1), originalJoin);
  assert.deepEqual(deps.socketSyncPayloads, [{ roomCode, playerId: 'player-01' }]);
  assert.equal(restored.success, true);
  assert.equal(restored.data.playerData.playerId, 'player-01');
  assert.equal(fleet.status().connected, 24);
  assert.equal(JSON.stringify(deps.logs).includes(originalJoin.playerCapability), false);

  await fleet.stop();
});

test('refuses non-loopback backend URLs before making requests', async () => {
  const deps = fakeDependencies();
  assert.throws(() => fleetWith(deps, { backendUrl: 'https://bingo.example.test' }), /loopback/i);
  assert.equal(deps.requests.length, 0);
  assert.equal(deps.sockets.length, 0);
});

test('Contabo mode sends Basic Auth over public HTTP and WebSocket while keeping each bot identity independent', async () => {
  const username = 'synthetic-auth-user';
  const password = 'synthetic-auth-password';
  const authorization = basicAuthHeader(username, password);
  const origin = 'https://bingo.31.220.98.21.sslip.io';
  const deps = fakeDependencies();
  const fleet = fleetWith(deps, {
    mode: 'contabo',
    backendUrl: origin,
    authorizationHeader: authorization
  });

  await fleet.start();

  assert.equal(deps.requests.length, 48);
  assert.equal(deps.requests.every(request => request.options.headers.Authorization === authorization), true);
  assert.equal(deps.socketCalls.length, 24);
  assert.equal(deps.socketCalls.every(call => call.url === origin), true);
  assert.equal(deps.socketCalls.every(call => call.options.transports.includes('websocket')), true);
  assert.equal(deps.socketCalls.every(call => call.options.extraHeaders.Authorization === authorization), true);
  const admissions = deps.requests.filter(request => request.url.endsWith('/api/rooms/join'));
  const selections = deps.requests.filter(request => request.url.endsWith(`/api/rooms/${roomCode}/select-card`));
  const tokens = admissions.map(request => JSON.parse(request.options.body).admissionToken);
  const capabilities = selections.map(request => request.options.headers['x-player-capability']);
  assert.equal(new Set(tokens).size, 24);
  assert.equal(new Set(capabilities).size, 24);
  const publicOutput = JSON.stringify({ logs: deps.logs, status: fleet.status() });
  for (const secret of [username, password, authorization, ...tokens, ...capabilities]) {
    assert.equal(publicOutput.includes(secret), false);
  }
  assert.deepEqual(fleet.status(), { requested: 24, admitted: 24, connected: 24, stopped: false });

  await fleet.stop();
});

test('Contabo mode rejects every origin except the approved HTTPS origin before requests', () => {
  const authorization = basicAuthHeader('synthetic-user', 'synthetic-password');
  const deps = fakeDependencies();
  const rejectedOrigins = [
    'http://bingo.31.220.98.21.sslip.io',
    'https://bingo.example.test',
    'https://user:pass@bingo.31.220.98.21.sslip.io',
    'https://bingo.31.220.98.21.sslip.io:8443',
    'https://bingo.31.220.98.21.sslip.io/',
    'https://bingo.31.220.98.21.sslip.io/..',
    'https://bingo.31.220.98.21.sslip.io/%2e%2e',
    'https://bingo.31.220.98.21.sslip.io/api',
    'https://bingo.31.220.98.21.sslip.io/?room=ABC123',
    'https://bingo.31.220.98.21.sslip.io/#fragment'
  ];

  for (const backendUrl of rejectedOrigins) {
    assert.throws(() => fleetWith(deps, {
      mode: 'contabo',
      backendUrl,
      authorizationHeader: authorization
    }), /approved Contabo HTTPS origin/i);
  }
  assert.equal(deps.requests.length, 0);
  assert.equal(deps.socketCalls.length, 0);
});

test('remote Basic Auth is read from the existing environment names and never from CLI arguments', () => {
  const username = 'synthetic-auth-user';
  const password = 'synthetic-auth-password';
  const authorization = virtualPlayerCli.authorizationHeaderFromEnv({
    BINGO_BASIC_AUTH_USER: username,
    BINGO_BASIC_AUTH_PASSWORD: password
  });
  assert.equal(authorization, basicAuthHeader(username, password));
  assert.equal(authorization.includes(username), false);
  assert.equal(authorization.includes(password), false);
  assert.throws(() => virtualPlayerCli.authorizationHeaderFromEnv({}), error => {
    assert.match(error.message, /BINGO_BASIC_AUTH_USER.*BINGO_BASIC_AUTH_PASSWORD/);
    assert.equal(error.message.includes(password), false);
    return true;
  });
  assert.throws(() => parseVirtualPlayerArgs([
    'start', '--mode', 'contabo', '--backend-url', 'https://bingo.31.220.98.21.sslip.io',
    '--room-code', roomCode, '--seed', 'seed-01', '--basic-auth-user', username
  ]), error => {
    assert.match(error.message, /Unknown option/);
    assert.equal(error.message.includes('--basic-auth-user'), false);
    assert.equal(error.message.includes(username), false);
    return true;
  });
});

test('CLI opts into Contabo explicitly and keeps local mode as the default', () => {
  const local = parseVirtualPlayerArgs([
    'start', '--backend-url', 'http://127.0.0.1:5101', '--room-code', roomCode, '--seed', 'seed-01'
  ]);
  assert.equal(local.mode, 'local');
  assert.equal(local.backendUrl, 'http://127.0.0.1:5101');
  assert.equal(JSON.stringify(local).includes('synthetic-auth-password'), false);

  const remote = parseVirtualPlayerArgs([
    'start', '--mode', 'contabo', '--backend-url', 'https://bingo.31.220.98.21.sslip.io',
    '--room-code', roomCode, '--seed', 'seed-01'
  ]);
  assert.equal(remote.mode, 'contabo');
  assert.equal(remote.backendUrl, 'https://bingo.31.220.98.21.sslip.io');
});

test('CLI errors never echo unknown arguments that could contain credentials', async () => {
  const secret = 'synthetic-secret-in-unknown-argument';
  for (const argument of [secret, `--password=${secret}`]) {
    const stdout = [];
    const stderr = [];
    const code = await virtualPlayerCli.runVirtualPlayerCli(['start', argument], {
      log: value => stdout.push(String(value)),
      error: value => stderr.push(String(value))
    }, {});

    assert.equal(code, 2);
    assert.deepEqual(stdout, []);
    assert.equal(stderr.length, 1);
    assert.match(stderr[0], /^Unknown option\./);
    assert.equal(stderr[0].includes(argument), false);
    assert.equal(stderr[0].includes(secret), false);
  }
});

test('redacts remote Basic Auth credentials and response bodies from failed public requests', async () => {
  const username = 'synthetic-auth-user';
  const password = 'synthetic-auth-password';
  const authorization = basicAuthHeader(username, password);
  const deps = fakeDependencies({ failJoinAt: 1 });
  const fleet = fleetWith(deps, {
    mode: 'contabo',
    backendUrl: 'https://bingo.31.220.98.21.sslip.io',
    authorizationHeader: authorization
  });

  await assert.rejects(fleet.start(), error => {
    assert.match(error.message, /bot-01.*admission.*503/i);
    for (const secret of [username, password, authorization, 'DO_NOT_LOG_SECRET_SENTINEL']) {
      assert.equal(error.message.includes(secret), false);
    }
    return true;
  });
  const logs = JSON.stringify(deps.logs);
  for (const secret of [username, password, authorization, 'DO_NOT_LOG_SECRET_SENTINEL']) {
    assert.equal(logs.includes(secret), false);
  }
  assert.deepEqual(fleet.status(), { requested: 24, admitted: 0, connected: 0, stopped: true });
});

test('seeded reaction delays reproduce while varying across players', () => {
  const delaysFor = seed => Array.from({ length: 24 }, (_, index) => {
    const random = createSeededRandom(seed, `bot-${index + 1}`);
    return sampleReactionDelay(random, { minMs: 250, maxMs: 2200 });
  });
  const first = delaysFor('same-seed');
  assert.deepEqual(first, delaysFor('same-seed'));
  assert.notDeepEqual(first, delaysFor('different-seed'));
  assert.ok(new Set(first).size > 1);
  assert.ok(first.every(delay => delay >= 250 && delay <= 2200));
});

test('CLI requires explicit local-run inputs and rejects unsupported options', () => {
  assert.deepEqual(parseVirtualPlayerArgs([
    'start', '--backend-url', 'http://127.0.0.1:5101', '--room-code', roomCode, '--seed', 'seed-01'
  ]), {
    backendUrl: 'http://127.0.0.1:5101', roomCode, seed: 'seed-01', firstCard: 1, mode: 'local', help: false
  });
  assert.throws(() => parseVirtualPlayerArgs(['start', '--backend-url', 'http://127.0.0.1:5101', '--room-code', roomCode]), /--seed/);
  assert.throws(() => parseVirtualPlayerArgs(['stop']), /Usage/);
  assert.throws(() => parseVirtualPlayerArgs(['start', '--unknown', 'value']), error => {
    assert.match(error.message, /Unknown option/);
    assert.equal(error.message.includes('--unknown'), false);
    assert.equal(error.message.includes('value'), false);
    return true;
  });
});

test('failed admission disconnects already-open sockets and exposes no response body', async () => {
  const deps = fakeDependencies({ failJoinAt: 5 });
  const fleet = fleetWith(deps);

  await assert.rejects(fleet.start(), error => {
    assert.match(error.message, /bot-05.*admission.*503/i);
    assert.equal(error.message.includes('DO_NOT_LOG_SECRET_SENTINEL'), false);
    return true;
  });

  assert.equal(deps.sockets.length, 4);
  assert.equal(deps.sockets.every(socket => socket.disconnected), true);
  assert.equal(JSON.stringify(deps.logs).includes('DO_NOT_LOG_SECRET_SENTINEL'), false);
  assert.deepEqual(fleet.status(), { requested: 24, admitted: 4, connected: 0, stopped: true });
});
