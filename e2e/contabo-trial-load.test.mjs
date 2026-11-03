import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import {
  allowedPlayerCounts,
  basicAuthHeader,
  buildArrivalSchedule,
  buildPlayerIdentity,
  computePercentiles,
  parseOptions,
  runTrial
} from './contabo-trial-load.mjs';

const USERNAME = 'synthetic-user';
const PASSWORD = 'synthetic-password-never-log';
const BASE_URL = 'https://bingo.example.invalid';
const { getCard } = createRequire(import.meta.url)('../backend/utils/bingoCards.js');
const config = (overrides = {}) => ({
  baseUrl: BASE_URL,
  username: USERNAME,
  password: PASSWORD,
  players: 1,
  arrivalWindowMs: 60_000,
  holdMs: 0,
  maxRuntimeMs: 90_000,
  requestTimeoutMs: 5_000,
  ...overrides
});

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockSocket({ connectError = false, ack = { success: true } } = {}) {
  const socket = new EventEmitter();
  socket.connected = false;
  socket.closed = false;
  socket.acknowledgedEmits = [];
  socket.timeout = () => ({
    emit: (event, payload, callback) => {
      socket.acknowledgedEmits.push({ event, payload });
      queueMicrotask(() => callback(null, ack));
    }
  });
  socket.disconnect = () => {
    socket.closed = true;
    socket.connected = false;
    socket.emit('disconnect', 'io client disconnect');
    return socket;
  };
  queueMicrotask(() => {
    if (connectError) socket.emit('connect_error', new Error(PASSWORD));
    else {
      socket.connected = true;
      socket.emit('connect');
    }
  });
  return socket;
}

function successfulDependencies({ beforeHold } = {}) {
  const requests = [];
  const socketOptions = [];
  const socketInstances = [];
  const holdSnapshots = [];
  const secretValues = [];
  const hostCapability = Buffer.alloc(32, 255).toString('base64url');
  secretValues.push(hostCapability);
  let currentTime = 0;
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    const path = new URL(url).pathname;
    if (path === '/api/rooms/create') {
      return jsonResponse({ success: true, room: { code: 'SYN123' }, hostCapability });
    }
    if (path === '/api/rooms/join') {
      const joinBody = JSON.parse(options.body);
      assert.match(joinBody.admissionToken, /^SYN123\.[A-Za-z0-9_-]{43}$/);
      assert.match(joinBody.playerName, /^[a-zA-Z0-9 ]{1,50}$/);
      assert.equal(joinBody.roomCode, 'SYN123');
      const player = Number(joinBody.playerName.match(/(\d+)$/)[1]);
      const playerCapability = Buffer.alloc(32, player).toString('base64url');
      secretValues.push(playerCapability);
      return jsonResponse({ success: true, player: { _id: String(player).padStart(24, '0') }, playerCapability });
    }
    if (path.endsWith('/select-card')) {
      const selection = JSON.parse(options.body);
      assert.match(selection.playerId, /^[a-fA-F0-9]{24}$/);
      assert.match(options.headers['x-player-capability'], /^[A-Za-z0-9_-]{43}$/);
      const requestedCard = selection.cardNumber;
      return jsonResponse({ success: true, cardNumber: requestedCard, bingoCard: { matrix: getCard(requestedCard) } });
    }
    throw new Error(`Unexpected mocked path: ${path}`);
  };
  const ioFactory = (_url, options) => {
    socketOptions.push(options);
    const socket = mockSocket();
    socketInstances.push(socket);
    return socket;
  };
  const sleep = async (ms, signal) => {
    if (signal?.aborted) throw Object.assign(new Error(PASSWORD), { name: 'AbortError' });
    if (ms > 0 && socketInstances.length) holdSnapshots.push(socketInstances.every(socket => socket.connected));
    currentTime += ms;
    if (beforeHold) await beforeHold(ms);
    if (signal?.aborted) throw Object.assign(new Error(PASSWORD), { name: 'AbortError' });
  };
  const now = () => currentTime;
  const utcNow = () => new Date(Date.UTC(2026, 0, 1) + currentTime);
  const setTime = value => { currentTime = value; };
  return { fetchImpl, ioFactory, requests, socketOptions, socketInstances, holdSnapshots, secretValues, sleep, now, utcNow, setTime };
}

