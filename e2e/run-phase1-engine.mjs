import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const backendDir = join(root, 'backend');
const frontendDir = join(root, 'bingo-react');
const baseURL = 'http://127.0.0.1:5175';
const backendURL = 'http://127.0.0.1:5102';
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
const { getCardCell } = requireFromBackend(join(backendDir, 'utils/bingoCards.js'));

const processes = [];
const logs = new Map();

const MODE_PATTERNS = {
  line: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  fourCorners: [[0, 0], [0, 4], [4, 0], [4, 4]],
  centralCross: [
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
    [0, 2], [1, 2], [3, 2], [4, 2]
  ],
  full: Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, col) => [row, col])
  ).flat()
};

function startProcess(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
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
  const signal = (name) => {
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
  await new Promise((resolvePromise) => {
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
  const bundledChromium = chromium.executablePath();
  if (bundledChromium && existsSync(bundledChromium)) return bundledChromium;
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

async function configureRoom(hostPage, roomCode, hostCapability, gameMode) {
  const result = await hostPage.evaluate(async ({ url, code, capability, mode }) => {
    const response = await fetch(url + '/api/rooms/' + code + '/config', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-room-host-capability': capability
      },
      body: JSON.stringify({
        config: {
          timeBetweenNumbers: 120,
          challengeFrequency: 10,
          tieBreakEnabled: false,
          gameMode: mode
        }
      })
    });
    return { status: response.status, body: await response.json() };
  }, { url: backendURL, code: roomCode, capability: hostCapability, mode: gameMode });

  assert.equal(result.status, 200, 'Room config failed: ' + JSON.stringify(result));
  assert.equal(result.body.success, true);
}

async function joinPlayer(page, roomCode, name, cardNumber) {
  await page.goto(baseURL + '/?room=' + roomCode);
  await page.getByLabel('Tu Nombre').fill(name);
  await page.getByLabel(/Número de Cartón/).fill(String(cardNumber));
  await page.getByRole('button', { name: /Unirse al Juego/ }).click();
  await waitForBody(page, /Números cantados|Mi Cartón|Esperando/);
  return waitForSession(page, (value) =>
    value.isHost === false && value.roomCode === roomCode &&
    value.cardNumber === cardNumber && typeof value.playerCapability === 'string'
  );
}

async function openAuthorizedSocket(payload) {
  const socket = socketIO(backendURL, { transports: ['websocket'], forceNew: true });
  await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out opening socket for ' + payload.playerId));
    }, 10000);
    const onError = (error) => {
      clearTimeout(timeout);
      reject(error);
    };
    socket.once('connect_error', onError);
    socket.once('connect', () => {
      socket.emit('join-room', payload, (response) => {
        clearTimeout(timeout);
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

async function callNumber(hostSocket, roomCode, hostCapability, number) {
  const game = await Game.findById((await Room.findOne({ code: roomCode })).currentGame);
  if (!game.availableNumbers.includes(number)) return;
  const numberCalled = new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out calling ' + number)), 5000);
    hostSocket.once('number-called', (data) => {
      clearTimeout(timeout);
      resolvePromise(data);
    });
  });
  hostSocket.emit('call-number', { roomCode, number, hostCapability });
  await numberCalled;
}

async function readRenderedCard(page) {
  return page.locator('[data-testid="bingo-card-cell"]').evaluateAll((cells) => {
    const ordered = [...cells].sort((left, right) => {
      const rowDelta = Number(left.dataset.row) - Number(right.dataset.row);
      return rowDelta || Number(left.dataset.col) - Number(right.dataset.col);
    });
    return ordered.map((cell) => ({
      row: Number(cell.dataset.row),
      col: Number(cell.dataset.col),
      value: cell.dataset.value
    }));
  });
}

function hasMarkedCell(player, row, col) {
  return player.bingoCard?.markedCells?.some((cell) =>
    Array.isArray(cell) ? cell[0] === row && cell[1] === col : cell.row === row && cell.col === col
  );
}

async function markCell(page, session, row, col) {
  const cell = page.locator(
    `[data-testid="bingo-card-cell"][data-row="${row}"][data-col="${col}"]`
  );
  await cell.waitFor({ state: 'visible', timeout: 10000 });
  await cell.click({ force: true });
  await waitForMongoDocument(
    () => Player.findById(session.playerId),
    (player) => hasMarkedCell(player, row, col),
    `mark ${row},${col}`
  );
}

async function createRoomScenario(browser, gameMode, label) {
  const contexts = [];
  let hostSocket;
  let playerAContext;
  let playerAPage;
  try {
    const hostContext = await browser.newContext();
    playerAContext = await browser.newContext();
    const playerBContext = await browser.newContext();
    contexts.push(hostContext, playerAContext, playerBContext);
    const hostPage = await hostContext.newPage();
    playerAPage = await playerAContext.newPage();
    const playerBPage = await playerBContext.newPage();
    playerAPage.on('dialog', (dialog) => dialog.accept());
    await playerAPage.addInitScript(() => { window.confirm = () => true; });

    await hostPage.goto(baseURL);
    await hostPage.getByRole('button', { name: /Comenzar a Jugar/ }).click({ force: true });
    await hostPage.getByRole('button', { name: /Crear Sala/ }).click();
    await hostPage.getByLabel('Tu Nombre').fill('Organizador ' + label);
    await hostPage.getByLabel('Nombre de la Sala').fill('Sala ' + label);
    await hostPage.getByRole('button', { name: /Crear Sala/ }).click();
    await waitForBody(hostPage, /Sala:/);
    const hostSession = await waitForSession(hostPage, (value) =>
      value.isHost === true && /^[A-Z0-9]{6}$/.test(value.roomCode) &&
      typeof value.hostCapability === 'string'
    );
    await configureRoom(hostPage, hostSession.roomCode, hostSession.hostCapability, gameMode);

    const playerASession = await joinPlayer(playerAPage, hostSession.roomCode, 'Jugador A ' + label, 1);
    const playerBSession = await joinPlayer(playerBPage, hostSession.roomCode, 'Jugador B ' + label, 2);
    await waitForBody(hostPage, /Jugadores Activos/);

    const persistedPlayer = await Player.findById(playerASession.playerId);
    const renderedCard = await readRenderedCard(playerAPage);
    assert.equal(renderedCard.length, 25, `${gameMode}: expected 25 visible cells`);
    for (const cell of renderedCard) {
      assert.equal(
        cell.value,
        String(getCardCell(persistedPlayer.bingoCard.matrix, cell.row, cell.col)),
        `${gameMode}: visual cell ${cell.row},${cell.col} differs from MongoDB`
      );
    }

    await hostPage.getByRole('button', { name: /Iniciar/ }).last().click();
    await waitForBody(hostPage, /En Juego|Número Cantado/);
    await waitForBody(playerAPage, /En Juego|Números cantados/);
    const startedRoom = await waitForMongoDocument(
      () => Room.findOne({ code: hostSession.roomCode }),
      (room) => room.gameState === 'playing' && room.currentGame,
      `${gameMode}: room started`
    );
    const startedGame = await Game.findById(startedRoom.currentGame);
    assert.equal(startedGame.gameMode, gameMode, `${gameMode}: game mode was not persisted`);
    hostSocket = await openAuthorizedSocket({
      roomCode: hostSession.roomCode,
      playerId: hostSession.playerId,
      hostCapability: hostSession.hostCapability
    });

    const pattern = MODE_PATTERNS[gameMode];
    const incompletePattern = pattern.slice(0, -1);
    const callAndMarkPattern = async (cells) => {
      for (const [row, col] of cells) {
        const value = getCardCell(persistedPlayer.bingoCard.matrix, row, col);
        if (value === 'BINGO') continue;
        await callNumber(hostSocket, hostSession.roomCode, hostSession.hostCapability, value);
        await markCell(playerAPage, playerASession, row, col);
      }
    };

    await callAndMarkPattern(incompletePattern);
    const claimButton = playerAPage.locator('.bingo-claim-btn');
    await claimButton.waitFor({ state: 'visible', timeout: 10000 });
    const invalidClaim = new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${gameMode}: invalid claim event timed out`)), 5000);
      hostSocket.once('bingo-rejected', (data) => {
        clearTimeout(timeout);
        resolvePromise(data);
      });
    });
    await claimButton.focus();
    await playerAPage.keyboard.press('Enter');
    await invalidClaim;
    await waitForBody(playerAPage, /BINGO rechazado/, 5000);
    const rejectedRoom = await Room.findOne({ code: hostSession.roomCode });
    const rejectedGame = await Game.findById(rejectedRoom.currentGame);
    assert.equal(rejectedRoom.gameState, 'playing', `${gameMode}: invalid claim changed room state`);
    assert.notEqual(rejectedGame.status, 'finished', `${gameMode}: invalid claim finished game`);
    assert.equal(rejectedGame.winners?.length || 0, 0, `${gameMode}: invalid claim persisted a winner`);

    await callAndMarkPattern([pattern.at(-1)]);
    await claimButton.focus();
    await playerAPage.keyboard.press('Enter');
    const finishedGame = await waitForMongoDocument(
      () => Game.findById(rejectedRoom.currentGame),
      (game) => game.status === 'finished' && game.winners?.length === 1,
      `${gameMode}: valid claim finished game`
    );
    const finishedRoom = await waitForMongoDocument(
      () => Room.findOne({ code: hostSession.roomCode }),
      (room) => room.gameState === 'finished',
      `${gameMode}: room finished`
    );
    assert.equal(finishedGame.winners[0].player.toString(), playerASession.playerId.toString());
    assert.equal(finishedGame.winners[0].achievement, gameMode);
    assert.equal(finishedRoom.gameState, 'finished');
    hostSocket.disconnect();
    hostSocket = null;
    await hostPage.reload();
    try {
      await waitForBody(hostPage, /Finalizado/, 10000);
    } catch (error) {
      const hostBody = await hostPage.locator('body').innerText();
      throw new Error(`${error.message}; organizer body: ${hostBody.slice(0, 1000)}`);
    }
    console.log(`  ${gameMode}: invalid and valid patterns, visible coordinates, persistence and organizer response PASS`);

    return { playerASession, playerBSession, roomCode: hostSession.roomCode };
  } finally {
    if (hostSocket) hostSocket.disconnect();
    for (const context of contexts) await context.close().catch(() => {});
  }
}

async function runStateAndStatsScenario(browser) {
  const contexts = [];
  let hostSocket;
  let playerAContext;
  try {
    const hostContext = await browser.newContext();
    playerAContext = await browser.newContext();
    const playerBContext = await browser.newContext();
    contexts.push(hostContext, playerAContext, playerBContext);
    const hostPage = await hostContext.newPage();
    let playerAPage = await playerAContext.newPage();
    const playerBPage = await playerBContext.newPage();
    playerAPage.on('dialog', (dialog) => dialog.accept());
    hostPage.on('dialog', (dialog) => dialog.accept());
    await playerAPage.addInitScript(() => { window.confirm = () => true; });

    await hostPage.goto(baseURL);
    await hostPage.getByRole('button', { name: /Comenzar a Jugar/ }).click({ force: true });
    await hostPage.getByRole('button', { name: /Crear Sala/ }).click();
    await hostPage.getByLabel('Tu Nombre').fill('Organizador Estados');
    await hostPage.getByLabel('Nombre de la Sala').fill('Sala Estados');
    await hostPage.getByRole('button', { name: /Crear Sala/ }).click();
    await waitForBody(hostPage, /Sala:/);
    const hostSession = await waitForSession(hostPage, (value) => value.isHost === true);
    await configureRoom(hostPage, hostSession.roomCode, hostSession.hostCapability, 'line');
    const playerASession = await joinPlayer(playerAPage, hostSession.roomCode, 'Jugador Estado A', 3);
    await joinPlayer(playerBPage, hostSession.roomCode, 'Jugador Estado B', 4);
    await waitForBody(hostPage, /Jugadores Activos/);

    const initialA = await Player.findById(playerASession.playerId);
    assert.equal(initialA.stats.gamesPlayed || 0, 0);
    await hostPage.getByRole('button', { name: /Iniciar/ }).last().click();
    const startedRoom = await waitForMongoDocument(
      () => Room.findOne({ code: hostSession.roomCode }),
      (room) => room.gameState === 'playing' && room.currentGame,
      'state scenario start'
    );
    hostSocket = await openAuthorizedSocket({
      roomCode: hostSession.roomCode,
      playerId: hostSession.playerId,
      hostCapability: hostSession.hostCapability
    });
    await waitForMongoDocument(
      () => Player.findById(playerASession.playerId),
      (player) => player.stats.gamesPlayed === 1,
      'gamesPlayed increment'
    );
    await waitForMongoDocument(
      () => Player.findOne({ name: 'Jugador Estado B' }),
      (player) => player.stats.gamesPlayed === 1,
      'gamesPlayed increment for second player'
    );
    const playerCard = await Player.findById(playerASession.playerId);
    const stateCell = [0, 0];
    const stateValue = getCardCell(playerCard.bingoCard.matrix, stateCell[0], stateCell[1]);
    await callNumber(hostSocket, hostSession.roomCode, hostSession.hostCapability, stateValue);
    hostSocket.disconnect();
    hostSocket = null;
    await hostPage.reload();
    await waitForBody(hostPage, /En Juego|Número Cantado/, 10000);
    await hostPage.getByRole('button', { name: 'Pausar' }).click();
    const pausedRoom = await waitForMongoDocument(
      () => Room.findOne({ code: hostSession.roomCode }),
      (room) => room.gameState === 'paused',
      'room paused'
    );
    const pausedGame = await waitForMongoDocument(
      () => Game.findById(pausedRoom.currentGame),
      (game) => game.status === 'paused',
      'game paused'
    );
    hostSocket = await openAuthorizedSocket({
      roomCode: hostSession.roomCode,
      playerId: hostSession.playerId,
      hostCapability: hostSession.hostCapability
    });
    const blockedCall = new Promise((resolvePromise) => hostSocket.once('error', resolvePromise));
    const blockedNumber = pausedGame.availableNumbers[0];
    hostSocket.emit('call-number', {
      roomCode: hostSession.roomCode,
      number: blockedNumber,
      hostCapability: hostSession.hostCapability
    });
    const blockedResponse = await blockedCall;
    assert.match(String(blockedResponse?.message), /no permite llamar/i);
    assert.equal((await Game.findById(pausedRoom.currentGame)).calledNumbers.length, pausedGame.calledNumbers.length);
    hostSocket.disconnect();
    hostSocket = null;
    await hostPage.reload();
    await waitForBody(hostPage, /Pausado/, 10000);

    const pausedCell = playerAPage.locator(
      `[data-testid="bingo-card-cell"][data-row="${stateCell[0]}"][data-col="${stateCell[1]}"]`
    );
    await pausedCell.click({ force: true });
    await waitForBody(playerAPage, /no permite marcar/i, 5000);
    const pausedPlayer = await Player.findById(playerASession.playerId);
    assert.equal(pausedPlayer.bingoCard.markedCells.length, 1, 'paused UI created a mark');

    const savedSession = await playerAPage.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
    await playerAContext.close();
    playerAContext = await browser.newContext();
    contexts.push(playerAContext);
    playerAPage = await playerAContext.newPage();
    await playerAPage.goto(baseURL);
    await playerAPage.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: savedSession
    });
    await playerAPage.reload();
    await waitForBody(playerAPage, /Pausado|Números cantados|Reconectando/, 10000);
    await waitForSession(playerAPage, (value) => value.playerId === playerASession.playerId);
    assert.equal((await Player.findById(playerASession.playerId)).bingoCard.markedCells.length, 1);

    await hostPage.getByRole('button', { name: 'Reanudar' }).click();
    const resumedRoom = await waitForMongoDocument(
      () => Room.findOne({ code: hostSession.roomCode }),
      (room) => room.gameState === 'playing',
      'room resumed'
    );
    await waitForMongoDocument(
      () => Game.findById(resumedRoom.currentGame),
      (game) => game.status === 'active',
      'game resumed'
    );

    await playerAPage.reload();
    await waitForBody(playerAPage, /Números cantados \([1-9][0-9]*\)/, 10000);
    await markCell(playerAPage, playerASession, stateCell[0], stateCell[1]);
    const markedStats = await Player.findById(playerASession.playerId);
    assert.equal(markedStats.stats.numbersMarked, 2);
    assert.equal(markedStats.stats.points, 10);
    await playerAPage.locator(
      `[data-testid="bingo-card-cell"][data-row="${stateCell[0]}"][data-col="${stateCell[1]}"]`
    ).click({ force: true });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
    const duplicateStats = await Player.findById(playerASession.playerId);
    assert.equal(duplicateStats.stats.numbersMarked, 2);
    assert.equal(duplicateStats.stats.points, 10);

    const lineCells = [[0, 1], [0, 2], [0, 3], [0, 4]];
    hostSocket = await openAuthorizedSocket({
      roomCode: hostSession.roomCode,
      playerId: hostSession.playerId,
      hostCapability: hostSession.hostCapability
    });
    for (const [row, col] of lineCells) {
      const value = getCardCell(playerCard.bingoCard.matrix, row, col);
      await callNumber(hostSocket, hostSession.roomCode, hostSession.hostCapability, value);
    }
    hostSocket.disconnect();
    hostSocket = null;
    await hostPage.reload();
    await waitForBody(hostPage, /En Juego|Número Cantado/, 10000);
    for (const [row, col] of lineCells) {
      await markCell(playerAPage, playerASession, row, col);
    }
    const stateClaimButton = playerAPage.locator('.bingo-claim-btn');
    await stateClaimButton.waitFor({ state: 'visible', timeout: 10000 });
    playerAPage.once('dialog', (dialog) => dialog.accept());
    await stateClaimButton.click({ force: true });
    const finishedGame = await waitForMongoDocument(
      () => Game.findById(resumedRoom.currentGame),
      (game) => game.status === 'finished' && game.winners?.length === 1,
      'state scenario finish'
    );
    const finalStats = await waitForMongoDocument(
      () => Player.findById(playerASession.playerId),
      (player) => player.stats.gamesWon === 1 && player.stats.bingosAchieved === 1,
      'winner statistics'
    );
    assert.equal(finalStats.stats.gamesPlayed, 1);
    assert.equal(finalStats.stats.numbersMarked, 6);
    assert.equal(finalStats.stats.points, 150);
    assert.equal(finalStats.stats.gamesWon, 1);
    assert.equal(finalStats.stats.bingosAchieved, 1);
    assert.equal(finalStats.stats.linesCompleted, 1);
    assert.equal(finishedGame.winners[0].achievement, 'line');
    const nonWinnerStats = await Player.findOne({ name: 'Jugador Estado B' });
    assert.equal(nonWinnerStats.stats.gamesPlayed, 1);
    assert.equal(nonWinnerStats.stats.gamesWon, 0);
    assert.equal(nonWinnerStats.stats.bingosAchieved, 0);
    assert.equal(nonWinnerStats.stats.points, 0);

    const savedStats = {
      points: finalStats.stats.points,
      numbersMarked: finalStats.stats.numbersMarked,
      gamesPlayed: finalStats.stats.gamesPlayed,
      gamesWon: finalStats.stats.gamesWon,
      bingosAchieved: finalStats.stats.bingosAchieved,
      linesCompleted: finalStats.stats.linesCompleted
    };
    const recoveredStats = await Player.findById(playerASession.playerId);
    assert.deepEqual({
      points: recoveredStats.stats.points,
      numbersMarked: recoveredStats.stats.numbersMarked,
      gamesPlayed: recoveredStats.stats.gamesPlayed,
      gamesWon: recoveredStats.stats.gamesWon,
      bingosAchieved: recoveredStats.stats.bingosAchieved,
      linesCompleted: recoveredStats.stats.linesCompleted
    }, savedStats);
    await waitForBody(hostPage, /Finalizado/, 5000);

    await hostPage.getByRole('button', { name: 'Reiniciar' }).click();
    const resetRoom = await waitForMongoDocument(
      () => Room.findOne({ code: hostSession.roomCode }),
      (room) => room.gameState === 'waiting' && room.currentGame,
      'room reset'
    );
    const resetGame = await Game.findById(resetRoom.currentGame);
    assert.equal(resetGame.status, 'active');
    assert.deepEqual(resetGame.calledNumbers, []);
    assert.equal(resetGame.currentNumber, null);
    assert.equal((await Player.findById(playerASession.playerId)).cardNumber, 3);
    console.log('  pause, blocked actions, resume, reconnection, stats, duplicate protection, finish and reset PASS');
  } finally {
    if (hostSocket) hostSocket.disconnect();
    for (const context of contexts) await context.close().catch(() => {});
  }
}

async function main() {
  const chromiumPath = findChromiumExecutable();
  const mongo = await MongoMemoryServer.create();
  const mongoUri = mongo.getUri('bingo-phase1-engine');
  await mongoose.connect(mongoUri);

  startProcess('backend', process.execPath, ['server.js'], backendDir, {
    NODE_ENV: 'test',
    PORT: '5102',
    MONGODB_URI: mongoUri,
    JWT_SECRET: 'bingo-phase1-test-secret-012345678901234567890',
    FRONTEND_URL: baseURL,
    SPOTIFY_CLIENT_ID: '',
    SPOTIFY_CLIENT_SECRET: '',
    YOUTUBE_API_KEY: '',
    ANTHROPIC_API_KEY: ''
  });
  startProcess('frontend', 'npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5175'], frontendDir, {
    BROWSER: 'none',
    VITE_BACKEND_URL: backendURL,
    VITE_NETWORK_IP: '127.0.0.1'
  });

  let browser;
  try {
    await waitForHttp(backendURL + '/api/health');
    await waitForHttp(baseURL);
    browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
    for (const mode of Object.keys(MODE_PATTERNS)) {
      console.log(`MODE ${mode}: independent valid and invalid browser claims`);
      await createRoomScenario(browser, mode, mode);
    }
    console.log('STATE/STATS: browser state machine and persistence scenario');
    await runStateAndStatsScenario(browser);
    console.log('PHASE 1 ENGINE PASS: all modes, states, statistics and recovery validated');
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await Promise.all(processes.reverse().map(({ child }) => stopProcess(child)));
    await mongo.stop();
  }
}

main().catch((error) => {
  console.error('PHASE 1 ENGINE FAIL: ' + (error.stack || error.message));
  for (const [name, output] of logs) {
    if (output.length > 0) {
      console.error('--- ' + name + ' logs ---');
      console.error(output.join('').slice(-12000));
    }
  }
  process.exitCode = 1;
});
