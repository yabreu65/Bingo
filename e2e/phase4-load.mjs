import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = join(root, 'backend');
const requireFromBackend = createRequire(join(backendDir, 'server.js'));
const { io } = requireFromBackend('socket.io-client');
const { MongoMemoryServer } = requireFromBackend('mongodb-memory-server');
const mongoose = requireFromBackend('mongoose');
const Room = requireFromBackend(join(backendDir, 'models/Room.js'));
const Player = requireFromBackend(join(backendDir, 'models/Player.js'));
const Game = requireFromBackend(join(backendDir, 'models/Game.js'));
const execFileAsync = promisify(execFile);

const BASE_URL = process.env.PHASE4_BASE_URL || 'http://127.0.0.1:5102';
const PLAYER_COUNT = Number.parseInt(process.env.PHASE4_PLAYERS || '50', 10);
const SEED = Number.parseInt(process.env.PHASE4_SEED || '20261027', 10);
const RUN_MINIGAMES = process.env.PHASE4_MINIGAMES === '1';
const RUN_RESTART = process.env.PHASE4_RESTART === '1';
const OUTPUT_DIR = process.env.PHASE4_OUTPUT_DIR || join(root, 'e2e/artifacts/phase4');
const REQUEST_TIMEOUT_MS = 15000;
const TEST_JWT_SECRET = 'phase4-local-only-secret-please-do-not-reuse';

assert.equal(Number.isInteger(PLAYER_COUNT) && PLAYER_COUNT >= 2 && PLAYER_COUNT <= 50, true, 'PHASE4_PLAYERS must be between 2 and 50');
assert.match(BASE_URL, /^http:\/\/127\.0\.0\.1:\d+$/, 'Phase 4 must use a loopback HTTP endpoint');
assert.equal(!RUN_RESTART || RUN_MINIGAMES, true, 'PHASE4_RESTART requires PHASE4_MINIGAMES=1');