test('accepts only HTTPS staging URLs and reads Basic Auth credentials from environment', () => {
  const parsed = parseOptions(['--players', '25'], {
    BINGO_STAGING_URL: BASE_URL,
    BINGO_BASIC_AUTH_USER: USERNAME,
    BINGO_BASIC_AUTH_PASSWORD: PASSWORD
  });
  assert.equal(parsed.baseUrl, BASE_URL);
  assert.equal(parsed.players, 25);
  assert.equal(allowedPlayerCounts.join(','), '1,10,25,50');
  assert.throws(() => parseOptions(['--url', 'http://bingo.example.invalid'], {
    BINGO_BASIC_AUTH_USER: USERNAME, BINGO_BASIC_AUTH_PASSWORD: PASSWORD
  }), /HTTPS/);
  assert.throws(() => parseOptions(['--url', 'https://user:pass@bingo.example.invalid'], {
    BINGO_BASIC_AUTH_USER: USERNAME, BINGO_BASIC_AUTH_PASSWORD: PASSWORD
  }), /credentials.*URL/i);
  assert.throws(() => parseOptions(['--players', '51'], {
    BINGO_STAGING_URL: BASE_URL,
    BINGO_BASIC_AUTH_USER: USERNAME,
    BINGO_BASIC_AUTH_PASSWORD: PASSWORD
  }), /1, 10, 25, 50/);
  assert.throws(() => parseOptions(['--url', BASE_URL], {}), /Basic Auth/);
});

test('builds 50 unique identities with a bounded one-per-second arrival schedule', () => {
  const identities = Array.from({ length: 50 }, (_, i) => buildPlayerIdentity('run-a', i));
  assert.equal(new Set(identities.map(item => item.name)).size, 50);
  assert.ok(identities.every(item => item.name.length <= 50 && /^[a-zA-Z0-9 ]+$/.test(item.name)));
  for (const players of allowedPlayerCounts) {
    const offsets = buildArrivalSchedule(players, 60_000);
    assert.equal(offsets.length, players);
    assert.equal(offsets[0], 0);
    assert.ok(offsets.at(-1) < 60_000);
    assert.deepEqual(offsets, Array.from({ length: players }, (_, i) => Math.floor(i * 60_000 / players)));
    assert.ok(offsets.every((offset, i) => i === 0 || offset - offsets[i - 1] >= 1_000));
  }
  assert.equal(buildArrivalSchedule(50, 60_000).at(-1), 58_800);
  assert.throws(() => buildArrivalSchedule(50, 49_000), /arrival rate/);
});

test('computes nearest-rank p50/p95/p99 latencies', () => {
  assert.deepEqual(computePercentiles([4, 1, 3, 2]), { count: 4, p50: 2, p95: 4, p99: 4 });
  assert.deepEqual(computePercentiles([]), { count: 0, p50: null, p95: null, p99: null });
});

test('sends Basic Auth on HTTP and WebSocket, validates cards, and keeps sockets open through hold', async () => {
  const deps = successfulDependencies();
  const result = await runTrial(config({ holdMs: 5 }), deps);
  const expectedHeader = basicAuthHeader(USERNAME, PASSWORD);
  assert.equal(result.success, true);
  assert.equal(result.requestedPlayers, 1);
  assert.equal(result.confirmedPlayers, 1);
  assert.equal(result.activeSocketsAtPeak, 1);
  assert.equal(result.socketConnections, 1);
  assert.equal(result.unexpectedDisconnects, 0);
  assert.equal(result.uniqueCards, 1);
  assert.ok(deps.requests.length >= 3);
  assert.ok(deps.requests.every(request => request.options.headers.authorization === expectedHeader));
  assert.equal(deps.socketOptions[0].transports[0], 'websocket');
  assert.equal(deps.socketOptions[0].extraHeaders.Authorization, expectedHeader);
  assert.deepEqual(deps.holdSnapshots, [true]);
  assert.equal(deps.socketInstances[0].closed, true);
  assert.ok(result.latenciesMs.endToEnd.p50 >= 0);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(PASSWORD), false);
  assert.ok(deps.secretValues.every(secret => !serialized.includes(secret)));
});

