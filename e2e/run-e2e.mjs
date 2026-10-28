import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const backendDir = join(root, 'backend');
const frontendDir = join(root, 'bingo-react');
const baseURL = 'http://127.0.0.1:5174';
const backendURL = 'http://127.0.0.1:5101';
const storageKey = 'bingo_session';
const ciMediaFixtureName = 'media-audit-fixtures';
const ciMediaFixtureSource = join(root, 'e2e', 'fixtures', 'media');
const ciMediaFixturePublicDir = join(frontendDir, 'public', 'music', ciMediaFixtureName);
const ciKaraokeAliasSource = join(ciMediaFixtureSource, 'ci-karaoke.mp4');
const ciMediaAliasSource = ciKaraokeAliasSource;

const requireFromE2E = createRequire(import.meta.url);
const requireFromBackend = createRequire(join(backendDir, 'server.js'));
const requireFromFrontend = createRequire(join(frontendDir, 'package.json'));
const { chromium } = requireFromE2E('playwright');
const { MongoMemoryServer } = requireFromBackend('mongodb-memory-server');
const { CHALLENGE_POOLS } = requireFromBackend(join(backendDir, 'constants/index.js'));
const { io: socketIO } = requireFromFrontend('socket.io-client');
const mongoose = requireFromBackend('mongoose');
const Room = requireFromBackend(join(backendDir, 'models/Room.js'));
const Game = requireFromBackend(join(backendDir, 'models/Game.js'));
const Player = requireFromBackend(join(backendDir, 'models/Player.js'));
const AdminContent = requireFromBackend(join(backendDir, 'models/AdminContent.js'));
const Playlist = requireFromBackend(join(backendDir, 'models/Playlist.js'));
const Prize = requireFromBackend(join(backendDir, 'models/Prize.js'));
const { getChallengePoints } = requireFromBackend(join(backendDir, 'utils/challengeRules.js'));

const processes = [];
const logs = new Map();

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

async function waitForChallengePage(pages, type, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const [name, page] of pages) {
      if (page.isClosed()) continue;
      const challenge = page.locator(`.challenge-type-${type}`);
      if (await challenge.count().catch(() => 0)) return { name, page };
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error('Timed out waiting for ' + type + ' challenge in browser pages');
}

function findChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH && existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH)) {
    return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  }

  const bundledChromium = chromium.executablePath();
  if (bundledChromium && existsSync(bundledChromium)) {
    return bundledChromium;
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

    const adminResponse = await fetch(url + '/api/admin/rooms/' + code + '/contents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-capability': capability },
      body: JSON.stringify({ kind: 'dance', statement: 'Unauthorized admin content' })
    });
    const adminBody = await adminResponse.json();

    return {
      config: { status: configResponse.status, body: configBody },
      manual: { status: manualResponse.status, body: manualBody },
      admin: { status: adminResponse.status, body: adminBody }
    };
  }, { url: backendURL, code: roomCode, capability: playerCapability });

  assert.equal(result.config.status, 403, 'Player modified config: ' + JSON.stringify(result.config));
  assert.equal(result.manual.status, 403, 'Player assigned manual card: ' + JSON.stringify(result.manual));
  assert.equal(result.admin.status, 403, 'Player modified admin catalog: ' + JSON.stringify(result.admin));
  const configError = result.config.body.error?.message || result.config.body.error || result.config.body.message;
  const manualError = result.manual.body.error?.message || result.manual.body.error || result.manual.body.message;
  const adminError = result.admin.body.error?.message || result.admin.body.error || result.admin.body.message;
  assert.match(String(configError), /permiso/i);
  assert.match(String(manualError), /permiso/i);
  assert.match(String(adminError), /permiso/i);
}