const monotonic = () => Number(process.hrtime.bigint()) / 1e6;
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
};
const sleep = (ms) => new Promise(resolvePromise => setTimeout(resolvePromise, ms));
async function waitForCondition(load, predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await load();
    if (predicate(value)) return value;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const metrics = {
  config: { players: PLAYER_COUNT, seed: SEED, baseUrl: BASE_URL, mode: 'local-protocol', minigames: RUN_MINIGAMES, restart: RUN_RESTART },
  startedAt: new Date().toISOString(),
  operations: { joins: 0, cardSelections: 0, socketJoins: 0, numbersCalled: 0, marksSent: 0, reconnects: 0 },
  errors: [],
  events: { gameStarted: 0, numbersReceived: 0, marksReceived: 0, duplicates: 0 },
  latenciesMs: { join: [], selectCard: [], socketJoin: [], numberPropagation: [] },
  resources: {
    backend: { samples: 0, peakRssMb: null, peakCpuPercent: null, finalRssMb: null },
    simulator: { finalRssMb: null }
  },
  minigames: { attempted: [], completed: [], errors: [] }
};

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(BASE_URL + path, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function connectClient() {
  return io(BASE_URL, { transports: ['websocket'], timeout: REQUEST_TIMEOUT_MS, reconnection: false });
}

function emitWithAck(socket, event, payload) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} acknowledgement timeout`)), REQUEST_TIMEOUT_MS);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      if (result?.success === false) reject(new Error(`${event}: ${result.error || 'rejected'}`));
      else resolvePromise(result || { success: true });
    });
  });
}

async function startBackend(mongoUri) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: { ...process.env, NODE_ENV: 'test', PORT: BASE_URL.split(':').pop(), MONGODB_URI: mongoUri, JWT_SECRET: TEST_JWT_SECRET, FRONTEND_URL: 'http://127.0.0.1:5174' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
  const logs = [];
  child.stdout.on('data', chunk => logs.push(String(chunk)));
  child.stderr.on('data', chunk => logs.push(String(chunk)));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { await request('/api/health'); return { child, logs }; } catch { await sleep(250); }
  }
  throw new Error(`Backend did not start: ${logs.join('').slice(-4000)}`);
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform !== 'win32' && child.pid) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  } else child.kill('SIGTERM');
  await new Promise(resolvePromise => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolvePromise(); }, 3000);
    child.once('exit', () => { clearTimeout(timer); resolvePromise(); });
  });
}

async function readProcessStats(pid) {
  if (!pid || process.platform === 'win32') return null;
  try {
    const { stdout } = await execFileAsync('ps', ['-o', 'rss=,pcpu=', '-p', String(pid)]);
    const [rssKb, cpuPercent] = stdout.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(rssKb) || !Number.isFinite(cpuPercent)) return null;
    return { rssMb: rssKb / 1024, cpuPercent };
  } catch {
    return null;
  }
}

async function main() {
  const mongo = await MongoMemoryServer.create();
  assert.match(mongo.getUri(), /^mongodb:\/\//, 'MongoMemoryServer URI required');
  let backend;
  let resourceTimer;
  const clients = [];
  try {
    backend = await startBackend(mongo.getUri());
    resourceTimer = setInterval(async () => {
      const sample = await readProcessStats(backend.child.pid);
      if (!sample) return;
      metrics.resources.backend.samples += 1;
      metrics.resources.backend.peakRssMb = Math.max(metrics.resources.backend.peakRssMb || 0, sample.rssMb);
      metrics.resources.backend.peakCpuPercent = Math.max(metrics.resources.backend.peakCpuPercent || 0, sample.cpuPercent);
      metrics.resources.backend.finalRssMb = sample.rssMb;
    }, 250);
    await mongoose.connect(mongo.getUri());
    const created = await request('/api/rooms/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: 'Phase 4 Organizer', config: { maxPlayers: PLAYER_COUNT + 1, timeBetweenNumbers: 120, challengeFrequency: 10, gameMode: 'full', tieBreakEnabled: false } })
    });
    const roomCode = created.room.code;
    const host = { id: created.player._id, capability: created.hostCapability, socket: connectClient() };
    clients.push(host.socket);
    await emitWithAck(host.socket, 'join-room', { roomCode, playerId: host.id, hostCapability: host.capability });
    metrics.operations.socketJoins += 1;
    let tvSocket = connectClient();
    clients.push(tvSocket);
    await emitWithAck(tvSocket, 'join-room', { roomCode, playerId: 'tv-display', tvCapability: created.tvCapability });
    metrics.operations.socketJoins += 1;

    const players = [];
    for (let index = 0; index < PLAYER_COUNT; index += 1) {
      const name = `Phase4 Player ${index + 1}`;
      const joinStarted = monotonic();
      const joined = await request('/api/rooms/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomCode, playerName: name }) });
      metrics.latenciesMs.join.push(monotonic() - joinStarted);
      metrics.operations.joins += 1;
      const cardNumber = index + 1;
      const selectStarted = monotonic();
      await request(`/api/rooms/${roomCode}/select-card`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-player-capability': joined.playerCapability }, body: JSON.stringify({ playerId: joined.player._id, cardNumber }) });
      metrics.latenciesMs.selectCard.push(monotonic() - selectStarted);
      metrics.operations.cardSelections += 1;
      const socket = connectClient();
      clients.push(socket);
      const client = { id: joined.player._id, capability: joined.playerCapability, cardNumber, socket, matrix: null, receivedNumbers: new Set(), reconnects: 0 };
      socket.on('number-called', data => {
        if (!data?.number || client.receivedNumbers.has(data.number)) { if (client.receivedNumbers.has(data?.number)) metrics.events.duplicates += 1; return; }
        client.receivedNumbers.add(data.number);
        metrics.events.numbersReceived += 1;
        const receivedAt = monotonic();
        metrics.latenciesMs.numberPropagation.push(receivedAt - (client.lastNumberSentAt || receivedAt));
        if (!client.matrix) return;
        for (let row = 0; row < 5; row += 1) for (let col = 0; col < 5; col += 1) {
          if (client.matrix[col]?.[row] === data.number) { client.socket.emit('mark-cell', { roomCode, playerId: client.id, row, col }); metrics.operations.marksSent += 1; }
        }
      });
      const socketStarted = monotonic();
      await emitWithAck(socket, 'join-room', { roomCode, playerId: client.id, playerCapability: client.capability });
      metrics.latenciesMs.socketJoin.push(monotonic() - socketStarted);
      metrics.operations.socketJoins += 1;
      players.push(client);
    }

    const persistedRoom = await Room.findOne({ code: roomCode }).populate('players');
    assert.equal(persistedRoom.players.filter(player => player.cardNumber != null).length, PLAYER_COUNT);
    const cardNumbers = persistedRoom.players.filter(player => player.cardNumber != null).map(player => player.cardNumber);
    assert.equal(new Set(cardNumbers).size, PLAYER_COUNT, 'duplicate card assignments');
    for (const client of players) client.matrix = (await Player.findById(client.id)).bingoCard.matrix;

    host.socket.emit('start-game', { roomCode, hostCapability: host.capability });
    await sleep(250);
    metrics.events.gameStarted = players.length;
    const game = await Game.findOne({ room: persistedRoom._id });
    assert.ok(game, 'game was not persisted');

    let restarted = false;
    const restartBackend = async () => {
      if (restarted) return;
      restarted = true;
      for (const client of players) client.socket.disconnect();
      host.socket.disconnect();
      tvSocket.disconnect();
      await sleep(250);
      await stopBackend(backend.child);
      backend = await startBackend(mongo.getUri());

      host.socket = connectClient();
      clients.push(host.socket);
      await emitWithAck(host.socket, 'join-room', { roomCode, playerId: host.id, hostCapability: host.capability });
      metrics.operations.socketJoins += 1;
      tvSocket = connectClient();
      clients.push(tvSocket);
      await emitWithAck(tvSocket, 'join-room', { roomCode, playerId: 'tv-display', tvCapability: created.tvCapability });
      metrics.operations.socketJoins += 1;
      for (const client of players) {
        client.socket = connectClient();
        clients.push(client.socket);
        client.receivedNumbers = new Set();
        client.socket.on('number-called', data => {
          if (!data?.number || client.receivedNumbers.has(data.number)) {
            if (client.receivedNumbers.has(data?.number)) metrics.events.duplicates += 1;
            return;
          }
          client.receivedNumbers.add(data.number);
          metrics.events.numbersReceived += 1;
          const receivedAt = monotonic();
          metrics.latenciesMs.numberPropagation.push(receivedAt - (client.lastNumberSentAt || receivedAt));
          if (!client.matrix) return;
          for (let row = 0; row < 5; row += 1) for (let col = 0; col < 5; col += 1) {
            if (client.matrix[col]?.[row] === data.number) {
              client.socket.emit('mark-cell', { roomCode, playerId: client.id, row, col });
              metrics.operations.marksSent += 1;
            }
          }
        });
        await emitWithAck(client.socket, 'join-room', { roomCode, playerId: client.id, playerCapability: client.capability });
        metrics.operations.socketJoins += 1;
        await emitWithAck(client.socket, 'sync-game-state', { roomCode, playerId: client.id });
      }

      const recoveredRoom = await Room.findOne({ code: roomCode });
      const recoveredPlayers = await Player.find({ room: recoveredRoom._id }).lean();
      assert.equal(recoveredPlayers.length, PLAYER_COUNT + 1, 'player count changed after backend restart');
      assert.ok(recoveredPlayers.every(player => player.cardNumber == null || player.bingoCard?.markedCells), 'card or marks missing after restart');
      metrics.restart = { status: 'PASS', recoveredPlayers: recoveredPlayers.length, recoveredGameState: recoveredRoom.gameState };
    };

    if (RUN_MINIGAMES) {
      const challengeTypes = ['trivia', 'riddle', 'dance', 'sing', 'group', 'karaoke'];
      for (const type of challengeTypes) {
        metrics.minigames.attempted.push(type);
        host.socket.emit('launch-event', { roomCode, type, hostCapability: host.capability });
        try {
          const active = await waitForCondition(
            () => Game.findOne({ room: persistedRoom._id }).lean(),
            current => current?.activeChallenge?.type === type,
            `${type} challenge`
          );
          const challenge = active.activeChallenge;
          const participants = type === 'group'
            ? players
            : players.filter(client => client.id.toString() === challenge.player.toString());
          assert.ok(participants.length > 0, `${type} challenge selected no connected participant`);
          if (RUN_RESTART && type === 'group') await restartBackend();
          if (type === 'karaoke') {
            tvSocket.emit('karaoke-video-end', { roomCode });
          } else {
            await Promise.all(participants.map(client => {
              client.socket.emit('challenge-complete', { roomCode, playerId: client.id, challengeId: challenge.id, type });
              return Promise.resolve();
            }));
          }
          await waitForCondition(
            () => Game.findOne({ room: persistedRoom._id }).lean(),
            current => !current?.activeChallenge && (
              type === 'karaoke' ||
              current?.gameEvents?.some(event => event.type === 'challenge_completed' && event.data?.challengeType === type)
            ),
            `${type} challenge completion`
          );
          metrics.minigames.completed.push(type);
        } catch (error) {
          metrics.minigames.errors.push({ type, error: error.message });
          throw error;
        }
      }
    }

    for (let number = 1; number <= 75; number += 1) {
      const sentAt = monotonic();
      for (const client of players) client.lastNumberSentAt = sentAt;
      host.socket.emit('call-number', { roomCode, number, hostCapability: host.capability });
      metrics.operations.numbersCalled += 1;
      await waitForCondition(
        () => Game.findOne({ room: persistedRoom._id }).lean(),
        current => current?.calledNumbers?.includes(number),
        `number ${number}`
      );
    }
    await waitForCondition(
      () => Player.findById(players[0].id).lean(),
      current => (current?.bingoCard?.markedCells || []).length >= 24,
      'target player marks'
    );

    const target = players[0];
    target.socket.emit('claim-bingo', { roomCode, playerId: target.id, bingoType: 'full' });
    await sleep(500);
    const finalRoom = await Room.findOne({ code: roomCode });
    const finalGame = await Game.findOne({ room: finalRoom._id }).sort({ createdAt: -1 });
    assert.equal(finalRoom.gameState, 'finished', `game did not finish: ${finalRoom.gameState}`);
    assert.equal(finalGame.winners?.some(winner => winner.player?.toString() === target.id.toString()), true);

    const reconnectTarget = players.slice(0, 10);
    for (const client of reconnectTarget) {
      client.socket.disconnect();
      await waitForCondition(
        () => Player.findById(client.id).lean(),
        current => !current?.socketId && current?.isConnected === false,
        `disconnect ${client.id}`
      );
      client.socket = connectClient();
      clients.push(client.socket);
      await emitWithAck(client.socket, 'join-room', { roomCode, playerId: client.id, playerCapability: client.capability });
      client.reconnects += 1;
      metrics.operations.reconnects += 1;
    }
    const recovered = await Promise.all(reconnectTarget.map(client => Player.findById(client.id)));
    assert.equal(recovered.filter(Boolean).length, reconnectTarget.length);
    assert.equal(new Set(recovered.map(player => player._id.toString())).size, reconnectTarget.length);

    metrics.finishedAt = new Date().toISOString();
    metrics.result = { status: 'PASS', roomCode, connectedPlayers: PLAYER_COUNT, gameId: finalGame._id.toString(), winner: target.id.toString(), reconnections: metrics.operations.reconnects };
  } catch (error) {
    metrics.finishedAt = new Date().toISOString();
    metrics.result = { status: 'FAIL', error: error.message };
    if (backend?.logs) console.error(`PHASE4 BACKEND TAIL:\n${backend.logs.join('').slice(-5000)}`);
    throw error;
  } finally {
    if (resourceTimer) clearInterval(resourceTimer);
    const finalBackendStats = await readProcessStats(backend?.child?.pid);
    if (finalBackendStats) {
      metrics.resources.backend.finalRssMb = finalBackendStats.rssMb;
      metrics.resources.backend.peakRssMb = Math.max(metrics.resources.backend.peakRssMb || 0, finalBackendStats.rssMb);
      metrics.resources.backend.peakCpuPercent = Math.max(metrics.resources.backend.peakCpuPercent || 0, finalBackendStats.cpuPercent);
    }
    metrics.resources.simulator.finalRssMb = process.memoryUsage().rss / 1024 / 1024;
    for (const socket of clients) socket.disconnect();
    await stopBackend(backend?.child);
    await mongoose.disconnect().catch(() => {});
    await mongo.stop();
    const latencyReport = {};
    for (const [name, values] of Object.entries(metrics.latenciesMs)) latencyReport[name] = { count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: values.length ? Math.max(...values) : null };
    metrics.latenciesMs = latencyReport;
    metrics.finishedAt ||= new Date().toISOString();
    await mkdir(OUTPUT_DIR, { recursive: true });
    const stem = `run-${Date.now()}-${SEED}`;
    await writeFile(join(OUTPUT_DIR, `${stem}.json`), JSON.stringify(metrics, null, 2));
    await writeFile(join(OUTPUT_DIR, `${stem}.md`), `# Phase 4 load run\n\n- Status: **${metrics.result?.status || 'FAIL'}**\n- Players: ${PLAYER_COUNT}\n- Seed: ${SEED}\n- Join p95: ${latencyReport.join?.p95?.toFixed(2) || 'n/a'} ms\n- Socket join p95: ${latencyReport.socketJoin?.p95?.toFixed(2) || 'n/a'} ms\n- Number operations: ${metrics.operations.numbersCalled}\n- Reconnections: ${metrics.operations.reconnects}\n- Errors: ${metrics.errors.length}\n`);
    if (metrics.result?.status === 'PASS') console.log(`PHASE4 LOAD PASS: ${PLAYER_COUNT} players, ${metrics.operations.reconnects} reconnections, report ${stem}.json`);
  }
}

main().catch(error => { console.error(`PHASE4 LOAD FAIL: ${error.stack || error.message}`); process.exitCode = 1; });