test('completes a mocked 50-player flow with unique valid admission identities and cards', async () => {
  const deps = successfulDependencies();
  const tokens = [];
  let virtualNow = 0;
  deps.now = () => virtualNow;
  deps.sleep = (ms, signal) => new Promise((resolve, reject) => {
    const target = virtualNow + ms;
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      virtualNow = Math.max(virtualNow, target);
      resolve();
    }, ms / 100);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error(PASSWORD), { name: 'AbortError' }));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  const result = await runTrial(config({ players: 50 }), {
    ...deps,
    runId: 'run-50',
    admissionTokenFactory: (roomCode, index) => {
      const token = `${roomCode}.${String(index + 1).padStart(43, '0')}`;
      tokens.push(token);
      return token;
    }
  });
  const joins = deps.requests
    .filter(request => new URL(request.url).pathname === '/api/rooms/join')
    .map(request => JSON.parse(request.options.body));
  assert.equal(result.success, true);
  assert.equal(result.dispatchedPlayers, 50);
  assert.equal(result.confirmedPlayers, 50);
  assert.equal(result.uniqueCards, 50);
  assert.equal(result.socketConnections, 50);
  assert.equal(result.activeSocketsBeforeCleanup, 50);
  assert.equal(result.allArrivalsWithinWindow, true);
  assert.equal(result.allConfirmedWithinWindow, true);
  assert.equal(result.arrivalTimings.length, 50);
  assert.equal(joins.length, 50);
  assert.equal(new Set(joins.map(join => join.playerName)).size, 50);
  assert.equal(new Set(tokens).size, 50);
  assert.ok(joins.every(join => /^[A-Z0-9]{6}\.[A-Za-z0-9_-]{43}$/.test(join.admissionToken)));
  assert.equal(result.errors.length, 0);
  const socketJoins = deps.socketInstances.flatMap(socket => socket.acknowledgedEmits);
  assert.equal(socketJoins.length, 50);
  assert.ok(socketJoins.every(item => item.event === 'join-room' && /^[a-fA-F0-9]{24}$/.test(item.payload.playerId)));
  assert.ok([...tokens, ...deps.secretValues].every(secret => !JSON.stringify(result).includes(secret)));
});

test('reports actual dispatch separately from later card-and-socket confirmation', async () => {
  const deps = successfulDependencies();
  deps.ioFactory = () => {
    const socket = mockSocket();
    socket.timeout = () => ({
      emit: (_event, _payload, callback) => {
        deps.setTime(1_500);
        queueMicrotask(() => callback(null, { success: true }));
      }
    });
    return socket;
  };
  const result = await runTrial(config({ arrivalWindowMs: 1_000, holdMs: 5, maxRuntimeMs: 3_000, requestTimeoutMs: 1_000 }), deps);
  assert.equal(result.dispatchedPlayers, 1);
  assert.equal(result.allArrivalsWithinWindow, true);
  assert.equal(result.allConfirmedWithinWindow, false);
  assert.equal(result.holdCompleted, true);
  assert.equal(result.holdObservations.length, 2);
  assert.equal(result.success, false);
  assert.deepEqual(result.arrivalTimings, [{
    player: 1,
    scheduledOffsetMs: 0,
    dispatchOffsetMs: 0,
    confirmationOffsetMs: 1_500,
    endToEndMs: 1_500
  }]);
});

test('skips the hold when any player dispatches after the arrival window', async () => {
  const deps = successfulDependencies();
  const originalSleep = deps.sleep;
  let scheduledWaits = 0;
  let holdSleepCalls = 0;
  deps.sleep = async (ms, signal) => {
    if (ms > 0 && scheduledWaits < 9) {
      scheduledWaits += 1;
      return originalSleep(ms + (scheduledWaits === 9 ? 1_001 : 0), signal);
    }
    if (ms > 0) holdSleepCalls += 1;
    return originalSleep(ms, signal);
  };

  const result = await runTrial(config({
    players: 10,
    arrivalWindowMs: 10_000,
    holdMs: 5,
    maxRuntimeMs: 12_000,
    requestTimeoutMs: 1_000
  }), deps);

  assert.equal(result.dispatchedPlayers, 10);
  assert.equal(result.confirmedPlayers, 10);
  assert.equal(result.errors.length, 0);
  assert.equal(result.allArrivalsWithinWindow, false);
  assert.ok(result.arrivalTimings.at(-1).dispatchOffsetMs > 10_000);
  assert.equal(holdSleepCalls, 0);
  assert.equal(result.holdCompleted, false);
  assert.equal(result.holdObservations.length, 0);
  assert.equal(result.success, false);
});

