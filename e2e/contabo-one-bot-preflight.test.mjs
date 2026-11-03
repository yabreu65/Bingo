import test from 'node:test';
import assert from 'node:assert/strict';
import { runContaboOneBotPreflight } from './contabo-one-bot-preflight.mjs';
import { APPROVED_CONTABO_ORIGIN } from './virtual-player-fleet.mjs';

const USERNAME = 'synthetic-preflight-user';
const PASSWORD = 'synthetic-preflight-password';
const EXPECTED_INVALID_ARGS = 'No target, player-count, or credential options are accepted; use only --run or --help.';
const EXPECTED_RUN_FAILURE = 'Single-player Contabo preflight failed; error details omitted.';
const envWithCredentials = () => ({
  BINGO_BASIC_AUTH_USER: USERNAME,
  BINGO_BASIC_AUTH_PASSWORD: PASSWORD,
  BINGO_STAGING_URL: 'https://unapproved.example.invalid'
});
function captureIo() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, io: { log: value => stdout.push(String(value)), error: value => stderr.push(String(value)) } };
}

test('fixed preflight uses approved origin, one player, 10s confirmation, and a 30s total cap', async () => {
  assert.equal(APPROVED_CONTABO_ORIGIN, 'https://bingo.31.220.98.21.sslip.io');
  const captured = [];
  const { stdout, stderr, io } = captureIo();
  const code = await runContaboOneBotPreflight(['--run'], envWithCredentials(), io, async config => {
    captured.push(config);
    return {
      success: true,
      dispatchedPlayers: 1,
      confirmedPlayers: 1,
      uniqueCards: 1,
      allCardsUniqueAndValid: true,
      socketConnections: 1,
      activeSocketsBeforeCleanup: 1,
      unexpectedDisconnects: 0,
      allArrivalsWithinWindow: true,
      allConfirmedWithinWindow: true,
      arrivalTimings: [{ player: 1, confirmationOffsetMs: 2_140.25, endToEndMs: 2_140.25 }],
      roomSetupMs: 120.5,
      totalDurationMs: 2_300.75,
      disconnectEvents: [{ reason: 'io client disconnect', offsetMs: 2_301, phase: 'after_hold', expected: true }],
      errors: [],
      timedOut: false,
      username: USERNAME,
      password: PASSWORD
    };
  });

  assert.equal(code, 0);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].baseUrl, APPROVED_CONTABO_ORIGIN);
  assert.equal(captured[0].players, 1);
  assert.equal(captured[0].arrivalWindowMs, 10_000);
  assert.equal(captured[0].maxRuntimeMs, 30_000);
  assert.equal(captured[0].requestTimeoutMs, 15_000);
  assert.equal(captured[0].username, USERNAME);
  assert.equal(captured[0].password, PASSWORD);
  assert.deepEqual(JSON.parse(stdout[0]), {
    success: true,
    players: 1,
    dispatched: 1,
    confirmed: 1,
    cardValid: true,
    uniqueCards: 1,
    socketConnections: 1,
    socketConfirmed: true,
    activeSocketsBeforeCleanup: 1,
    unexpectedDisconnects: 0,
    dispatchInWindow: true,
    confirmationInWindow: true,
    roomSetupMs: 120.5,
    confirmationOffsetMs: 2_140.25,
    endToEndMs: 2_140.25,
    totalDurationMs: 2_300.75,
    authRejected: false,
    errorCount: 0,
    errors: [],
    timedOut: false,
    controlledDisconnect: true,
    disconnects: [{ reason: 'io client disconnect', offsetMs: 2_301, phase: 'after_hold', expected: true }]
  });
  assert.deepEqual(stderr, []);
  for (const secret of [USERNAME, PASSWORD]) {
    assert.equal(stdout.join('\n').includes(secret), false);
    assert.equal(stderr.join('\n').includes(secret), false);
  }
});

