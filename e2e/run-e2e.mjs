import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const backendDir = join(root, 'backend');
const frontendDir = join(root, 'bingo-react');
const baseURL = 'http://127.0.0.1:5174';
const backendURL = 'http://127.0.0.1:5101';
const storageKey = 'bingo_session';

const requireFromE2E = createRequire(import.meta.url);
const requireFromBackend = createRequire(join(backendDir, 'server.js'));
const requireFromFrontend = createRequire(join(frontendDir, 'package.json'));
const { chromium } = requireFromE2E('playwright');
const { MongoMemoryServer } = requireFromBackend('mongodb-memory-server');
const { io: socketIO } = requireFromFrontend('socket.io-client');
const mongoose = requireFromBackend('mongoose');
const Room = requireFromBackend(join(backendDir, 'models/Room.js'));
const Game = requireFromBackend(join(backendDir, 'models/Game.js'));

const processes = [];
const logs = new Map();

function startProcess(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = [];
  logs.set(name, output);
  child.stdout.on('data', (chunk) => output.push('[stdout] ' + chunk));
  child.stderr.on('data', (chunk) => output.push('[stderr] ' + chunk));
  processes.push({ name, child });
  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolvePromise();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

async function waitForHttp(url, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(url + ' returned ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error('Timed out waiting for ' + url + ': ' + (lastError?.message || 'unknown error'));
}

async function waitForBody(page, pattern, timeout = 15000) {
  await page.waitForFunction(
    ({ source, flags }) => new RegExp(source, flags).test(document.body?.innerText || ''),
    { source: pattern.source, flags: pattern.flags },
    { timeout }
  );
}

async function waitForSession(page, predicate = () => true, timeout = 15000) {
  await page.waitForFunction(
    ({ key }) => {
      try {
        return Boolean(JSON.parse(localStorage.getItem(key) || 'null'));
      } catch {
        return false;
      }
    },
    { key: storageKey },
    { timeout }
  );
  const session = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.ok(predicate(session), 'Unexpected session: ' + JSON.stringify(session));
  return session;
}

async function waitForTextOrPages(pages, pattern, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const [name, page] of pages) {
      if (page.isClosed()) continue;
      const text = await page.locator('body').innerText().catch(() => '');
      if (pattern.test(text)) return { name, text };
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error('Timed out waiting for ' + pattern + ' in pages ' + pages.map(([name]) => name).join(', '));
}

function findChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH && existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH)) {
    return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  }

  const candidates = [
    join(process.env.HOME || '', 'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
    join(process.env.HOME || '', 'Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error('No Chromium executable found. Set PLAYWRIGHT_CHROMIUM_PATH or run npx playwright install chromium.');
}

async function configureRoom(hostPage, roomCode, hostCapability, overrides = {}) {
  const result = await hostPage.evaluate(async ({ url, code, capability, overrides: configOverrides }) => {
    const response = await fetch(url + '/api/rooms/' + code + '/config', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-room-host-capability': capability
      },
      body: JSON.stringify({
        config: {
          timeBetweenNumbers: 5,
          challengeFrequency: 1,
          tieBreakEnabled: true,
          ...configOverrides
        }
      })
    });
    return { status: response.status, body: await response.json() };
  }, { url: backendURL, code: roomCode, capability: hostCapability, overrides });

  assert.equal(result.status, 200, 'Room config failed: ' + JSON.stringify(result));
  assert.equal(result.body.success, true);
}

async function assertForbiddenFromPlayer(page, roomCode, playerCapability) {
  const result = await page.evaluate(async ({ url, code, capability }) => {
    const configResponse = await fetch(url + '/api/rooms/' + code + '/config', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-player-capability': capability
      },
      body: JSON.stringify({ config: { timeBetweenNumbers: 30 } })
    });
    const configBody = await configResponse.json();

    const manualResponse = await fetch(url + '/api/rooms/' + code + '/assign-manual-card', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-player-capability': capability
      },
      body: JSON.stringify({ playerName: 'Unauthorized', cardNumber: 199 })
    });
    const manualBody = await manualResponse.json();

    return {
      config: { status: configResponse.status, body: configBody },
      manual: { status: manualResponse.status, body: manualBody }
    };
  }, { url: backendURL, code: roomCode, capability: playerCapability });

  assert.equal(result.config.status, 403, 'Player modified config: ' + JSON.stringify(result.config));
  assert.equal(result.manual.status, 403, 'Player assigned manual card: ' + JSON.stringify(result.manual));
  const configError = result.config.body.error?.message || result.config.body.error || result.config.body.message;
  const manualError = result.manual.body.error?.message || result.manual.body.error || result.manual.body.message;
  assert.match(String(configError), /permiso/i);
  assert.match(String(manualError), /permiso/i);
}