test('rejects a card matrix that does not match the requested deterministic card number', async () => {
  const deps = successfulDependencies();
  const originalFetch = deps.fetchImpl;
  deps.fetchImpl = async (url, options) => {
    if (new URL(url).pathname.endsWith('/select-card')) {
      const requestedCard = JSON.parse(options.body).cardNumber;
      return jsonResponse({ success: true, cardNumber: requestedCard, bingoCard: { matrix: getCard(requestedCard + 1) } });
    }
    return originalFetch(url, options);
  };
  const result = await runTrial(config(), deps);
  assert.equal(result.success, false);
  assert.equal(result.confirmedPlayers, 0);
  assert.equal(result.errors[0].code, 'INVALID_CARD_RESPONSE');
  assert.equal(deps.socketOptions.length, 0);
});

test('redacts Basic Auth and capability values when the HTTP gate rejects a request', async () => {
  const deps = successfulDependencies();
  deps.fetchImpl = async () => jsonResponse({ error: PASSWORD, token: 'HOST_SECRET' }, 401);
  const result = await runTrial(config(), deps);
  const serialized = JSON.stringify(result);
  assert.equal(result.success, false);
  assert.equal(result.confirmedPlayers, 0);
  assert.equal(result.errors[0].code, 'BASIC_AUTH_REJECTED');
  assert.equal(serialized.includes(PASSWORD), false);
  assert.equal(serialized.includes('HOST_SECRET'), false);
  assert.equal(serialized.includes('synthetic-password'), false);
});

test('aborts pending player work on the first non-auth critical HTTP error', async () => {
  const deps = successfulDependencies();
  const originalFetch = deps.fetchImpl;
  deps.fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/api/rooms/join') {
      deps.requests.push({ url: String(url), options });
      return jsonResponse({ error: PASSWORD }, 503);
    }
    return originalFetch(url, options);
  };
  deps.sleep = (_ms, signal) => new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error(PASSWORD), { name: 'AbortError' }));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, 100);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });

  const result = await runTrial(config({ players: 10, arrivalWindowMs: 10_000 }), deps);

  assert.equal(result.success, false);
  assert.equal(result.dispatchedPlayers, 1);
  assert.equal(result.confirmedPlayers, 0);
  assert.equal(result.uniqueCards, 0);
  assert.deepEqual(result.errors.map(({ code, phase }) => ({ code, phase })), [
    { code: 'HTTP_REJECTED', phase: 'admission' }
  ]);
  assert.deepEqual(deps.requests.map(({ url }) => new URL(url).pathname), [
    '/api/rooms/create',
    '/api/rooms/join'
  ]);
  assert.equal(deps.socketInstances.length, 0);
});

test('records WebSocket handshake failures without logging exception text or credentials', async () => {
  const deps = successfulDependencies();
  deps.ioFactory = (_url, options) => {
    deps.socketOptions.push(options);
    return mockSocket({ connectError: true });
  };
  const result = await runTrial(config(), deps);
  assert.equal(result.success, false);
  assert.equal(result.errors[0].phase, 'websocket');
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(PASSWORD), false);
  assert.equal(serialized.includes('PLAYER_SECRET'), false);
});

test('aborts at the configured maximum runtime and disconnects established clients', async () => {
  const deps = successfulDependencies();
  let maxRuntimeCallback;
  let signalHoldStarted;
  const holdStarted = new Promise(resolve => { signalHoldStarted = resolve; });
  deps.sleep = (_ms, signal) => {
    signalHoldStarted();
    return new Promise((_resolve, reject) => {
      const onAbort = () => reject(Object.assign(new Error(PASSWORD), { name: 'AbortError' }));
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });
  };
  const resultPromise = runTrial(config({ holdMs: 10_000, maxRuntimeMs: 80_000 }), {
    ...deps,
    setMaxRuntimeTimer: callback => { maxRuntimeCallback = callback; return 1; },
    clearMaxRuntimeTimer: () => {}
  });
  await holdStarted;
  assert.equal(typeof maxRuntimeCallback, 'function');
  assert.equal(deps.socketInstances.length, 1);
  assert.equal(deps.socketInstances[0].connected, true);
  maxRuntimeCallback();
  const result = await resultPromise;
  assert.equal(result.success, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.errors.some(error => error.code === 'MAX_RUNTIME'), true);
  assert.equal(result.socketConnections, 1);
  assert.equal(result.unexpectedDisconnects, 0);
  assert.equal(deps.socketInstances[0].closed, true);
});