test('default and help invocations are local no-ops without credentials', async () => {
  let trialCalls = 0;
  const { stdout, stderr, io } = captureIo();
  const code = await runContaboOneBotPreflight([], {}, io, async () => {
    trialCalls += 1;
    return { success: true };
  });

  assert.equal(code, 0);
  assert.equal(trialCalls, 0);
  assert.equal(stdout.length, 1);
  assert.match(stdout[0], /--run/);
  assert.match(stdout[0], /https:\/\/bingo\.31\.220\.98\.21\.sslip\.io/);
  assert.deepEqual(stderr, []);
});

test('rejects target, player-count, and credential options without starting transport or echoing values', async () => {
  let trialCalls = 0;
  const cases = [
    ['--url', 'https://unapproved.example.invalid'],
    ['--players', '50'],
    ['--password', PASSWORD],
    ['--run', '--url', 'https://unapproved.example.invalid']
  ];
  for (const argv of cases) {
    const { stdout, stderr, io } = captureIo();
    const code = await runContaboOneBotPreflight(argv, envWithCredentials(), io, async () => {
      trialCalls += 1;
      return { success: true };
    });
    assert.equal(code, 2);
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, [EXPECTED_INVALID_ARGS]);
    assert.equal(stderr.join('\n').includes(PASSWORD), false);
    assert.equal(stderr.join('\n').includes('unapproved.example.invalid'), false);
  }
  assert.equal(trialCalls, 0);
});

test('missing protected credentials stop before transport with a static diagnostic', async () => {
  let trialCalls = 0;
  const { stdout, stderr, io } = captureIo();
  const code = await runContaboOneBotPreflight(['--run'], {}, io, async () => {
    trialCalls += 1;
    return { success: true };
  });

  assert.equal(code, 2);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, ['Preflight configuration rejected (BASIC_AUTH_MISSING); details omitted.']);
  assert.equal(stderr.join('\n').includes(PASSWORD), false);
  assert.equal(trialCalls, 0);
});

test('invalid credential configuration reports only a static error code', async () => {
  let trialCalls = 0;
  const sentinel = `${USERNAME}:${PASSWORD}`;
  const { stdout, stderr, io } = captureIo();
  const env = { ...envWithCredentials(), BINGO_BASIC_AUTH_USER: sentinel };
  const code = await runContaboOneBotPreflight(['--run'], env, io, async () => {
    trialCalls += 1;
    return { success: true };
  });

  assert.equal(code, 2);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, ['Preflight configuration rejected (BASIC_AUTH_INVALID_USERNAME); details omitted.']);
  assert.equal(stderr.join('\n').includes(sentinel), false);
  assert.equal(stderr.join('\n').includes(PASSWORD), false);
  assert.equal(trialCalls, 0);
});

test('sanitizes trial exceptions and reports a failed result with exit code one', async () => {
  const exceptionIo = captureIo();
  const exceptionCode = await runContaboOneBotPreflight(['--run'], envWithCredentials(), exceptionIo.io, async () => {
    throw new Error(PASSWORD);
  });
  assert.equal(exceptionCode, 1);
  assert.deepEqual(exceptionIo.stdout, []);
  assert.deepEqual(exceptionIo.stderr, [EXPECTED_RUN_FAILURE]);
  assert.equal(exceptionIo.stderr.join('\n').includes(PASSWORD), false);

  const failedResultIo = captureIo();
  const failedResult = {
    success: false,
    errors: [{ phase: 'admission', code: 'BASIC_AUTH_REJECTED', status: 401, message: PASSWORD, password: PASSWORD }],
    password: PASSWORD
  };
  const failedResultCode = await runContaboOneBotPreflight(['--run'], envWithCredentials(), failedResultIo.io, async () => failedResult);
  const summary = JSON.parse(failedResultIo.stdout[0]);
  assert.equal(failedResultCode, 1);
  assert.equal(summary.success, false);
  assert.equal(summary.errorCount, 1);
  assert.equal(summary.authRejected, true);
  assert.deepEqual(summary.errors, [{ phase: 'admission', code: 'BASIC_AUTH_REJECTED', status: 401 }]);
  assert.equal(failedResultIo.stdout.join('\n').includes(PASSWORD), false);
  assert.deepEqual(failedResultIo.stderr, []);
});
