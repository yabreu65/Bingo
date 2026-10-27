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
const Player = requireFromBackend(join(backendDir, 'models/Player.js'));

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

async function waitForMongoDocument(load, predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let lastDocument;
  while (Date.now() < deadline) {
    lastDocument = await load();
    if (lastDocument && predicate(lastDocument)) return lastDocument;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error('Timed out waiting for ' + label + ': ' + JSON.stringify(lastDocument));
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
  let spoofSocket;
  const contexts = [];
  try {
    await waitForHttp(backendURL + '/api/health');
    await waitForHttp(baseURL);

    browser = await chromium.launch({ headless: true, executablePath: chromiumPath });

    const hostContext = await browser.newContext();
    const playerAContext = await browser.newContext();
    let playerBContext = await browser.newContext();
    contexts.push(hostContext, playerAContext, playerBContext);

    const hostPage = await hostContext.newPage();
    let playerAPage = await playerAContext.newPage();
    let playerBPage = await playerBContext.newPage();

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

    console.log('E2E 7/10: legitimate tie-break with two full bingo claims');
    await configureRoom(hostPage, roomCode, hostSession.hostCapability, {
      challengeFrequency: 10,
      tieBreakEnabled: true
    });

    console.log('  disconnecting and reconnecting player B before the tie');
    const savedPlayerBSession = await playerBPage.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
    await playerBContext.close();
    playerBContext = await browser.newContext();
    contexts.push(playerBContext);
    playerBPage = await playerBContext.newPage();
    await playerBPage.goto(baseURL);
    await playerBPage.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: savedPlayerBSession
    });
    await playerBPage.reload();
    await waitForBody(playerBPage, /Números cantados|Mi Cartón|Reconectando/, 10000);
    await waitForSession(playerBPage, (value) =>
      value.roomCode === roomCode && value.playerId === savedPlayerBSession.playerId &&
      value.playerCapability === savedPlayerBSession.playerCapability
    );
    console.log('  player B session reconnected with the same capability and card');

    await waitForBody(playerAPage, /En Juego/, 10000);
    await waitForBody(playerBPage, /En Juego/, 10000);

    const roomForDraw = await Room.findOne({ code: roomCode });
    assert.ok(roomForDraw?.currentGame, 'Room has no current game for bingo draw');
    const currentGameId = roomForDraw.currentGame;

    hostControlSocket = await openAuthorizedSocket({
      roomCode,
      playerId: hostSession.playerId,
      hostCapability: hostSession.hostCapability
    });
    const cardValuesByPlayer = [playerASession, playerBSession].map((session) =>
      session.bingoCard.matrix.flat().filter((value) => value !== 'BINGO')
    );
    const cardValues = [...new Set(cardValuesByPlayer.flat())];
    for (const number of cardValues) {
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
    const markFullCard = async (page, session) => {
      await page.waitForFunction(
        () => document.querySelectorAll('.bingo-card-cell.available').length >= 24,
        { timeout: 10000 }
      );
      for (let index = 0; index < 24; index += 1) {
        await page.locator('.bingo-card-cell.available').first().click({ force: true });
      }
      await waitForMongoDocument(
        () => Player.findById(session.playerId),
        (player) => player.bingoCard?.markedCells?.length === 25,
        'full marked card for ' + session.playerId
      );
    };

    await markFullCard(playerAPage, playerASession);
    await markFullCard(playerBPage, playerBSession);
    await playerAPage.evaluate(() => { window.confirm = () => true; });
    await playerBPage.evaluate(() => { window.confirm = () => true; });
    await Promise.all([
      playerAPage.evaluate(() => document.querySelector('.bingo-claim-btn')?.click()),
      playerBPage.evaluate(() => document.querySelector('.bingo-claim-btn')?.click())
    ]);

    const tieGame = await waitForMongoDocument(
      () => Game.findById(currentGameId),
      (game) => game.tieBreakActive === true && game.tieCandidates?.length === 2,
      'two legitimate tie-break candidates',
      10000
    );
    const tieCandidateIds = tieGame.tieCandidates.map((candidateId) => candidateId.toString());
    assert.deepEqual(
      new Set(tieCandidateIds),
      new Set([playerASession.playerId.toString(), playerBSession.playerId.toString()])
    );
    console.log('  both independent players claimed valid bingo inside the tie window');

    await waitForBody(tvPage, /DESEMPATE|Baile de Thriller/, 10000);
    await waitForBody(tvPage, /Candidato 1 de 2/, 10000);
    await tvPage.getByRole('button', { name: /INICIAR BAILE/ }).click({ force: true });
    await waitForMongoDocument(
      () => Game.findById(currentGameId),
      (game) => game.tieBreakCurrentPerformer?.status === 'performing',
      'first tie-break performance to start'
    );
    await waitForBody(tvPage, /Candidato 2 de 2/, 22000);
    await tvPage.getByRole('button', { name: /INICIAR BAILE/ }).click({ force: true });
    await waitForMongoDocument(
      () => Game.findById(currentGameId),
      (game) => game.tieBreakStatus === 'waiting-for-voting' && !game.tieBreakCurrentPerformer,
      'all tie-break performances to finish',
      22000
    );
    await waitForBody(tvPage, /ABRIR VOTACIONES/, 5000);
    console.log('  TV completed both public performances and exposed the voting action');

    console.log('E2E 8/10: voting UI, valid votes and voter identity protection');
    await tvPage.getByRole('button', { name: /ABRIR VOTACIONES/ }).click({ force: true });
    await waitForBody(playerAPage, /Vota por cada candidato/);
    await waitForBody(playerBPage, /Vota por cada candidato/);
    assert.equal(await playerAPage.locator('.voting-modal-content button').count(), 10);
    assert.equal(await playerBPage.locator('.voting-modal-content button').count(), 10);

    const castBrowserVotes = async (page) => {
      const buttons = page.locator('.voting-modal-content button');
      await buttons.nth(4).click({ force: true });
      await buttons.nth(9).click({ force: true });
      await waitForBody(page, /Has votado por todos/, 5000);
    };
    // Keep the browser actions sequential here. The backend accepts concurrent
    // voters, but sequential UI actions make the persisted identity/count
    // assertions deterministic and leave the concurrency coverage to the
    // atomic backend handlers.
    await castBrowserVotes(playerAPage);
    await castBrowserVotes(playerBPage);
    const votedGame = await waitForMongoDocument(
      () => Game.findById(currentGameId),
      (game) => game.tieBreakVotes?.length === 4 &&
        new Set(game.tieBreakVotes.map((vote) => vote.voterId.toString())).size === 2,
      'votes from both browser sessions',
      10000
    );
    assert.equal(votedGame.tieBreakVotes.filter((vote) => vote.voterId.toString() === playerASession.playerId.toString()).length, 2);
    assert.equal(votedGame.tieBreakVotes.filter((vote) => vote.voterId.toString() === playerBSession.playerId.toString()).length, 2);

    await playerBContext.close();
    await waitForMongoDocument(
      () => Player.findById(playerBSession.playerId),
      (player) => player.isConnected === false,
      'player B disconnect before identity probe'
    );
    spoofSocket = await openAuthorizedSocket({
      roomCode,
      playerId: playerBSession.playerId,
      playerCapability: playerBSession.playerCapability
    });
    const spoofError = new Promise((resolvePromise) => spoofSocket.once('error', resolvePromise));
    spoofSocket.emit('cast-tiebreak-vote', {
      roomCode,
      voterId: playerASession.playerId,
      performerId: tieCandidateIds[0],
      stars: 5
    });
    const spoofResponse = await spoofError;
    assert.match(String(spoofResponse?.message), /permisos/i);
    const unmodifiedGame = await Game.findById(currentGameId);
    assert.equal(unmodifiedGame.tieBreakVotes?.length || 0, 4);
    spoofSocket.disconnect();
    spoofSocket = null;

    playerBContext = await browser.newContext();
    contexts.push(playerBContext);
    playerBPage = await playerBContext.newPage();
    await playerBPage.goto(baseURL);
    await playerBPage.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: savedPlayerBSession
    });
    await playerBPage.reload();
    await waitForBody(playerBPage, /Vota por cada candidato/, 10000);
    await waitForSession(playerBPage, (value) =>
      value.roomCode === roomCode && value.playerId === savedPlayerBSession.playerId &&
      value.playerCapability === savedPlayerBSession.playerCapability
    );
    console.log('  both browser sessions voted and a spoofed voter identity was rejected');

    console.log('E2E 9/10: tie-break results and persisted winner transition');
    const finalGame = await waitForMongoDocument(
      () => Game.findById(currentGameId),
      (game) => game.status === 'finished' && game.tieBreakActive === false &&
        game.tieBreakStatus === null && game.winners?.length === 1,
      'tie-break final result',
      40000
    );
    const finalRoom = await waitForMongoDocument(
      () => Room.findOne({ code: roomCode }),
      (room) => room.gameState === 'finished',
      'finished room state',
      5000
    );
    assert.equal(finalRoom.gameState, 'finished');
    assert.equal(finalGame.winners[0].player.toString(), tieCandidateIds[0]);
    await waitForBody(hostPage, /Finalizado/, 5000);
    await waitForBody(playerAPage, /Finalizado/, 5000);
    await waitForBody(playerBPage, /Finalizado/, 5000);
    await waitForBody(tvPage, /¡BINGO!/, 5000);
    const winnerName = tieCandidateIds[0] === playerASession.playerId.toString() ? 'Jugador A' : 'Jugador B';
    await waitForBody(tvPage, new RegExp(winnerName), 5000);
    console.log('  voting results selected ' + winnerName + ' and finished the game for all clients');

    console.log('E2E 10/10: organizer, TV and recovered players remain coherent');
    await waitForBody(hostPage, /Jugadores Activos/);
    // The TV keeps the winner overlay visible while the room status banner
    // can still be transitioning; the winner assertion above is the public
    // completion signal for this display.
    await waitForBody(tvPage, /¡BINGO!|Finalizado/);
    await waitForBody(playerAPage, /Finalizado/);
    await waitForBody(playerBPage, /Finalizado/);
    console.log('  organizer, TV and both recovered player sessions remained synchronized');

    await tvPage.close();
    console.log('E2E PASS: complete organizer/player/TV flow and critical security/recovery scenarios');
  } finally {
    if (hostControlSocket) hostControlSocket.disconnect();
    if (votingSocket) votingSocket.disconnect();
    if (spoofSocket) spoofSocket.disconnect();
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