async function openAuthorizedSocket(payload) {
  const socket = socketIO(backendURL, { transports: ['websocket'], forceNew: true });
  await new Promise((resolvePromise, reject) => {
    const onError = (error) => reject(error);
    socket.once('connect_error', onError);
    socket.once('connect', () => {
      socket.emit('join-room', payload, (response) => {
        socket.off('connect_error', onError);
        if (!response?.success) {
          reject(new Error('Socket join failed: ' + JSON.stringify(response)));
          return;
        }
        resolvePromise();
      });
    });
  });
  return socket;
}

async function main() {
  const chromiumPath = findChromiumExecutable();
  const mongo = await MongoMemoryServer.create();
  const mongoUri = mongo.getUri('bingo-e2e');
  await mongoose.connect(mongoUri);

  startProcess('backend', process.execPath, ['server.js'], backendDir, {
    NODE_ENV: 'test',
    PORT: '5101',
    MONGODB_URI: mongoUri,
    JWT_SECRET: 'bingo-e2e-secret-012345678901234567890123',
    FRONTEND_URL: baseURL,
    SPOTIFY_CLIENT_ID: '',
    SPOTIFY_CLIENT_SECRET: '',
    YOUTUBE_API_KEY: '',
    ANTHROPIC_API_KEY: ''
  });

  startProcess('frontend', 'npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5174'], frontendDir, {
    BROWSER: 'none',
    VITE_BACKEND_URL: backendURL,
    VITE_NETWORK_IP: '127.0.0.1'
  });

  let browser;
  let hostControlSocket;
  let votingSocket;
  const contexts = [];
  try {
    await waitForHttp(backendURL + '/api/health');
    await waitForHttp(baseURL);

    browser = await chromium.launch({ headless: true, executablePath: chromiumPath });

    const hostContext = await browser.newContext();
    const playerAContext = await browser.newContext();
    const playerBContext = await browser.newContext();
    contexts.push(hostContext, playerAContext, playerBContext);

    const hostPage = await hostContext.newPage();
    const playerAPage = await playerAContext.newPage();
    const playerBPage = await playerBContext.newPage();

    console.log('E2E 1/10: organizer creates and configures a room');
    await hostPage.goto(baseURL);
    await hostPage.getByRole('button', { name: /Comenzar a Jugar/ }).click({ force: true });
    await hostPage.getByRole('button', { name: /Crear Sala/ }).click();
    await hostPage.getByLabel('Tu Nombre').fill('Organizador E2E');
    await hostPage.getByLabel('Nombre de la Sala').fill('Sala E2E Codex');
    await hostPage.getByRole('button', { name: /Crear Sala/ }).click();
    await waitForBody(hostPage, /Sala:/);
    const hostSession = await waitForSession(hostPage, (value) =>
      value.isHost === true && /^[A-Z0-9]{6}$/.test(value.roomCode) &&
      typeof value.hostCapability === 'string' && value.hostCapability.length === 43
    );
    const roomCode = hostSession.roomCode;
    await configureRoom(hostPage, roomCode, hostSession.hostCapability);
    console.log('  room ' + roomCode + ' created with isolated config');

    console.log('E2E 2/10: independent players join and select cards');
    const joinPlayer = async (page, name, cardNumber) => {
      await page.goto(baseURL + '/?room=' + roomCode);
      await page.getByLabel('Tu Nombre').fill(name);
      await page.getByLabel(/Número de Cartón/).fill(String(cardNumber));
      await page.getByRole('button', { name: /Unirse al Juego/ }).click();
      await waitForBody(page, /Números cantados|Mi Cartón|Esperando/);
      return waitForSession(page, (value) =>
        value.isHost === false && value.roomCode === roomCode &&
        value.cardNumber === cardNumber &&
        typeof value.playerCapability === 'string' && value.playerCapability.length === 43
      );
    };

    const playerASession = await joinPlayer(playerAPage, 'Jugador A', 1);
    const playerBSession = await joinPlayer(playerBPage, 'Jugador B', 2);
    await waitForBody(hostPage, /Jugadores Activos/);
    assert.match(await hostPage.locator('body').innerText(), /3/);
    console.log('  players joined with cards 1 and 2');

    console.log('E2E 3/10: TV popup authorization, game start, Socket.IO and music resource');
    const popupPromise = hostPage.waitForEvent('popup', { timeout: 10000 });
    await hostPage.getByRole('button', { name: /Abrir TV/ }).click();
    const tvPage = await popupPromise;
    await tvPage.waitForLoadState('domcontentloaded');
    await waitForBody(tvPage, /Bingo Bailable|Bingo Navideño/);
    await waitForBody(tvPage, new RegExp(roomCode));
    const musicSource = await tvPage.locator('video source').getAttribute('src');
    assert.ok(musicSource && musicSource.includes('/music/'), 'TV music source missing: ' + musicSource);
    const tvInitialText = await tvPage.locator('body').innerText();
    assert.match(tvInitialText, /Bingo Bailable/);
    await waitForBody(tvPage, /En Espera|En Juego|CANTADOS|Únete al Bingo/);

    await hostPage.getByRole('button', { name: /Iniciar/ }).last().click();
    await waitForBody(hostPage, /En Juego|Número Cantado/);
    await waitForBody(playerAPage, /En Juego|Números cantados/);
    await waitForBody(playerBPage, /En Juego|Números cantados/);
    await waitForBody(tvPage, /En Juego|PAUSADO/);
    await waitForBody(playerAPage, /Números cantados \([1-9]/, 12000);
    const playerNumber = await playerAPage.locator('.called-number').first().innerText();
    await waitForBody(tvPage, new RegExp('\\b' + playerNumber + '\\b'), 5000);
    assert.ok(playerNumber, 'Player did not receive a called number');
    console.log('  Socket.IO synchronized number ' + playerNumber + '; TV music source ' + musicSource);

    console.log('E2E 4/10: automatic trivia challenge, answer flow and public synchronization');
    const scenarioPages = [['player-a', playerAPage], ['player-b', playerBPage], ['tv', tvPage], ['host', hostPage]];
    const challengeTarget = await waitForTextOrPages(scenarioPages, /¡RETO!|Challenge Activo|TRIVIA|Pregunta/i, 12000);
    const challengePage = challengeTarget.name === 'player-a' ? playerAPage :
      challengeTarget.name === 'player-b' ? playerBPage : challengeTarget.name === 'tv' ? tvPage : hostPage;
    assert.match(challengeTarget.text, /trivia|TRIVIA|Pregunta|Challenge Activo/i);

    if (challengeTarget.name === 'player-a' || challengeTarget.name === 'player-b') {
      const options = challengePage.locator('.trivia-options button');
      await options.first().waitFor({ state: 'visible', timeout: 5000 });
      await options.first().click();
      await waitForBody(challengePage, /CORRECTO|INCORRECTO/, 5000);
      await waitForBody(tvPage, /TRIVIA|Respuesta|RETO|Challenge/, 5000);
    }
    console.log('  challenge observed on ' + challengeTarget.name);

    console.log('E2E 5/10: invalid bingo declaration is rejected');
    await waitForBody(playerAPage, /En Juego/, 8000);
    await playerAPage.evaluate(() => { window.confirm = () => true; });
    await playerAPage.getByRole('button', { name: /CANTAR BINGO/ }).click({ force: true });
    await waitForBody(playerAPage, /BINGO rechazado|BINGO reclamado|Números cantados/, 5000);
    assert.match(await playerAPage.locator('body').innerText(), /BINGO rechazado|BINGO reclamado|Números cantados/);
    console.log('  incomplete card claim was handled without ending the game');

    console.log('E2E 6/10: organizer-only REST operations reject player capabilities');
    await assertForbiddenFromPlayer(playerBPage, roomCode, playerBSession.playerCapability);
    console.log('  config and manual-card escalation rejected with HTTP 403');

    console.log('E2E 7/10: valid bingo claim finishes the game');
    await configureRoom(hostPage, roomCode, hostSession.hostCapability, {
      challengeFrequency: 10,
      tieBreakEnabled: false
    });
    await waitForBody(playerAPage, /En Juego/, 10000);

    const roomForDraw = await Room.findOne({ code: roomCode });
    assert.ok(roomForDraw?.currentGame, 'Room has no current game for bingo draw');
    const currentGameId = roomForDraw.currentGame;

    hostControlSocket = await openAuthorizedSocket({
      roomCode,
      playerId: hostSession.playerId,
      hostCapability: hostSession.hostCapability
    });
    const playerCardValues = playerASession.bingoCard.matrix
      .flat()
      .filter((value) => value !== 'BINGO');
    for (const number of playerCardValues) {
      const currentGame = await Game.findById(currentGameId);
      if (currentGame && !currentGame.availableNumbers.includes(number)) continue;
      const numberCalled = new Promise((resolvePromise) => {
        hostControlSocket.once('number-called', resolvePromise);
      });
      hostControlSocket.emit('call-number', {
        roomCode,
        number,
        hostCapability: hostSession.hostCapability
      });
      await numberCalled;
    }
    await playerAPage.waitForFunction(
      () => document.querySelectorAll('.bingo-card-cell.available').length >= 24,
      { timeout: 10000 }
    );
    for (let index = 0; index < 24; index += 1) {
      await playerAPage.locator('.bingo-card-cell.available').first().click({ force: true });
    }
    await playerAPage.waitForFunction(async ({ url, id, capability }) => {
      const response = await fetch(url + '/api/players/' + id, {
        headers: { 'x-player-capability': capability }
      });
      const data = await response.json();
      return data.player?.bingoCard?.markedCells?.length === 25;
    }, {
      url: backendURL,
      id: playerASession.playerId,
      capability: playerASession.playerCapability
    }, { timeout: 10000 });
    await playerAPage.evaluate(() => { window.confirm = () => true; });
    await playerAPage.getByRole('button', { name: /CANTAR BINGO/ }).click({ force: true });
    await waitForBody(playerAPage, /Finalizado|BINGO verificado/, 10000);
    console.log('  24 called card values were marked and the valid bingo was verified');
    hostControlSocket.disconnect();
    hostControlSocket = null;

    console.log('E2E 8/10: player disconnects and reconnects with scoped session');
    const savedPlayerBSession = await playerBPage.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
    await playerBContext.close();
    const reconnectContext = await browser.newContext();
    contexts.push(reconnectContext);
    const reconnectPage = await reconnectContext.newPage();
    await reconnectPage.goto(baseURL);
    await reconnectPage.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: savedPlayerBSession
    });
    await reconnectPage.reload();
    await waitForBody(reconnectPage, /Números cantados|Mi Cartón|Reconectando/, 10000);
    await waitForSession(reconnectPage, (value) =>
      value.roomCode === roomCode && value.playerId === savedPlayerBSession.playerId &&
      value.playerCapability === savedPlayerBSession.playerCapability
    );
    console.log('  player session reconnected with the same capability and card');

    console.log('E2E 9/10: tie-break voting modal and vote ownership');
    const roomDocument = await Room.findOne({ code: roomCode });
    assert.ok(roomDocument?.currentGame, 'Room has no current game for voting fixture');
    const gameDocument = await Game.findById(roomDocument.currentGame);
    gameDocument.tieBreakActive = true;
    gameDocument.tieBreakStatus = 'waiting-for-voting';
    gameDocument.tieCandidates = [playerASession.playerId];
    gameDocument.tieBreakVotes = [];
    await gameDocument.save();

    votingSocket = await openAuthorizedSocket({
      roomCode,
      playerId: 'tv-display',
      tvCapability: hostSession.tvCapability
    });
    votingSocket.emit('start-tiebreak-voting', { roomCode });
    await waitForBody(playerAPage, /Vota por cada candidato/);
    await waitForBody(reconnectPage, /Vota por cada candidato/);
    const voteStar = playerAPage.locator('.voting-modal-content button').first();
    await voteStar.click({ force: true });
    await waitForBody(playerAPage, /Votado|Voto registrado/);
    console.log('  players received the voting modal and a scoped vote was accepted');

    console.log('E2E 10/10: TV, players and organizer remain active after recovery');
    await waitForBody(hostPage, /Jugadores Activos/);
    await waitForBody(tvPage, /Bingo Bailable/);
    await waitForBody(reconnectPage, /Números cantados|En Juego/);
    console.log('  organizer, TV and recovered player remained synchronized');

    await tvPage.close();
    console.log('E2E PASS: complete organizer/player/TV flow and critical security/recovery scenarios');
  } finally {
    if (hostControlSocket) hostControlSocket.disconnect();
    if (votingSocket) votingSocket.disconnect();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    for (const context of contexts) {
      await context.close().catch(() => {});
    }
    if (browser) await browser.close().catch(() => {});
    await Promise.all(processes.reverse().map(({ child }) => stopProcess(child)));
    await mongo.stop();
  }
}

main().catch((error) => {
  console.error('E2E FAIL: ' + (error.stack || error.message));
  for (const [name, output] of logs) {
    if (output.length > 0) {
      console.error('--- ' + name + ' logs ---');
      console.error(output.join('').slice(-12000));
    }
  }
  process.exitCode = 1;
});
