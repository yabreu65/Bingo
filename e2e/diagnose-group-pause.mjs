import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const backendDir = join(root, 'backend');
const frontendDir = join(root, 'bingo-react');
const backendURL = 'http://127.0.0.1:5101';
const frontendURL = 'http://127.0.0.1:5174';
const bindMarker = 'E2E_BACKEND_BIND_VERIFIED 127.0.0.1:5101';
const requireFromE2E = createRequire(import.meta.url);
const requireFromBackend = createRequire(join(backendDir, 'server.js'));
const requireFromFrontend = createRequire(join(frontendDir, 'package.json'));
const { chromium } = requireFromE2E('playwright');
const { VirtualPlayerFleet } = await import('./virtual-player-fleet.mjs');
const { MongoMemoryReplSet } = requireFromBackend('mongodb-memory-server');
const { io: socketIO } = requireFromFrontend('socket.io-client');
const mongoose = requireFromBackend('mongoose');

const processes = [];
const processOutput = new Map();
const delay = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

function startProcess(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
  const output = [];
  processOutput.set(name, output);
  child.stdout.on('data', chunk => output.push(String(chunk)));
  child.stderr.on('data', chunk => output.push(String(chunk)));
  child.on('error', error => output.push(`spawn error: ${error.message}`));
  processes.push({ name, child });
  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const signal = name => {
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, name);
        return;
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    child.kill(name);
  };

  signal('SIGTERM');
  await new Promise(resolvePromise => {
    const timer = setTimeout(() => {
      signal('SIGKILL');
      resolvePromise();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
  child.stdout?.destroy();
  child.stderr?.destroy();
}

async function waitForOutput(child, name, marker, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((processOutput.get(name) || []).join('').includes(marker)) return;
    if (child.exitCode !== null) throw new Error(`${name} exited before its required readiness marker`);
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${name} marker ${marker}`);
}

async function waitForHttp(url, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
}

async function waitForBody(page, pattern, timeout = 15000) {
  await page.waitForFunction(
    ({ source, flags }) => new RegExp(source, flags).test(document.body?.innerText || ''),
    { source: pattern.source, flags: pattern.flags },
    { timeout }
  );
}

async function waitForSession(page, predicate) {
  await page.waitForFunction(() => {
    try {
      const session = JSON.parse(localStorage.getItem('bingo_session') || 'null');
      return Boolean(session);
    } catch {
      return false;
    }
  }, undefined, { timeout: 15000 });
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('bingo_session')));
  assert.ok(predicate(session), 'Unexpected local browser session');
  return session;
}

function openAuthorizedSocket(payload) {
  const socket = socketIO(backendURL, { transports: ['websocket'], forceNew: true });
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => finish(new Error('Timed out opening authorized diagnostic socket')), 10000);
    const onError = error => finish(error);
    const finish = (error, value) => {
      clearTimeout(timeout);
      socket.off('connect_error', onError);
      if (error) {
        socket.disconnect();
        reject(error);
      } else {
        resolvePromise(value);
      }
    };
    socket.once('connect_error', onError);
    socket.once('connect', () => {
      socket.emit('join-room', payload, response => {
        if (!response?.success) return finish(new Error('Authorized diagnostic socket join was rejected'));
        finish(null, socket);
      });
    });
  });
}

function waitForSocketEvent(socket, eventName, predicate, timeout = 12000) {
  return new Promise((resolvePromise, reject) => {
    const finish = (error, value) => {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      socket.off('disconnect', onDisconnect);
      if (error) reject(error);
      else resolvePromise(value);
    };
    const onEvent = payload => {
      if (predicate(payload)) finish(null, payload);
    };
    const onDisconnect = reason => finish(new Error(`Diagnostic observer disconnected: ${reason}`));
    const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${eventName}`)), timeout);
    socket.on(eventName, onEvent);
    socket.once('disconnect', onDisconnect);
  });
}

function findChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH && existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH)) {
    return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  }
  const bundled = chromium.executablePath();
  if (bundled && existsSync(bundled)) return bundled;
  const candidates = [
    join(process.env.HOME || '', 'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
    join(process.env.HOME || '', 'Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  const candidate = candidates.find(existsSync);
  if (candidate) return candidate;
  throw new Error('No Chromium executable found; set PLAYWRIGHT_CHROMIUM_PATH');
}

async function main() {
  let mongo;
  let browser;
  let mongooseConnected = false;
  let hostControlSocket;
  let fleet;
  const contexts = [];

  try {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' }
    });
    await mongoose.connect(mongo.getUri('group-pause-diagnostic'));
    mongooseConnected = true;

    const backend = startProcess('backend', process.execPath, [join(root, 'e2e/loopback-backend-launcher.cjs')], backendDir, {
      NODE_ENV: 'test',
      PORT: '5101',
      MONGODB_URI: mongo.getUri('group-pause-diagnostic'),
      JWT_SECRET: 'bingo-e2e-diagnostic-secret-0123456789',
      FRONTEND_URL: frontendURL,
      SPOTIFY_CLIENT_ID: '',
      SPOTIFY_CLIENT_SECRET: '',
      YOUTUBE_API_KEY: '',
      ANTHROPIC_API_KEY: ''
    });

    // Do not start Vite, open a browser, or send test requests until the child
    // confirms its actual listening address from server.address().
    await waitForOutput(backend, 'backend', bindMarker);
    console.log(`Verified backend bind before test actions: ${bindMarker}`);

    const frontend = startProcess('frontend', 'npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], frontendDir, {
      BROWSER: 'none',
      VITE_BACKEND_URL: backendURL,
      VITE_NETWORK_IP: '127.0.0.1'
    });
    await waitForOutput(frontend, 'frontend', 'http://127.0.0.1:5174/');
    await waitForHttp(`${backendURL}/api/health`);
    await waitForHttp(frontendURL);

    browser = await chromium.launch({ headless: true, executablePath: findChromiumExecutable() });
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();
    contexts.push(hostContext, playerContext);
    const hostPage = await hostContext.newPage();
    const playerPage = await playerContext.newPage();

    await hostPage.goto(frontendURL);
    await hostPage.getByRole('button', { name: /Comenzar a Jugar/ }).click({ force: true });
    await hostPage.getByRole('button', { name: /Crear Sala/ }).click();
    await hostPage.getByLabel('Tu Nombre').fill('Organizador de diagnóstico');
    await hostPage.getByLabel('Nombre de la Sala').fill('Diagnóstico de pausa');
    await hostPage.getByRole('button', { name: /Crear Sala/ }).click();
    await waitForBody(hostPage, /Sala:/);
    const hostSession = await waitForSession(hostPage, session =>
      session?.isHost === true && /^[A-Z0-9]{6}$/.test(session.roomCode || '') &&
      typeof session.hostCapability === 'string' && session.hostCapability.length === 43 &&
      typeof session.tvCapability === 'string'
    );
    const roomCode = hostSession.roomCode;

    const configResponse = await fetch(`${backendURL}/api/rooms/${roomCode}/config`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-room-host-capability': hostSession.hostCapability
      },
      body: JSON.stringify({ config: { challengeFrequency: 10, timeBetweenNumbers: 120 } })
    });
    const configBody = await configResponse.json();
    assert.equal(configResponse.status, 200, 'Failed to configure diagnostic room');
    assert.equal(configBody.success, true, 'Diagnostic room config was rejected');

    await playerPage.goto(`${frontendURL}/?room=${roomCode}`);
    await playerPage.getByLabel('Tu Nombre').fill('Jugador de diagnóstico');
    await playerPage.getByLabel(/Número de Cartón/).fill('25');
    await playerPage.getByRole('button', { name: /Unirse al Juego/ }).click();
    await waitForBody(playerPage, /Números cantados|Mi Cartón|Esperando/);
    const playerSession = await waitForSession(playerPage, session =>
      session?.isHost === false && session.roomCode === roomCode &&
      session.cardNumber === 25 && typeof session.playerCapability === 'string'
    );

    const stateEvents = [];
    let botOneSocket;
    const recordState = payload => stateEvents.push({ state: payload?.state, at: Date.now() });
    fleet = new VirtualPlayerFleet({
      backendUrl: backendURL,
      roomCode,
      seed: 'group-pause-24-bot-diagnostic',
      configurePlayer: bot => {
        if (bot.alias !== 'bot-01') return;
        botOneSocket = bot.socket;
        bot.socket.on('game-state-changed', recordState);
        return () => bot.socket.off('game-state-changed', recordState);
      },
      logger: () => {}
    });
    const fleetStatus = await fleet.start();
    assert.deepEqual(fleetStatus, { requested: 24, admitted: 24, connected: 24, stopped: false });
    console.log('Virtual-player fleet connected: 24/24; human-player card: 25.');

    const tvPopupPromise = hostPage.waitForEvent('popup', { timeout: 10000 });
    await hostPage.getByRole('button', { name: /Abrir TV/ }).click();
    const tvPage = await tvPopupPromise;
    await tvPage.waitForLoadState('domcontentloaded');
    await waitForBody(tvPage, /Bingo Bailable|Bingo Navideño/);
    await waitForBody(tvPage, new RegExp(roomCode));
    await tvPage.locator('.game-state-badge.waiting').waitFor({ state: 'visible', timeout: 10000 });

    await hostPage.getByRole('button', { name: /Iniciar/ }).last().click();
    await waitForBody(hostPage, /En Juego|Número Cantado/);
    await waitForBody(playerPage, /En Juego|Números cantados/);
    await tvPage.locator('.game-state-badge.playing').waitFor({ state: 'visible', timeout: 15000 });

    // Keep the host side-channel socket that caused the original observer mismatch.
    hostControlSocket = await openAuthorizedSocket({
      roomCode,
      playerId: hostSession.playerId,
      hostCapability: hostSession.hostCapability
    });
    const hostControlDisconnects = [];
    hostControlSocket.on('disconnect', reason => hostControlDisconnects.push(String(reason)));

    const pausedEventPromise = waitForSocketEvent(
      botOneSocket,
      'game-state-changed',
      payload => payload?.state === 'paused',
      12000
    );
    const groupChallengePromise = playerPage.locator('.challenge-type-group').waitFor({ state: 'visible', timeout: 12000 });
    hostControlSocket.emit('launch-event', {
      roomCode,
      type: 'group',
      hostCapability: hostSession.hostCapability
    });

    const pausedEvent = await pausedEventPromise;
    await groupChallengePromise;
    const tvPausedPromise = tvPage.locator('.game-state-badge.paused').waitFor({ state: 'visible', timeout: 5000 });
    const playerPausedPromise = playerPage.locator('.status-badge.paused').waitFor({ state: 'visible', timeout: 5000 });
    await Promise.all([tvPausedPromise, playerPausedPromise]);
    const organizerSawPausedWithin10s = await hostPage.getByText('Pausado', { exact: true })
      .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);

    const resumedEventPromise = waitForSocketEvent(
      botOneSocket,
      'game-state-changed',
      payload => payload?.state === 'playing',
      35000
    );
    const tvPlayingPromise = tvPage.locator('.game-state-badge.playing').waitFor({ state: 'visible', timeout: 35000 });
    const playerPlayingPromise = playerPage.locator('.status-badge.playing').waitFor({ state: 'visible', timeout: 35000 });
    const resumedEvent = await resumedEventPromise;
    await Promise.all([tvPlayingPromise, playerPlayingPromise]);
    const pausedRecord = stateEvents.find(event => event.state === 'paused');
    const resumedRecord = stateEvents.find(event => event.state === 'playing' && event.at > (pausedRecord?.at || 0));
    assert.ok(pausedRecord && resumedRecord, 'Bot public observer did not record both state-event timestamps');
    const elapsedMs = resumedRecord.at - pausedRecord.at;

    const publicStates = stateEvents.map(event => event.state);
    assert.deepEqual(publicStates.slice(-2), ['paused', 'playing']);
    assert.equal(pausedEvent.state, 'paused');
    assert.equal(resumedEvent.state, 'playing');
    assert.ok(elapsedMs >= 25000, `Group challenge recovered too early (${elapsedMs}ms)`);
    assert.equal(fleet.status().connected, 24, 'Fleet lost a bot during the group challenge');

    const stoppedFleetStatus = await fleet.stop();
    assert.deepEqual(stoppedFleetStatus, { requested: 24, admitted: 24, connected: 0, stopped: true });
    const diagnosis = organizerSawPausedWithin10s
      ? 'organizer-observer-saw-pause-in-focused-run; job-52-failure-not-reproduced'
      : 'organizer-observer-missed-pause-while-TV-player-and-bot-observers-confirmed-it';
    console.log('GROUP_PAUSE_24_BOT_DIAGNOSTIC ' + JSON.stringify({
      roomCode,
      botsAdmitted: fleetStatus.admitted,
      botsConnectedBeforeStop: fleetStatus.connected,
      botsConnectedAfterStop: stoppedFleetStatus.connected,
      publicStates,
      tvSawPaused: true,
      tvSawPlaying: true,
      playerSawPaused: true,
      playerSawPlaying: true,
      organizerWaitResult: organizerSawPausedWithin10s ? 'PASS' : 'FAIL',
      elapsedMs,
      hostControlDisconnects: hostControlDisconnects.length,
      diagnosis
    }));
    console.log(`ORIGINAL_ORGANIZER_UI_WAIT ${organizerSawPausedWithin10s ? 'PASS' : 'FAIL'}`);
    console.log(`DIAGNOSTIC_RESULT ${diagnosis}`);
    console.log('PUBLIC_PAUSE_RESUME_CHECKS PASS: 24 bots, TV UI, and player UI observed group pause/resume.');
  } finally {
    hostControlSocket?.disconnect();
    await fleet?.stop().catch(() => {});
    for (const context of contexts) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (mongooseConnected) await mongoose.disconnect().catch(() => {});
    await Promise.all(processes.reverse().map(({ child }) => stopProcess(child)));
    if (mongo) await mongo.stop();
  }
}

main().catch(error => {
  console.error('E2E DIAGNOSTIC FAIL: ' + (error.stack || error.message));
  process.exitCode = 1;
});
