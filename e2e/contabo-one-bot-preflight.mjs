#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { parseOptions, runTrial } from './contabo-trial-load.mjs';
import { APPROVED_CONTABO_ORIGIN } from './virtual-player-fleet.mjs';

const usage = `Usage:
  node e2e/contabo-one-bot-preflight.mjs --run
  node e2e/contabo-one-bot-preflight.mjs --help

The target is fixed to ${APPROVED_CONTABO_ORIGIN}; the probe creates a room and one synthetic player through public APIs.
It reads Basic Auth only from BINGO_BASIC_AUTH_USER and BINGO_BASIC_AUTH_PASSWORD in the protected process environment.
No target, player-count, or credential options are accepted. Without --run, this command performs no network requests.`;

const invalidArgumentsMessage = 'No target, player-count, or credential options are accepted; use only --run or --help.';
const failedRunMessage = 'Single-player Contabo preflight failed; error details omitted.';
const SAFE_ERROR_CODES = new Set([
  'ABORTED', 'REQUEST_FAILED', 'WEBSOCKET_HANDSHAKE_FAILED', 'WEBSOCKET_TIMEOUT',
  'SOCKET_ACK_TIMEOUT', 'SOCKET_ACK_FAILED', 'SOCKET_JOIN_REJECTED', 'HTTP_TIMEOUT',
  'HTTP_REQUEST_FAILED', 'BASIC_AUTH_REJECTED', 'HTTP_REJECTED', 'INVALID_JSON',
  'MAX_RUNTIME', 'INVALID_ROOM_RESPONSE', 'INVALID_ADMISSION_TOKEN',
  'INVALID_ADMISSION_RESPONSE', 'INVALID_CARD_RESPONSE', 'DUPLICATE_CARD',
  'UNEXPECTED_DISCONNECT'
]);
const SAFE_ERROR_PHASES = new Set(['room-create', 'admission', 'card', 'websocket', 'hold']);
const SAFE_CONFIG_ERROR_CODES = new Map([
  ['set Basic Auth env vars BINGO_BASIC_AUTH_USER and BINGO_BASIC_AUTH_PASSWORD', 'BASIC_AUTH_MISSING'],
  ['Basic Auth username and password are required; username cannot contain a colon', 'BASIC_AUTH_INVALID_USERNAME']
]);
const SAFE_DISCONNECT_REASONS = new Set([
  'io server disconnect', 'io client disconnect', 'server namespace disconnect',
  'client namespace disconnect', 'ping timeout', 'transport close', 'transport error', 'other'
]);
const SAFE_DISCONNECT_PHASES = new Set(['before_hold', 'during_hold', 'after_hold']);

function safeMetric(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value * 100) / 100
    : null;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeConfigurationErrorCode(error) {
  return SAFE_CONFIG_ERROR_CODES.get(error?.message) ?? 'CONFIGURATION_REJECTED';
}

function summarizeErrors(errors) {
  if (!Array.isArray(errors)) return [];
  return errors.slice(0, 8).map(error => {
    const summary = {
      phase: SAFE_ERROR_PHASES.has(error?.phase) ? error.phase : 'other',
      code: SAFE_ERROR_CODES.has(error?.code) ? error.code : 'OTHER'
    };
    if (Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599) {
      summary.status = error.status;
    }
    return summary;
  });
}

function summarizeDisconnects(events) {
  if (!Array.isArray(events)) return [];
  return events.slice(0, 8).map(event => ({
    reason: SAFE_DISCONNECT_REASONS.has(event?.reason) ? event.reason : 'other',
    offsetMs: safeMetric(event?.offsetMs),
    phase: SAFE_DISCONNECT_PHASES.has(event?.phase) ? event.phase : 'other',
    expected: event?.expected === true
  }));
}

function summarizePreflight(result) {
  const errors = summarizeErrors(result?.errors);
  const disconnects = summarizeDisconnects(result?.disconnectEvents);
  const arrival = Array.isArray(result?.arrivalTimings)
    ? result.arrivalTimings.find(timing => timing?.player === 1)
    : null;
  const confirmed = result?.confirmedPlayers === 1;
  const socketConfirmed = confirmed && result?.socketConnections === 1;
  const cardValid = result?.allCardsUniqueAndValid === true && result?.uniqueCards === 1;
  const controlledDisconnect = disconnects.length === 1 && disconnects.every(event =>
    event.expected && ['io client disconnect', 'client namespace disconnect'].includes(event.reason)
  );

  return {
    success: result?.success === true && cardValid && socketConfirmed && controlledDisconnect,
    players: 1,
    dispatched: safeCount(result?.dispatchedPlayers),
    confirmed: safeCount(result?.confirmedPlayers),
    cardValid,
    uniqueCards: safeCount(result?.uniqueCards),
    socketConnections: safeCount(result?.socketConnections),
    socketConfirmed,
    activeSocketsBeforeCleanup: safeCount(result?.activeSocketsBeforeCleanup),
    unexpectedDisconnects: safeCount(result?.unexpectedDisconnects),
    dispatchInWindow: typeof result?.allArrivalsWithinWindow === 'boolean' ? result.allArrivalsWithinWindow : null,
    confirmationInWindow: typeof result?.allConfirmedWithinWindow === 'boolean' ? result.allConfirmedWithinWindow : null,
    roomSetupMs: safeMetric(result?.roomSetupMs),
    confirmationOffsetMs: safeMetric(arrival?.confirmationOffsetMs),
    endToEndMs: safeMetric(arrival?.endToEndMs),
    totalDurationMs: safeMetric(result?.totalDurationMs),
    authRejected: errors.some(error => error.code === 'BASIC_AUTH_REJECTED'),
    errorCount: Array.isArray(result?.errors) ? result.errors.length : null,
    errors,
    timedOut: typeof result?.timedOut === 'boolean' ? result.timedOut : null,
    controlledDisconnect,
    disconnects
  };
}

export async function runContaboOneBotPreflight(
  argv = process.argv.slice(2),
  env = process.env,
  io = console,
  executeTrial = runTrial
) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) {
    io.log(usage);
    return 0;
  }
  if (argv.length !== 1 || argv[0] !== '--run') {
    io.error(invalidArgumentsMessage);
    return 2;
  }

  let config;
  try {
    config = parseOptions([
      '--url', APPROVED_CONTABO_ORIGIN,
      '--players', '1',
      '--window-seconds', '10',
      '--request-timeout-seconds', '15',
      '--max-runtime-seconds', '30'
    ], env);
    if (config.baseUrl !== APPROVED_CONTABO_ORIGIN || config.players !== 1) {
      throw new TypeError('Preflight target and player count are fixed');
    }
  } catch (error) {
    io.error(`Preflight configuration rejected (${safeConfigurationErrorCode(error)}); details omitted.`);
    return 2;
  }

  try {
    const result = await executeTrial(config);
    const summary = summarizePreflight(result);
    io.log(JSON.stringify(summary));
    return summary.success ? 0 : 1;
  } catch {
    io.error(failedRunMessage);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runContaboOneBotPreflight().then(exitCode => {
    process.exitCode = exitCode;
  });
}
