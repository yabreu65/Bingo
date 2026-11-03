#!/usr/bin/env node
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { parseArgs as parseNodeArgs } from 'node:util';
import { setTimeout as sleepTimer } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { basicAuthHeader } from './basic-auth.mjs';
export { basicAuthHeader };

export const allowedPlayerCounts = Object.freeze([1, 10, 25, 50]);
export const DEFAULT_ARRIVAL_WINDOW_MS = 60_000;
export const DEFAULT_MAX_RUNTIME_MS = 300_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_RUNTIME_MS = 900_000;
const MAX_HOLD_MS = 300_000;

const requireFromBackend = createRequire(new URL('../backend/server.js', import.meta.url));

class TrialError extends Error {
  constructor(code, phase, status = null) {
    super(code);
    this.code = code;
    this.phase = phase;
    this.status = status;
  }
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError(`${name} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return parsed;
}

export function validateBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('staging URL must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:') throw new TypeError('staging URL must use HTTPS');
  if (url.username || url.password) throw new TypeError('credentials are forbidden in the URL; use Basic Auth environment variables');
  if (url.pathname !== '/' || url.search || url.hash) throw new TypeError('staging URL must be an origin without path, query, or fragment');
  return url.origin;
}

export function validateConfig(config) {
  const baseUrl = validateBaseUrl(config.baseUrl);
  if (!allowedPlayerCounts.includes(config.players)) throw new TypeError('players must be one of 1, 10, 25, 50');
  if (!config.username || !config.password || config.username.includes(':')) {
    throw new TypeError('Basic Auth username and password are required; username cannot contain a colon');
  }
  if (!Number.isSafeInteger(config.arrivalWindowMs) || config.arrivalWindowMs <= 0 || config.players * 1_000 > config.arrivalWindowMs) {
    throw new TypeError('arrival rate must not exceed one player per second');
  }
  if (!Number.isSafeInteger(config.holdMs) || config.holdMs < 0 || config.holdMs > MAX_HOLD_MS) {
    throw new TypeError(`hold duration must be between 0 and ${MAX_HOLD_MS} ms`);
  }
  if (!Number.isSafeInteger(config.requestTimeoutMs) || config.requestTimeoutMs < 1_000 || config.requestTimeoutMs > 30_000) {
    throw new TypeError('request timeout must be between 1000 and 30000 ms');
  }
  if (!Number.isSafeInteger(config.maxRuntimeMs) || config.maxRuntimeMs < config.arrivalWindowMs + config.holdMs + config.requestTimeoutMs || config.maxRuntimeMs > MAX_RUNTIME_MS) {
    throw new TypeError(`maximum runtime must cover arrival, hold and request timeout and be at most ${MAX_RUNTIME_MS} ms`);
  }
  return { ...config, baseUrl };
}

export function parseOptions(argv = process.argv.slice(2), env = process.env) {
  const { values } = parseNodeArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      help: { type: 'boolean', short: 'h' },
      url: { type: 'string' },
      players: { type: 'string' },
      'window-seconds': { type: 'string' },
      'hold-seconds': { type: 'string' },
      'max-runtime-seconds': { type: 'string' },
      'request-timeout-seconds': { type: 'string' }
    }
  });
  if (values.help) return { help: true };

  const baseUrl = values.url || env.BINGO_STAGING_URL;
  if (!baseUrl) throw new TypeError('set --url or BINGO_STAGING_URL');
  if (!env.BINGO_BASIC_AUTH_USER || !env.BINGO_BASIC_AUTH_PASSWORD) {
    throw new TypeError('set Basic Auth env vars BINGO_BASIC_AUTH_USER and BINGO_BASIC_AUTH_PASSWORD');
  }
  const players = values.players === undefined ? 50 : Number(values.players);
  const arrivalWindowMs = values['window-seconds'] === undefined
    ? DEFAULT_ARRIVAL_WINDOW_MS
    : positiveInteger(values['window-seconds'], 'window-seconds') * 1_000;
  const holdMs = values['hold-seconds'] === undefined
    ? 0
    : nonNegativeInteger(values['hold-seconds'], 'hold-seconds') * 1_000;
  const maxRuntimeMs = values['max-runtime-seconds'] === undefined
    ? DEFAULT_MAX_RUNTIME_MS
    : positiveInteger(values['max-runtime-seconds'], 'max-runtime-seconds') * 1_000;
  const requestTimeoutMs = values['request-timeout-seconds'] === undefined
    ? DEFAULT_REQUEST_TIMEOUT_MS
    : positiveInteger(values['request-timeout-seconds'], 'request-timeout-seconds') * 1_000;

  return validateConfig({
    baseUrl,
    username: env.BINGO_BASIC_AUTH_USER,
    password: env.BINGO_BASIC_AUTH_PASSWORD,
    players,
    arrivalWindowMs,
    holdMs,
    maxRuntimeMs,
    requestTimeoutMs
  });
}

export function buildPlayerIdentity(runId, index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new TypeError('player index must be a non-negative integer');
  const runSuffix = String(runId).replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  if (!runSuffix) throw new TypeError('run id must contain letters or digits');
  return { name: `Synthetic ${runSuffix} ${String(index + 1).padStart(3, '0')}` };
}

function createAdmissionToken(roomCode) {
  return `${roomCode}.${randomBytes(32).toString('base64url')}`;
}

export function buildArrivalSchedule(players, arrivalWindowMs) {
  if (!allowedPlayerCounts.includes(players)) throw new TypeError('players must be one of 1, 10, 25, 50');
  if (!Number.isSafeInteger(arrivalWindowMs) || arrivalWindowMs <= 0 || players * 1_000 > arrivalWindowMs) {
    throw new TypeError('arrival rate must not exceed one player per second');
  }
  if (players === 1) return [0];
  return Array.from({ length: players }, (_, index) => Math.floor(index * arrivalWindowMs / players));
}

export function computePercentiles(samples) {
  if (!samples.length) return { count: 0, p50: null, p95: null, p99: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = p => Math.round(sorted[Math.ceil(sorted.length * p) - 1] * 100) / 100;
  return { count: sorted.length, p50: at(0.50), p95: at(0.95), p99: at(0.99) };
}

function defaultIoFactory(url, options) {
  const { io } = requireFromBackend('socket.io-client');
  return io(url, options);
}

function defaultExpectedCard(cardNumber) {
  const { getCard } = requireFromBackend('./utils/bingoCards.js');
  return getCard(cardNumber);
}

function safeError(error, fallbackPhase) {
  if (error instanceof TrialError) return { phase: error.phase, code: error.code, ...(error.status ? { status: error.status } : {}) };
  if (error?.name === 'AbortError') return { phase: fallbackPhase, code: 'ABORTED' };
  return { phase: fallbackPhase, code: 'REQUEST_FAILED' };
}

const SAFE_DISCONNECT_REASONS = new Set([
  'io server disconnect',
  'io client disconnect',
  'server namespace disconnect',
  'client namespace disconnect',
  'ping timeout',
  'transport close',
  'transport error'
]);

function safeDisconnectReason(reason) {
  return typeof reason === 'string' && SAFE_DISCONNECT_REASONS.has(reason) ? reason : 'other';
}

function normalizeMatrix(matrix) {
  return Array.isArray(matrix) && matrix.length === 5 && matrix.every(row => Array.isArray(row) && row.length === 5);
}

function waitForSocket(socket, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      error ? reject(error) : resolve();
    };
    const onConnect = () => finish();
    const onConnectError = () => finish(new TrialError('WEBSOCKET_HANDSHAKE_FAILED', 'websocket'));
    const onAbort = () => finish(new TrialError('ABORTED', 'websocket'));
    const timer = setTimeout(() => finish(new TrialError('WEBSOCKET_TIMEOUT', 'websocket')), timeoutMs);
    socket.once('connect', onConnect);
    socket.once('connect_error', onConnectError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function emitJoin(socket, payload, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      error ? reject(error) : resolve(result);
    };
    const onAbort = () => finish(new TrialError('ABORTED', 'websocket'));
    const timer = setTimeout(() => finish(new TrialError('SOCKET_ACK_TIMEOUT', 'websocket')), timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
    socket.timeout(timeoutMs).emit('join-room', payload, (error, result) => {
      if (error) finish(new TrialError('SOCKET_ACK_FAILED', 'websocket'));
      else if (!result?.success) finish(new TrialError('SOCKET_JOIN_REJECTED', 'websocket'));
      else finish(null, result);
    });
    if (signal.aborted) onAbort();
  });
}

export async function runTrial(rawConfig, dependencies = {}) {
  const config = validateConfig(rawConfig);
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const ioFactory = dependencies.ioFactory || defaultIoFactory;
  const expectedCard = dependencies.expectedCard || defaultExpectedCard;
  const admissionTokenFactory = dependencies.admissionTokenFactory || createAdmissionToken;
  const now = dependencies.now || (() => performance.now());
  const utcNow = dependencies.utcNow || (() => new Date());
  const sleep = dependencies.sleep || ((ms, signal) => sleepTimer(ms, undefined, { signal }));
  const setMaxRuntimeTimer = dependencies.setMaxRuntimeTimer || ((callback, ms) => setTimeout(callback, ms));
  const clearMaxRuntimeTimer = dependencies.clearMaxRuntimeTimer || (timer => clearTimeout(timer));
  const controller = new AbortController();
  const externalSignal = dependencies.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const auth = basicAuthHeader(config.username, config.password);
  const runId = dependencies.runId || randomUUID();
  const startedAt = now();
  const initialCpuUsage = process.cpuUsage();
  const errors = [];
  const latencies = { endToEnd: [], join: [], card: [], websocket: [] };
  const dispatchOffsets = Array(config.players).fill(null);
  const confirmationOffsets = Array(config.players).fill(null);
  const cardKeys = new Set();
  const sockets = [];
  const disconnectEvents = [];
  const holdObservations = [];
  let activeSocketsAtPeak = 0;
  let socketConnections = 0;
  let unexpectedDisconnects = 0;
  let firstUnexpectedDisconnect = null;
  let confirmedPlayers = 0;
  let lastConfirmedAt = null;
  let timedOut = false;
  let closing = false;
  let holdPhase = 'before_hold';
  let holdStartedAt = null;
  let holdDurationMs = 0;
  let holdCompleted = config.holdMs === 0;
  let roomCode;
  let roomSetupMs = null;
  let loadStartedAt = null;

  const runtimeTimer = setMaxRuntimeTimer(() => {
    timedOut = true;
    closing = true;
    controller.abort();
    for (const socket of sockets) socket.disconnect();
  }, config.maxRuntimeMs);

  const requestJson = async (path, phase, body, headers = {}) => {
    if (controller.signal.aborted) throw new TrialError(timedOut ? 'MAX_RUNTIME' : 'ABORTED', phase);
    let response;
    try {
      response = await fetchImpl(new URL(path, config.baseUrl), {
        method: 'POST',
        headers: { authorization: auth, 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(config.requestTimeoutMs)])
      });
    } catch (error) {
      if (controller.signal.aborted) throw new TrialError(timedOut ? 'MAX_RUNTIME' : 'ABORTED', phase);
      if (error?.name === 'TimeoutError') throw new TrialError('HTTP_TIMEOUT', phase);
      throw new TrialError('HTTP_REQUEST_FAILED', phase);
    }
    if (response.status === 401 || response.status === 403) throw new TrialError('BASIC_AUTH_REJECTED', phase, response.status);
    if (!response.ok) throw new TrialError('HTTP_REJECTED', phase, response.status);
    try {
      return await response.json();
    } catch {
      throw new TrialError('INVALID_JSON', phase, response.status);
    }
  };

  const recordError = (player, phase, error) => {
    if (controller.signal.aborted && !timedOut) return;
    const normalizedError = timedOut && controller.signal.aborted
      ? new TrialError('MAX_RUNTIME', phase)
      : error;
    const safe = safeError(normalizedError, phase);
    errors.push({ player, ...safe });
    controller.abort();
  };

  const recordHoldObservation = () => {
    holdObservations.push({
      timestampUtc: utcNow().toISOString(),
      offsetMs: round(Math.max(0, now() - startedAt)),
      activeConnections: sockets.filter(socket => socket.connected).length
    });
  };

  try {
    const setupStart = now();
    let created;
    try {
      created = await requestJson('/api/rooms/create', 'room-create', {
        hostName: 'Synthetic Load Host',
        config: { maxPlayers: config.players + 1 }
      });
    } catch (error) {
      recordError(null, 'room-create', error);
      return makeResult();
    }
    if (!created?.success || !/^[A-Z0-9]{6}$/.test(created.room?.code || '') || typeof created.hostCapability !== 'string') {
      recordError(null, 'room-create', new TrialError('INVALID_ROOM_RESPONSE', 'room-create'));
      return makeResult();
    }
    roomCode = created.room.code;
    roomSetupMs = Math.max(0, now() - setupStart);
    loadStartedAt = now();

    const schedule = buildArrivalSchedule(config.players, config.arrivalWindowMs);
    const playerTasks = schedule.map(async (offset, index) => {
      try {
        const waitMs = Math.max(0, loadStartedAt + offset - now());
        if (waitMs > 0) await sleep(waitMs, controller.signal);
        if (controller.signal.aborted) throw new TrialError(timedOut ? 'MAX_RUNTIME' : 'ABORTED', 'admission');
        const arrivalStart = now();
        dispatchOffsets[index] = Math.max(0, arrivalStart - loadStartedAt);
        const identity = buildPlayerIdentity(runId, index);
        const admissionToken = admissionTokenFactory(roomCode, index);
        if (typeof admissionToken !== 'string' || !new RegExp(`^${roomCode}\\.[A-Za-z0-9_-]{43}$`).test(admissionToken)) {
          throw new TrialError('INVALID_ADMISSION_TOKEN', 'admission');
        }
        const joined = await requestJson('/api/rooms/join', 'admission', {
          roomCode,
          playerName: identity.name,
          admissionToken
        });
        if (!joined?.success || typeof joined.player?._id !== 'string' || typeof joined.playerCapability !== 'string') {
          throw new TrialError('INVALID_ADMISSION_RESPONSE', 'admission');
        }
        latencies.join.push(Math.max(0, now() - arrivalStart));

        const cardStart = now();
        const selected = await requestJson(`/api/rooms/${encodeURIComponent(roomCode)}/select-card`, 'card', {
          playerId: joined.player._id,
          cardNumber: index + 1
        }, { 'x-player-capability': joined.playerCapability });
        const matrix = selected?.bingoCard?.matrix;
        const expectedMatrix = expectedCard(index + 1);
        if (!selected?.success || selected.cardNumber !== index + 1 || !normalizeMatrix(matrix) ||
            JSON.stringify(matrix) !== JSON.stringify(expectedMatrix)) {
          throw new TrialError('INVALID_CARD_RESPONSE', 'card');
        }
        const cardKey = JSON.stringify(matrix);
        if (cardKeys.has(cardKey)) throw new TrialError('DUPLICATE_CARD', 'card');
        cardKeys.add(cardKey);
        latencies.card.push(Math.max(0, now() - cardStart));

        const socketStart = now();
        const socket = ioFactory(config.baseUrl, {
          transports: ['websocket'],
          extraHeaders: { Authorization: auth },
          reconnection: false,
          timeout: config.requestTimeoutMs
        });
        sockets.push(socket);
        let connectionEstablished = false;
        let intentionalSocketClose = false;
        socket.once('connect', () => {
          connectionEstablished = true;
          socketConnections += 1;
          activeSocketsAtPeak = Math.max(activeSocketsAtPeak, sockets.filter(item => item.connected).length);
        });
        socket.on('disconnect', reason => {
          const expected = !connectionEstablished || closing || intentionalSocketClose || controller.signal.aborted;
          const disconnect = {
            playerIndex: index + 1,
            reason: safeDisconnectReason(reason),
            timestampUtc: utcNow().toISOString(),
            offsetMs: round(Math.max(0, now() - startedAt)),
            phase: holdPhase,
            expected
          };
          disconnectEvents.push(disconnect);
          if (holdPhase === 'during_hold') recordHoldObservation();
          if (connectionEstablished && !expected) {
            unexpectedDisconnects += 1;
            firstUnexpectedDisconnect ||= disconnect;
            recordError(index + 1, 'websocket', new TrialError('UNEXPECTED_DISCONNECT', 'websocket'));
            controller.abort();
          }
        });
        try {
          await waitForSocket(socket, controller.signal, config.requestTimeoutMs);
          await emitJoin(socket, {
            roomCode,
            playerId: joined.player._id,
            playerCapability: joined.playerCapability
          }, config.requestTimeoutMs, controller.signal);
        } catch (error) {
          intentionalSocketClose = true;
          socket.disconnect();
          throw error;
        }
        latencies.websocket.push(Math.max(0, now() - socketStart));
        const confirmedAt = now();
        confirmationOffsets[index] = Math.max(0, confirmedAt - loadStartedAt);
        latencies.endToEnd.push(Math.max(0, confirmedAt - arrivalStart));
        confirmedPlayers += 1;
        lastConfirmedAt = Math.max(lastConfirmedAt ?? 0, confirmedAt);
        activeSocketsAtPeak = Math.max(activeSocketsAtPeak, sockets.filter(item => item.connected).length);
      } catch (error) {
        recordError(index + 1, error?.phase || 'admission', error);
      }
    });

    await Promise.all(playerTasks);
    const dispatchedWithinWindow = dispatchOffsets.every(offset =>
      offset !== null && offset <= config.arrivalWindowMs
    );
    if (!controller.signal.aborted && dispatchedWithinWindow && confirmedPlayers === config.players &&
        errors.length === 0 && config.holdMs > 0) {
      holdPhase = 'during_hold';
      holdStartedAt = now();
      recordHoldObservation();
      try {
        while (!controller.signal.aborted && now() - holdStartedAt < config.holdMs) {
          const elapsed = Math.max(0, now() - holdStartedAt);
          const waitMs = Math.min(1_000, config.holdMs - elapsed);
          await sleep(waitMs, controller.signal);
          if (!controller.signal.aborted) recordHoldObservation();
        }
      } catch {
        if (timedOut) recordError(null, 'hold', new TrialError('MAX_RUNTIME', 'hold'));
      }
      holdDurationMs = round(Math.min(config.holdMs, Math.max(0, now() - holdStartedAt)));
      holdCompleted = !controller.signal.aborted && holdDurationMs >= config.holdMs;
    }
    holdPhase = 'after_hold';
    return makeResult();
  } finally {
    closing = true;
    holdPhase = 'after_hold';
    clearMaxRuntimeTimer(runtimeTimer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
    for (const socket of sockets) socket.disconnect();
  }

  function makeResult() {
    const schedule = buildArrivalSchedule(config.players, config.arrivalWindowMs);
    const dispatchedPlayers = dispatchOffsets.filter(offset => offset !== null).length;
    const allArrivalsWithinWindow = dispatchedPlayers === config.players &&
      dispatchOffsets.every(offset => offset !== null && offset <= config.arrivalWindowMs);
    const allConfirmedWithinWindow = confirmedPlayers === config.players &&
      confirmationOffsets.every(offset => offset !== null && offset <= config.arrivalWindowMs);
    const completedOffsets = confirmationOffsets.filter(offset => offset !== null);
    const loadDurationMs = completedOffsets.length ? Math.max(...completedOffsets) : 0;
    const totalDurationMs = Math.max(0, now() - startedAt);
    const activeSocketsBeforeCleanup = sockets.filter(socket => socket.connected).length;
    const allCardsUniqueAndValid = confirmedPlayers === config.players && cardKeys.size === config.players;
    const allConnectionsStableDuringHold = config.holdMs === 0 || (
      holdCompleted && holdObservations.length > 0 &&
      holdObservations.every(sample => sample.activeConnections === config.players)
    );
    const cpu = process.cpuUsage(initialCpuUsage);
    const arrivalTimings = schedule.map((scheduledOffsetMs, index) => ({
      player: index + 1,
      scheduledOffsetMs,
      dispatchOffsetMs: round(dispatchOffsets[index]),
      confirmationOffsetMs: round(confirmationOffsets[index]),
      endToEndMs: dispatchOffsets[index] === null || confirmationOffsets[index] === null
        ? null
        : round(confirmationOffsets[index] - dispatchOffsets[index])
    }));
    return {
      version: 1,
      targetHost: new URL(config.baseUrl).host,
      requestedPlayers: config.players,
      dispatchedPlayers,
      confirmedPlayers,
      uniqueCards: cardKeys.size,
      arrivalWindowMs: config.arrivalWindowMs,
      scheduledArrivalSpanMs: schedule.at(-1),
      roomSetupMs: round(roomSetupMs),
      loadDurationMs: round(loadDurationMs),
      totalDurationMs: round(totalDurationMs),
      allArrivalsWithinWindow,
      allConfirmedWithinWindow,
      arrivalTimings,
      activeSocketsAtPeak,
      socketConnections,
      unexpectedDisconnects,
      disconnectEvents,
      firstUnexpectedDisconnect,
      holdObservations,
      holdDurationMs,
      holdCompleted,
      allCardsUniqueAndValid,
      allConnectionsStableDuringHold,
      activeSocketsBeforeCleanup,
      timedOut,
      success: !timedOut && !controller.signal.aborted && errors.length === 0 &&
        dispatchedPlayers === config.players && allArrivalsWithinWindow &&
        confirmedPlayers === config.players && allConfirmedWithinWindow &&
        allCardsUniqueAndValid && unexpectedDisconnects === 0 &&
        allConnectionsStableDuringHold && activeSocketsBeforeCleanup === config.players,
      latenciesMs: {
        endToEnd: computePercentiles(latencies.endToEnd),
        join: computePercentiles(latencies.join),
        card: computePercentiles(latencies.card),
        websocket: computePercentiles(latencies.websocket)
      },
      errors,
      clientProcess: {
        rssBytes: process.memoryUsage().rss,
        cpuSeconds: round((cpu.user + cpu.system) / 1e6)
      }
    };
  }
}

function round(value) {
  return value === null ? null : Math.round(value * 100) / 100;
}

export function helpText() {
  return [
    'Bingo temporary external load generator (HTTPS/WSS only)',
    '',
    'Usage: BINGO_BASIC_AUTH_USER=... BINGO_BASIC_AUTH_PASSWORD=... node e2e/contabo-trial-load.mjs --url https://HOST --players 50',
    '',
    'Options: --url, --players (1|10|25|50), --window-seconds, --hold-seconds, --max-runtime-seconds, --request-timeout-seconds, --help',
    'Credentials are read only from BINGO_BASIC_AUTH_USER and BINGO_BASIC_AUTH_PASSWORD; they are never printed.',
    'The tool uses the existing backend/node_modules/socket.io-client and Node.js built-ins; it starts no local backend or MongoDB.'
  ].join('\n');
}

async function main() {
  let options;
  try {
    options = parseOptions();
  } catch {
    console.error('Invalid configuration. Run with --help; credentials are never displayed.');
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(helpText());
    return;
  }
  const controller = new AbortController();
  const onStop = () => controller.abort();
  process.once('SIGINT', onStop);
  process.once('SIGTERM', onStop);
  try {
    const result = await runTrial(options, { signal: controller.signal });
    console.log(JSON.stringify(result));
    if (!result.success) process.exitCode = 1;
  } catch {
    console.error('Trial failed. See sanitized result codes; no credentials or tokens are printed.');
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', onStop);
    process.removeListener('SIGTERM', onStop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