async function openAuthorizedSocket(payload) {
  const socket = socketIO(backendURL, { transports: ['websocket'], forceNew: true });
  await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out opening authorized socket for ' + payload.playerId));
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

async function main() {
  const chromiumPath = findChromiumExecutable();
  const mongo = await MongoMemoryServer.create();
  const mongoUri = mongo.getUri('bingo-e2e');
  await mongoose.connect(mongoUri);
  const ciMediaAliases = [];
  if (process.env.MEDIA_AUDIT_MODE === 'ci') {
    cpSync(ciMediaFixtureSource, ciMediaFixturePublicDir, { recursive: true });
    const playlistSource = readFileSync(join(frontendDir, 'src/config/musicPlaylists.js'), 'utf8');
    const localFiles = [...playlistSource.matchAll(/"localFile":\s*"([^"]+)"/g)].map(match => match[1]);
    for (const localFile of localFiles) {
      const target = join(frontendDir, 'public', 'music', localFile);
      if (existsSync(target)) continue;
      mkdirSync(join(target, '..'), { recursive: true });
      cpSync(ciMediaAliasSource, target);
      ciMediaAliases.push(target);
    }
    for (const karaoke of CHALLENGE_POOLS.karaoke || []) {
      const target = join(frontendDir, 'public', 'music', 'karaoke', karaoke.localFile);
      if (existsSync(target)) continue;
      mkdirSync(join(target, '..'), { recursive: true });
      cpSync(ciKaraokeAliasSource, target);
      ciMediaAliases.push(target);
    }
  }

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
  let tvControlSocket;
  let votingSocket;
  let spoofSocket;
  const contexts = [];
  try {
    await waitForHttp(backendURL + '/api/health');
    await waitForHttp(baseURL);

    browser = await chromium.launch({ headless: true, executablePath: chromiumPath });

    const hostContext = await browser.newContext();
    let playerAContext = await browser.newContext();
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
    await configureRoom(hostPage, roomCode, hostSession.hostCapability, { challengeFrequency: 10 });
    console.log('  room ' + roomCode + ' created with isolated config');

    console.log('E2E 1b/10: organizer creates managed content through the browser');
    await hostPage.getByRole('button', { name: /Centro de Administración/ }).click();
    await waitForBody(hostPage, /Centro de Administración/);
    await hostPage.getByLabel('Tipo').selectOption('trivia');
    await hostPage.getByLabel('Título').fill('Trivia administrada E2E');
    await hostPage.getByLabel('Consigna').fill('¿Qué número representa la letra O?');
    const adminForm = hostPage.locator('.admin-card').first();
    await adminForm.locator('input').nth(1).fill('61-75');
    await adminForm.locator('input').nth(2).fill('16-30');
    await adminForm.getByLabel('Índice correcto').fill('0');
    await adminForm.getByRole('button', { name: /Guardar/ }).click();
    await waitForBody(hostPage, /Contenido guardado/);
    const managedContent = await hostPage.evaluate(async ({ url, code, capability }) => {
      const response = await fetch(url + '/api/admin/rooms/' + code + '/contents?kind=trivia', { headers: { 'x-room-host-capability': capability } });
      return { status: response.status, body: await response.json() };
    }, { url: backendURL, code: roomCode, capability: hostSession.hostCapability });
    assert.equal(managedContent.status, 200);
    assert.equal(managedContent.body.items[0].statement, '¿Qué número representa la letra O?');
    console.log('E2E 1c/10: organizer manages playlist, prizes and room configuration visually');
    const createTrack = async (title, resourceId) => {
      await hostPage.getByRole('button', { name: 'Música' }).click();
      await hostPage.getByRole('button', { name: /Registrar pista/ }).click();
      await hostPage.getByLabel('Título').fill(title);
      await hostPage.getByLabel('Consigna').fill(title + ' de prueba');
      await hostPage.getByLabel('Artista').fill('Codex Test');
      await hostPage.getByLabel('Identificador seguro del recurso').fill(resourceId);
      await hostPage.getByLabel('Origen').selectOption('local');
      await hostPage.getByRole('button', { name: /Guardar/ }).click();
      await waitForBody(hostPage, /Contenido guardado/);
    };
    const trackOne = process.env.MEDIA_AUDIT_MODE === 'ci'
      ? `${ciMediaFixtureName}/ci-video.mp4`
      : 'Michael Jackson - Thriller.mp4';
    const trackTwo = process.env.MEDIA_AUDIT_MODE === 'ci'
      ? `${ciMediaFixtureName}/ci-video.mp4`
      : 'Daddy Yankee - Gasolina.mp4';
    await createTrack('Pista visual uno', trackOne);
    await createTrack('Pista visual dos', trackTwo);
    await hostPage.getByRole('button', { name: 'Música' }).click();
    await hostPage.getByText('Pista visual uno').locator('..').locator('input[type="checkbox"]').check();
    await hostPage.getByText('Pista visual dos').locator('..').locator('input[type="checkbox"]').check();
    await hostPage.getByPlaceholder('Nombre').fill('Playlist E2E local');
    await hostPage.getByPlaceholder('Descripción').fill('Recursos reproducibles de prueba');
    await hostPage.getByRole('button', { name: /Crear playlist/ }).click();
    await waitForBody(hostPage, /Playlist creada/);
    const playlistArticle = hostPage.locator('.admin-item').filter({ hasText: 'Playlist E2E local' });
    await playlistArticle.getByRole('button', { name: 'Editar' }).click();
    await playlistArticle.getByRole('button', { name: 'Asignar' }).click();
    await waitForBody(hostPage, /Playlist asignada/);
    await hostPage.getByRole('button', { name: 'Sala', exact: true }).click();
    await hostPage.getByLabel('Intervalo (s)').fill('7');
    await hostPage.getByLabel('Frecuencia de retos').fill('2');
    await hostPage.getByLabel('Máximo de jugadores').fill('12');
    await hostPage.getByLabel('Modalidad').selectOption('line');
    await hostPage.getByRole('checkbox', { name: 'Desempate habilitado' }).check();
    await hostPage.getByLabel('Playlist activa').selectOption({ label: 'Playlist E2E local' });
    await hostPage.getByRole('button', { name: /Guardar/ }).click();
    await waitForBody(hostPage, /Configuración guardada/);
    const configuredRoom = await Room.findOne({ code: roomCode }).populate({ path: 'config.activePlaylist', populate: { path: 'tracks' } });
    assert.equal(configuredRoom.config.timeBetweenNumbers, 7);
    assert.equal(configuredRoom.config.challengeFrequency, 2);
    assert.equal(configuredRoom.config.maxPlayers, 12);
    assert.equal(configuredRoom.config.gameMode, 'line');
    assert.equal(configuredRoom.config.tieBreakEnabled, true);
    assert.equal(configuredRoom.config.activePlaylist.name, 'Playlist E2E local');
    assert.equal(configuredRoom.config.activePlaylist.tracks.length, 2);
    await hostPage.getByLabel('Frecuencia de retos').fill('10');
    await hostPage.getByLabel('Intervalo (s)').fill('7');
    await hostPage.getByLabel('Modalidad').selectOption('full');
    await hostPage.getByLabel('Máximo de jugadores').fill('50');
    await hostPage.getByRole('button', { name: /Guardar/ }).click();
    await waitForBody(hostPage, /Configuración guardada/);
    await hostPage.getByRole('button', { name: 'Premios' }).click();
    await hostPage.getByLabel('Nombre').fill('Premio E2E');
    await hostPage.getByLabel('Descripción').fill('Reconocimiento de prueba');
    await hostPage.getByLabel('Cantidad').fill('2');
    await hostPage.getByRole('button', { name: /Crear premio/ }).click();
    await waitForBody(hostPage, /Premio creado/);
    await hostPage.locator('.admin-item').filter({ hasText: 'Premio E2E' }).getByRole('button', { name: 'Editar' }).click();
    await hostPage.getByLabel('Nombre').fill('Premio E2E actualizado');
    await hostPage.getByRole('button', { name: /Guardar cambios/ }).click();
    await waitForBody(hostPage, /Premio actualizado/);
    let dialogValues = ['player-e2e', 'Jugador E2E'];
    const dialogHandler = async dialog => dialog.accept(dialogValues.shift() || '');
    hostPage.on('dialog', dialogHandler);
    await hostPage.locator('.admin-item').filter({ hasText: 'Premio E2E actualizado' }).getByRole('button', { name: 'Entregar' }).click();
    await waitForBody(hostPage, /Entrega registrada/);
    hostPage.off('dialog', dialogHandler);
    const persistedPrize = await Prize.findOne({ room: configuredRoom._id, name: 'Premio E2E actualizado' });
    assert.equal(persistedPrize.remaining, 1);
    assert.equal(persistedPrize.deliveries.length, 1);
    console.log('  playlist, configuration and prize operations persisted through browser controls');
    await hostPage.getByRole('button', { name: /Cerrar/ }).click();
    console.log('  managed trivia was persisted and returned by the authorized catalog API');

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
    await playerAPage.locator('.music-toggle-btn').click({ force: true });
    await waitForBody(playerAPage, /Pista visual uno|Pista visual dos/);
    console.log('  player consumed the active room playlist through the visual music player');
    await waitForBody(hostPage, /Jugadores Activos/);
    assert.match(await hostPage.locator('body').innerText(), /3/);
    console.log('  players joined with cards 1 and 2');

    const readRenderedCard = async (page) => page.locator('[data-testid="bingo-card-cell"]').evaluateAll((cells) => {
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

    const persistedPlayerA = await Player.findById(playerASession.playerId);
    const expectedVisualCard = Array.from({ length: 5 }, (_, row) =>
      Array.from({ length: 5 }, (_, col) => String(persistedPlayerA.bingoCard.matrix[col][row]))
    ).flat();
    const renderedPlayerA = await readRenderedCard(playerAPage);
    for (const cell of renderedPlayerA) {
      assert.equal(
        cell.value,
        String(persistedPlayerA.bingoCard.matrix[cell.col][cell.row]),
        `Visual cell ${cell.row},${cell.col} does not match persisted coordinates`
      );
    }
    assert.deepEqual(
      renderedPlayerA.map((cell) => cell.value),
      expectedVisualCard,
      'Rendered player card differs from the persisted backend card'
    );
    console.log('  visual card values match the persisted backend matrix');

    console.log('E2E 3/10: TV popup authorization, game start, Socket.IO and music resource');
    const popupPromise = hostPage.waitForEvent('popup', { timeout: 10000 });
    await hostPage.getByRole('button', { name: /Abrir TV/ }).click();
    const tvPage = await popupPromise;
    await tvPage.waitForLoadState('domcontentloaded');
    await waitForBody(tvPage, /Bingo Bailable|Bingo Navideño/);
    await waitForBody(tvPage, new RegExp(roomCode));
    const musicSource = await tvPage.locator('.video-wrapper video source').getAttribute('src');
    assert.ok(musicSource && musicSource.includes('/music/'), 'TV music source missing: ' + musicSource);
    await tvPage.waitForFunction(() => {
      const video = document.querySelector('.video-wrapper video');
      return Boolean(video?.currentSrc) && video.readyState >= 2;
    }, null, { timeout: 30000 });
    const tvPlayback = await tvPage.locator('.video-wrapper video').evaluate(async (video) => {
      video.muted = true;
      video.play().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 500));
      return { readyState: video.readyState, paused: video.paused, duration: video.duration };
    });
    assert.ok(tvPlayback.readyState >= 2 && !tvPlayback.paused && tvPlayback.duration > 0,
      `TV media did not start: ${JSON.stringify(tvPlayback)}`);
    const tvInitialText = await tvPage.locator('body').innerText();
    assert.match(tvInitialText, /Bingo Bailable/);
    await waitForBody(tvPage, /En Espera|En Juego|CANTADOS|Únete al Bingo/);

    await hostPage.getByRole('button', { name: /Iniciar/ }).last().click();
    await waitForBody(hostPage, /En Juego|Número Cantado/);
    await waitForBody(playerAPage, /En Juego|Números cantados/);
    await waitForBody(playerBPage, /En Juego|Números cantados/);
    await waitForBody(tvPage, /En Juego|PAUSADO|CANTADOS|Números Cantados|Número/, 20000);
    await waitForBody(playerAPage, /Números cantados \([1-9]/, 12000);
    const playerNumber = await playerAPage.locator('.called-number').first().innerText();
    await waitForBody(tvPage, new RegExp('\\b' + playerNumber + '\\b'), 5000);
    assert.ok(playerNumber, 'Player did not receive a called number');
    console.log('  Socket.IO synchronized number ' + playerNumber + '; TV music source ' + musicSource);

    hostControlSocket = await openAuthorizedSocket({
      roomCode,
      playerId: hostSession.playerId,
      hostCapability: hostSession.hostCapability
    });
    tvControlSocket = await openAuthorizedSocket({
      roomCode,
      playerId: 'tv-display',
      tvCapability: hostSession.tvCapability
    });
    const ensureHostControlSocket = async () => {
      if (!hostControlSocket?.connected) {
        hostControlSocket = await openAuthorizedSocket({
          roomCode,
          playerId: hostSession.playerId,
          hostCapability: hostSession.hostCapability
        });
      }
      return hostControlSocket;
    };
    const visualCardCells = await readRenderedCard(playerAPage);
    const targetCells = [];
    for (const cell of visualCardCells) {
      if (cell.value === 'BINGO' || targetCells.some((target) => target.row === cell.row || target.col === cell.col)) continue;
      targetCells.push(cell);
      if (targetCells.length === 3) break;
    }
    assert.equal(targetCells.length, 3, 'Expected three numeric cells in distinct rows for visual validation');
    for (const targetCell of targetCells) {
      const targetNumber = Number(targetCell.value);
      const currentVisualGame = await Game.findById((await Room.findOne({ code: roomCode })).currentGame);
      if (!currentVisualGame.calledNumbers.includes(targetNumber)) {
        await ensureHostControlSocket();
        const numberCalled = new Promise((resolvePromise) => {
          hostControlSocket.once('number-called', resolvePromise);
        });
        hostControlSocket.emit('call-number', {
          roomCode,
          number: targetNumber,
          hostCapability: hostSession.hostCapability
        });
        await Promise.race([
          numberCalled,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out calling visual target number')), 5000))
        ]);
      }
      const visualCell = playerAPage.locator(
        `[data-testid="bingo-card-cell"][data-row="${targetCell.row}"][data-col="${targetCell.col}"]`
      );
      await visualCell.click({ force: true });
      await waitForMongoDocument(
        () => Player.findById(playerASession.playerId),
        (player) => player.bingoCard?.markedCells?.some((cell) =>
          Array.isArray(cell)
            ? cell[0] === targetCell.row && cell[1] === targetCell.col
            : cell.row === targetCell.row && cell.col === targetCell.col
        ),
        `visual card mark persisted at ${targetCell.row},${targetCell.col}`
      );
    }
    const visualMarkedPlayer = await Player.findById(playerASession.playerId);
    assert.equal(visualMarkedPlayer.bingoCard.markedCells.length, 4, 'Only the free cell and three visual marks should be persisted');
    console.log('  three visual numbers from distinct rows were marked and persisted with real coordinates');
    await configureRoom(hostPage, roomCode, hostSession.hostCapability, { challengeFrequency: 1, timeBetweenNumbers: 7 });

    console.log('E2E 4/10: automatic trivia challenge, answer flow and public synchronization');
    const scenarioPages = [['player-a', playerAPage], ['player-b', playerBPage], ['tv', tvPage], ['host', hostPage]];
    const challengeTarget = await waitForTextOrPages(scenarioPages, /¡RETO!|Challenge Activo|TRIVIA|Pregunta/i, 12000);
    const challengePage = challengeTarget.name === 'player-a' ? playerAPage :
      challengeTarget.name === 'player-b' ? playerBPage : challengeTarget.name === 'tv' ? tvPage : hostPage;
    assert.match(challengeTarget.text, /trivia|TRIVIA|Pregunta|Challenge Activo/i);

    const gameForRoom = async () => {
      const currentRoom = await Room.findOne({ code: roomCode });
      return currentRoom?.currentGame ? Game.findById(currentRoom.currentGame) : null;
    };

    const triviaChallenge = await waitForChallengePage(
      [['player-a', playerAPage], ['player-b', playerBPage]],
      'trivia'
    );
    const triviaPage = triviaChallenge.page;
    const managedTriviaGame = await gameForRoom();
    assert.equal(
      managedTriviaGame?.activeChallenge?.data?.question,
      '¿Qué número representa la letra O?',
      'The first trivia challenge must use the managed room catalog'
    );

    const options = triviaPage.locator('.trivia-options button');
    await options.first().waitFor({ state: 'visible', timeout: 5000 });
    await options.first().click();
    await waitForBody(triviaPage, /CORRECTO|INCORRECTO/, 5000);
    await waitForBody(tvPage, /TRIVIA|Respuesta|RETO|Challenge/, 5000);
    console.log('  challenge observed on ' + challengeTarget.name);
    await waitForMongoDocument(
      gameForRoom,
      (game) => !game?.activeChallenge,
      'automatic trivia completion'
    );
    await configureRoom(hostPage, roomCode, hostSession.hostCapability, { challengeFrequency: 10 });

    const challengePages = [['player-a', playerAPage], ['player-b', playerBPage]];
    const launchChallenge = async (type) => {
      await ensureHostControlSocket();
      hostControlSocket.emit('launch-event', {
        roomCode,
        type,
        hostCapability: hostSession.hostCapability
      });
    };
    const launchChallengeAndComplete = async (type, complete) => {
      await launchChallenge(type);
      const challenge = await waitForChallengePage(challengePages, type);
      const activeChallenge = await gameForRoom();
      const challengeId = activeChallenge?.activeChallenge?.id;
      const performerId = activeChallenge?.activeChallenge?.player?.toString();
      const performerPage = performerId === playerASession.playerId.toString()
        ? playerAPage
        : performerId === playerBSession.playerId.toString() ? playerBPage : challenge.page;
      await complete(performerPage, performerId || challenge.name);
      await waitForMongoDocument(gameForRoom, (game) => !game?.activeChallenge, `${type} completion`);
      return { challengeId, performerId };
    };

    console.log('E2E 4b/10: riddle, dance, sing, group and karaoke challenge contracts');
    await launchChallengeAndComplete('riddle', async (page) => {
      const game = await gameForRoom();
      const answer = game.activeChallenge.data.answers[0];
      await page.getByLabel('Respuesta de la adivinanza').fill(answer);
      await page.getByRole('button', { name: /Enviar respuesta/ }).click();
      await tvPage.getByRole('status').getByText('RESULTADO DE LA ADIVINANZA').waitFor({ state: 'visible', timeout: 10000 });
      await tvPage.getByText('✅ ¡CORRECTO!').waitFor({ state: 'visible', timeout: 10000 });
    });
    await launchChallengeAndComplete('riddle', async (page) => {
      await page.getByLabel('Respuesta de la adivinanza').fill('respuesta deliberadamente incorrecta');
      await page.getByRole('button', { name: /Enviar respuesta/ }).click();
      await tvPage.getByRole('status').getByText('RESULTADO DE LA ADIVINANZA').waitFor({ state: 'visible', timeout: 10000 });
      await tvPage.getByText('❌ INCORRECTO').waitFor({ state: 'visible', timeout: 10000 });
      assert.doesNotMatch(await tvPage.locator('body').innerText(), /Failed to fetch/);
    });
    const musicFailureRoute = async route => route.abort();
    await Promise.all(challengePages.map(([, page]) => page.route('**/api/deezer/track/**', musicFailureRoute)));
    await launchChallengeAndComplete('dance', async (page) => {
      await page.getByText(/La música no está disponible ahora|La música tardó demasiado/).waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('.challenge-modal .btn-close-challenge').click();
    });
    await Promise.all(challengePages.map(([, page]) => page.unroute('**/api/deezer/track/**', musicFailureRoute)));
    const singBeforeStats = new Map();
    for (const session of [playerASession, playerBSession]) {
      const player = await Player.findById(session.playerId);
      singBeforeStats.set(session.playerId.toString(), {
        points: player.stats.points,
        challengesCompleted: player.stats.challengesCompleted
      });
    }
    const singRun = await launchChallengeAndComplete('sing', async (page) => {
      await page.locator('.challenge-modal .btn-close-challenge').click();
    });
    const singBefore = singBeforeStats.get(singRun.performerId);
    await waitForMongoDocument(
      () => Player.findById(singRun.performerId),
      (player) => player.stats.challengesCompleted === singBefore.challengesCompleted + 1 &&
        player.stats.points === singBefore.points + getChallengePoints('sing', { success: true }),
      'sing points persistence before group baseline'
    );

    const groupBeforeStats = new Map();
    for (const session of [playerASession, playerBSession]) {
      const player = await Player.findById(session.playerId);
      groupBeforeStats.set(session.playerId.toString(), {
        points: player.stats.points,
        challengesCompleted: player.stats.challengesCompleted
      });
    }

    await launchChallenge('group');
    await Promise.all(challengePages.map(([, page]) =>
      page.locator('.challenge-type-group').waitFor({ state: 'visible', timeout: 10000 })
    ));
    const interactiveGroup = await gameForRoom();
    const interactiveGroupId = interactiveGroup?.activeChallenge?.id;
    const configuredGroupPoints = interactiveGroup?.activeChallenge?.points;
    const calculatedGroupPoints = getChallengePoints('group', {
      success: true,
      configuredPoints: configuredGroupPoints
    });
    const groupParticipantIds = (interactiveGroup?.activeChallenge?.participants || [])
      .map((participant) => participant.playerId.toString());
    assert.ok(interactiveGroupId, 'Interactive group challenge was not persisted');
    assert.deepEqual(
      new Set(groupParticipantIds),
      new Set([playerASession.playerId.toString(), playerBSession.playerId.toString()]),
      'Interactive group challenge did not select both connected players'
    );

    const interactiveGroupStartedAt = Date.now();
    await Promise.all(challengePages.map(([, page]) =>
      page.locator('.challenge-modal .btn-close-challenge').click()
    ));
    const completedGroup = await waitForMongoDocument(
      gameForRoom,
      (game) => game?.gameEvents?.some((event) =>
        event.type === 'challenge_completed' && event.data?.challengeId === interactiveGroupId
      ),
      'interactive group response persistence',
      10000
    );
    const groupEvent = completedGroup.gameEvents.find((event) =>
      event.type === 'challenge_completed' && event.data?.challengeId === interactiveGroupId
    );
    const groupCompletionEvents = completedGroup.gameEvents.filter((event) =>
      event.type === 'challenge_completed' && event.data?.challengeId === interactiveGroupId
    );
    assert.equal(groupEvent.data.responses.length, groupParticipantIds.length);
    assert.deepEqual(
      new Set(groupEvent.data.responses.map((response) => response.playerId.toString())),
      new Set(groupParticipantIds),
      'Interactive group completion did not persist every participant response'
    );
    assert.ok(Date.now() - interactiveGroupStartedAt < 30000, 'Group completion used the timeout path');
    for (const session of [playerASession, playerBSession]) {
      const player = await Player.findById(session.playerId);
      const before = groupBeforeStats.get(session.playerId.toString());
      const persistedAccreditations = (player.stats.points - before.points) / calculatedGroupPoints;
      console.log(`  group participant ${session.playerId}: before=${before.points}, challengeId=${interactiveGroupId}, configured=${configuredGroupPoints}, calculated=${calculatedGroupPoints}, responses=${groupEvent.data.responses.length}, persistedAccreditations=${persistedAccreditations}, after=${player.stats.points}, completionEvents=${groupCompletionEvents.length}`);
      assert.equal(player.stats.points, before.points + calculatedGroupPoints, 'Group points were not awarded exactly once');
      assert.equal(
        player.stats.challengesCompleted,
        before.challengesCompleted + 1,
        'Group completion was counted more than once or not at all'
      );
    }
    assert.equal(groupCompletionEvents.length, 1, 'Group challenge completed more than once');
    const completedRoom = await Room.findOne({ code: roomCode });
    assert.equal(completedRoom.gameState, 'playing', 'Bingo did not resume after interactive group completion');

    await launchChallenge('group');
    await waitForChallengePage(challengePages, 'group');
    const timeoutGroup = await gameForRoom();
    assert.ok(timeoutGroup?.activeChallenge?.id, 'Timeout group challenge was not persisted');
    await waitForMongoDocument(gameForRoom, (game) => !game?.activeChallenge, 'group timeout recovery', 40000);
    const timeoutRoom = await Room.findOne({ code: roomCode });
    assert.equal(timeoutRoom.gameState, 'playing', 'Bingo did not resume after group timeout');
    await launchChallenge('karaoke');
    await waitForChallengePage([['player-a', playerAPage], ['player-b', playerBPage], ['tv', tvPage]], 'karaoke');
    const karaokeGame = await gameForRoom();
    const karaokeChallengeId = karaokeGame.activeChallenge.id;
    assert.ok(karaokeChallengeId, 'Karaoke challenge identity must be persisted');
    assert.equal(karaokeGame.activeChallenge.duration, 60, 'Karaoke default duration must be 60 seconds');
    const karaokePlayerId = karaokeGame.activeChallenge.player.toString();
    const karaokePlayerPage = karaokePlayerId === playerASession.playerId.toString() ? playerAPage : playerBPage;
    await karaokePlayerPage.locator('.challenge-type-karaoke').waitFor({ state: 'visible', timeout: 10000 });
    const karaokeVideo = tvPage.locator('.challenge-overlay video');
    await karaokeVideo.waitFor({ state: 'visible', timeout: 10000 });
    await tvPage.waitForFunction(
      () => document.querySelector('.challenge-overlay video')?.readyState >= 2 && document.querySelector('.challenge-overlay video')?.duration > 0,
      null,
      { timeout: 10000 }
    );
    assert.ok((await karaokeVideo.getAttribute('src'))?.includes('/music/karaoke/'), 'Karaoke must load its local media route');
    const karaokePlayerBefore = await Player.findById(karaokePlayerId);
    await karaokeVideo.evaluate(video => video.dispatchEvent(new Event('ended')));
    await waitForMongoDocument(gameForRoom, (game) => !game?.activeChallenge, 'karaoke completion');
    const karaokePlayerAfter = await Player.findById(karaokePlayerId);
    assert.equal(
      karaokePlayerAfter.stats.challengesCompleted,
      karaokePlayerBefore.stats.challengesCompleted + 1,
      'Karaoke must award completion exactly once'
    );
    assert.equal((await Room.findOne({ code: roomCode })).gameState, 'playing', 'Bingo did not resume after karaoke');
    console.log('  riddle correct/incorrect TV feedback, friendly music failure, group responses and 60s karaoke recovery passed');

    console.log('  disconnecting and reconnecting player A after visual marks');
    const savedPlayerASession = await playerAPage.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
    await playerAContext.close();
    playerAContext = await browser.newContext();
    contexts.push(playerAContext);
    playerAPage = await playerAContext.newPage();
    await playerAPage.goto(baseURL);
    await playerAPage.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: savedPlayerASession
    });
    await playerAPage.reload();
    await waitForBody(playerAPage, /Números cantados|Mi Cartón|Reconectando/, 10000);
    await waitForSession(playerAPage, (value) =>
      value.roomCode === roomCode && value.playerId === savedPlayerASession.playerId &&
      value.playerCapability === savedPlayerASession.playerCapability
    );
    const recoveredPlayerA = await Player.findById(playerASession.playerId);
    for (const targetCell of targetCells) {
      assert.ok(recoveredPlayerA.bingoCard.markedCells.some((cell) =>
        Array.isArray(cell)
          ? cell[0] === targetCell.row && cell[1] === targetCell.col
          : cell.row === targetCell.row && cell.col === targetCell.col
      ), `Visual mark ${targetCell.row},${targetCell.col} was lost after reconnection`);
    }
    console.log('  player A retained its assigned card and all visual marks after reconnection');

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
    await waitForMongoDocument(
      () => Room.findOne({ code: roomCode }),
      (room) => room.gameState === 'playing',
      'game resumed before tie-break draw',
      15000
    );

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

    const cardValuesByPlayer = [playerASession, playerBSession].map((session) =>
      session.bingoCard.matrix.flat().filter((value) => value !== 'BINGO')
    );
    const cardValues = [...new Set(cardValuesByPlayer.flat())];
    const callNumberReliably = async (number) => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const currentGame = await Game.findById(currentGameId);
        if (!currentGame || !['active', 'playing'].includes(currentGame.status)) {
          throw new Error(`Cannot call ${number}: game status is ${currentGame?.status || 'missing'}`);
        }
        if (!currentGame.availableNumbers.includes(number)) return;

        await ensureHostControlSocket();
        let onNumberCalled;
        let onError;
        const eventOutcome = new Promise((resolvePromise) => {
          onNumberCalled = (payload) => resolvePromise({ type: 'number-called', payload });
          onError = (payload) => resolvePromise({ type: 'error', payload });
          hostControlSocket.once('number-called', onNumberCalled);
          hostControlSocket.once('error', onError);
        });
        hostControlSocket.emit('call-number', {
          roomCode,
          number,
          hostCapability: hostSession.hostCapability
        });

        const outcome = await Promise.race([
          eventOutcome,
          new Promise((resolvePromise) => setTimeout(() => resolvePromise({ type: 'timeout' }), 5000))
        ]);
        hostControlSocket.off('number-called', onNumberCalled);
        hostControlSocket.off('error', onError);
        let persistedGame;
        try {
          persistedGame = await waitForMongoDocument(
            () => Game.findById(currentGameId),
            (game) => game?.calledNumbers?.includes(number) ||
              !['active', 'playing'].includes(game?.status),
            `number ${number} to be persisted`,
            5000
          );
        } catch (error) {
          if (attempt === 3) throw error;
          continue;
        }
        if (persistedGame.calledNumbers?.includes(number)) return;
        if (outcome.type === 'error' && attempt === 3) {
          throw new Error(`Calling ${number} failed: ${JSON.stringify(outcome.payload)}`);
        }
      }
    };
    for (const number of cardValues) {
      await callNumberReliably(number);
    }
    const markFullCard = async (page, session) => {
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="bingo-card-cell"]').length === 25,
        { timeout: 10000 }
      );
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          if (row === 2 && col === 2) continue;
          const cell = page.locator(
            `[data-testid="bingo-card-cell"][data-row="${row}"][data-col="${col}"]`
          );
          await cell.waitFor({ state: 'visible', timeout: 10000 });
          await cell.click({ force: true });
          await waitForMongoDocument(
            () => Player.findById(session.playerId),
            (player) => player.bingoCard?.markedCells?.some((markedCell) =>
              Array.isArray(markedCell)
                ? markedCell[0] === row && markedCell[1] === col
                : markedCell.row === row && markedCell.col === col
            ),
            `mark full-card cell ${row},${col} for ${session.playerId}`
          );
        }
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
    if (tvControlSocket) tvControlSocket.disconnect();
    if (spoofSocket) spoofSocket.disconnect();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    for (const context of contexts) {
      await context.close().catch(() => {});
    }
    if (browser) await browser.close().catch(() => {});
    await Promise.all(processes.reverse().map(({ child }) => stopProcess(child)));
    await mongo.stop();
    for (const target of ciMediaAliases) rmSync(target, { force: true });
    if (process.env.MEDIA_AUDIT_MODE === 'ci') rmSync(ciMediaFixturePublicDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('E2E FAIL: ' + (error.stack || error.message));
  const artifactDir = join(root, 'artifacts');
  mkdirSync(artifactDir, { recursive: true });
  for (const [name, output] of logs) {
    if (output.length > 0) {
      console.error('--- ' + name + ' logs ---');
      const log = output.join('');
      console.error(log.slice(-12000));
      writeFileSync(join(artifactDir, `${name}.log`), log);
    }
  }
  process.exitCode = 1;
});