test('records and immediately stops on an unexpected disconnect during the hold', async () => {
  let socket;
  let fired = false;
  const deps = successfulDependencies({
    beforeHold: async () => {
      if (fired) return;
      fired = true;
      socket.connected = false;
      socket.emit('disconnect', 'transport close');
    }
  });
  deps.ioFactory = () => { socket = mockSocket(); return socket; };
  const result = await runTrial(config({ holdMs: 300_000, maxRuntimeMs: 375_000 }), deps);
  assert.equal(result.success, false);
  assert.equal(result.unexpectedDisconnects, 1);
  assert.equal(result.holdCompleted, false);
  assert.equal(result.firstUnexpectedDisconnect.playerIndex, 1);
  assert.equal(result.firstUnexpectedDisconnect.phase, 'during_hold');
  assert.equal(result.firstUnexpectedDisconnect.reason, 'transport close');
  assert.equal(result.firstUnexpectedDisconnect.timestampUtc, '2026-01-01T00:00:01.000Z');
  assert.equal(result.firstUnexpectedDisconnect.offsetMs, 1_000);
  assert.equal(result.holdObservations[0].activeConnections, 1);
  assert.equal(result.errors.some(error => error.code === 'UNEXPECTED_DISCONNECT'), true);
});

test('classifies a disconnect before the hold separately', async () => {
  let socket;
  const deps = successfulDependencies();
  deps.ioFactory = () => {
    socket = mockSocket();
    socket.timeout = () => ({
      emit: (_event, _payload, callback) => queueMicrotask(() => {
        socket.connected = false;
        socket.emit('disconnect', 'transport close');
        callback(null, { success: true });
      })
    });
    return socket;
  };
  const result = await runTrial(config({ holdMs: 1_000 }), deps);
  assert.equal(result.success, false);
  assert.equal(result.firstUnexpectedDisconnect.phase, 'before_hold');
  assert.equal(result.holdObservations.length, 0);
});

test('records intentional cleanup disconnects as expected after the hold', async () => {
  const deps = successfulDependencies();
  const result = await runTrial(config({ holdMs: 1_000 }), deps);
  assert.equal(result.success, true);
  assert.equal(result.unexpectedDisconnects, 0);
  assert.deepEqual(result.disconnectEvents.map(({ playerIndex, reason, phase, expected }) => ({
    playerIndex, reason, phase, expected
  })), [{
    playerIndex: 1, reason: 'io client disconnect', phase: 'after_hold', expected: true
  }]);
});

test('keeps every socket active through a simulated 300-second hold', async () => {
  const deps = successfulDependencies();
  const result = await runTrial(config({ holdMs: 300_000, maxRuntimeMs: 375_000 }), deps);
  assert.equal(result.success, true);
  assert.equal(result.holdCompleted, true);
  assert.equal(result.holdDurationMs, 300_000);
  assert.equal(result.holdObservations.length, 301);
  assert.ok(result.holdObservations.every(sample => sample.activeConnections === 1));
  assert.equal(result.holdObservations[0].offsetMs, 0);
  assert.equal(result.holdObservations.at(-1).offsetMs, 300_000);
  assert.equal(result.allConnectionsStableDuringHold, true);
});

test('redacts unsafe disconnect reasons and never returns auth or capability data', async () => {
  let socket;
  const deps = successfulDependencies({
    beforeHold: async () => {
      socket.connected = false;
      socket.emit('disconnect', `Authorization: Bearer ${PASSWORD}`);
    }
  });
  deps.ioFactory = () => { socket = mockSocket(); return socket; };
  const result = await runTrial(config({ holdMs: 1_000 }), deps);
  const serialized = JSON.stringify(result);
  assert.equal(result.disconnectEvents[0].reason, 'other');
  assert.equal(serialized.includes(PASSWORD), false);
  assert.equal(serialized.includes('HOST_SECRET'), false);
  assert.equal(deps.secretValues.every(secret => !serialized.includes(secret)), true);
  assert.equal(serialized.includes('Authorization'), false);
});
