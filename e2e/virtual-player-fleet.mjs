import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const requireFrontend = createRequire(new URL('../bingo-react/package.json', import.meta.url));
const { io: socketIo } = requireFrontend('socket.io-client');

export const VIRTUAL_PLAYER_COUNT = 24;
export const APPROVED_CONTABO_ORIGIN = 'https://bingo.31.220.98.21.sslip.io';
const SOCKET_TIMEOUT_MS = 10_000;
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const ADMISSION_TOKEN_PATTERN = /^[A-Z0-9]{6}\.[A-Za-z0-9_-]{43}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function createSeededRandom(seed, identity) {
  if (typeof seed !== 'string' || seed.length === 0) throw new TypeError('A non-empty seed is required');
  if (typeof identity !== 'string' || identity.length === 0) throw new TypeError('A non-empty identity is required');
  const digest = createHash('sha256').update(`${seed}\0${identity}`).digest();
  let state = digest.readUInt32LE(0) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function sampleReactionDelay(random, { minMs = 250, maxMs = 2200 } = {}) {
  if (typeof random !== 'function') throw new TypeError('A seeded random function is required');
  if (!Number.isInteger(minMs) || !Number.isInteger(maxMs) || minMs < 0 || maxMs < minMs) {
    throw new RangeError('Reaction delay bounds must be non-negative integer milliseconds with maxMs >= minMs');
  }
  return minMs + Math.floor(random() * (maxMs - minMs + 1));
}

function normalizeBackendUrl(value, mode) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(mode === 'contabo'
      ? 'Contabo backend URL must be a valid HTTPS URL'
      : 'Backend URL must be a valid loopback HTTP URL');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const hasUrlComponents = Boolean(url.username || url.password ||
    (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash);
  if (mode === 'local') {
    if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(hostname) || hasUrlComponents) {
      throw new TypeError('Virtual-player backend must be an HTTP loopback URL with no path, query, or credentials');
    }
    return url.origin;
  }
  if (mode === 'contabo') {
    if (typeof value !== 'string' || value !== APPROVED_CONTABO_ORIGIN ||
        url.protocol !== 'https:' || url.origin !== APPROVED_CONTABO_ORIGIN || hasUrlComponents) {
      throw new TypeError('Contabo mode permits only the approved Contabo HTTPS origin without URL credentials, path, query, or fragment');
    }
    return url.origin;
  }
  throw new TypeError('Virtual-player mode must be local or contabo');
}

function createAdmissionToken(roomCode) {
  return `${roomCode}.${randomBytes(32).toString('base64url')}`;
}

function isMatrix(value) {
  return Array.isArray(value) && value.length === 5 && value.every(row => Array.isArray(row) && row.length === 5);
}

export class VirtualPlayerFleet {
  #bots = [];
  #started = false;
  #stopped = false;
  #admissionTokenFactory;
  #configurePlayer;
  #onPlayerReady;
  #fetch;
  #logger;
  #socketFactory;
  #authorizationHeader;

  constructor({
    mode = 'local',
    backendUrl,
    authorizationHeader,
    roomCode,
    seed,
    playerCount = VIRTUAL_PLAYER_COUNT,
    firstCard = 1,
    minReactionMs = 250,
    maxReactionMs = 2200,
    fetchImpl = globalThis.fetch,
    socketFactory = (url, options) => socketIo(url, options),
    admissionTokenFactory = createAdmissionToken,
    configurePlayer = () => {},
    onPlayerReady = () => {},
    logger = entry => console.log(JSON.stringify(entry))
  } = {}) {
    this.mode = mode;
    this.backendUrl = normalizeBackendUrl(backendUrl, mode);
    if (mode === 'contabo' && (typeof authorizationHeader !== 'string' || !/^Basic [A-Za-z0-9+/]+={0,2}$/.test(authorizationHeader))) {
      throw new TypeError('Contabo mode requires Basic Auth from the protected environment');
    }
    if (mode === 'local' && authorizationHeader !== undefined) {
      throw new TypeError('Basic Auth is only accepted in Contabo mode');
    }
    this.#authorizationHeader = authorizationHeader;
    if (!ROOM_CODE_PATTERN.test(roomCode || '')) throw new TypeError('Room code must be six uppercase letters or digits');
    if (typeof seed !== 'string' || seed.length === 0) throw new TypeError('A non-empty behavior seed is required');
    if (playerCount !== VIRTUAL_PLAYER_COUNT) throw new RangeError(`The local fleet is fixed at ${VIRTUAL_PLAYER_COUNT} players`);
    if (!Number.isInteger(minReactionMs) || !Number.isInteger(maxReactionMs) || minReactionMs < 0 || maxReactionMs < minReactionMs) {
      throw new RangeError('Reaction delay bounds must be non-negative integer milliseconds with maxReactionMs >= minReactionMs');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    if (typeof socketFactory !== 'function') throw new TypeError('A socket factory is required');
    if (typeof admissionTokenFactory !== 'function') throw new TypeError('An admission-token factory is required');
    if (typeof configurePlayer !== 'function') throw new TypeError('configurePlayer must be a function');
    if (typeof onPlayerReady !== 'function') throw new TypeError('onPlayerReady must be a function');

    this.roomCode = roomCode;
    this.seed = seed;
    this.seedFingerprint = createHash('sha256').update(seed).digest('hex').slice(0, 12);
    this.playerCount = playerCount;
    if (!Number.isInteger(firstCard) || firstCard < 1 || firstCard + playerCount - 1 > 200) throw new RangeError('Virtual-player card range must fit 1..200');
    this.firstCard = firstCard;
    this.minReactionMs = minReactionMs;
    this.maxReactionMs = maxReactionMs;
    this.#fetch = fetchImpl;
    this.#socketFactory = socketFactory;
    this.#admissionTokenFactory = admissionTokenFactory;
    this.#configurePlayer = configurePlayer;
    this.#onPlayerReady = onPlayerReady;
    this.#logger = logger;
  }

  status() {
    return {
      requested: this.playerCount,
      admitted: this.#bots.length,
      connected: this.#bots.filter(bot => bot.connected).length,
      stopped: this.#stopped
    };
  }

  async start() {
    if (this.#started || this.#stopped) throw new Error('Virtual-player fleet cannot be started more than once');
    const seenTokens = new Set();
    try {
      for (let index = 0; index < this.playerCount; index += 1) {
        const alias = `bot-${String(index + 1).padStart(2, '0')}`;
        const cardNumber = this.firstCard + index;
        const admissionToken = this.#admissionTokenFactory(this.roomCode, index);
        if (!ADMISSION_TOKEN_PATTERN.test(admissionToken || '') || !admissionToken.startsWith(`${this.roomCode}.`) || seenTokens.has(admissionToken)) {
          throw new Error(`${alias} admission token is invalid or not unique`);
        }
        seenTokens.add(admissionToken);

        const admission = await this.#postJson('/api/rooms/join', {
          roomCode: this.roomCode,
          playerName: `Virtual Player ${String(index + 1).padStart(2, '0')}`,
          admissionToken
        }, {}, alias, 'admission');
        const playerId = admission?.player?._id || admission?.player?.id;
        const playerCapability = admission?.playerCapability;
        if (!admission?.success || typeof playerId !== 'string' || !playerId || typeof playerCapability !== 'string' || !playerCapability) {
          throw new Error(`${alias} admission returned an invalid player session`);
        }

        const bot = {
          alias,
          roomCode: this.roomCode,
          playerId,
          playerCapability,
          cardNumber,
          gameMode: admission.room?.config?.gameMode || 'full',
          bingoCardMatrix: null,
          bingoCardMarkedCells: [],
          connected: false,
          random: createSeededRandom(this.seed, alias),
          reactionDelay: () => sampleReactionDelay(bot.random, {
            minMs: this.minReactionMs,
            maxMs: this.maxReactionMs
          }),
          socket: null
        };
        this.#bots.push(bot);
        this.#log({ event: 'player_admitted', bot: alias, cardNumber });

        const card = await this.#postJson(`/api/rooms/${this.roomCode}/select-card`, {
          playerId,
          cardNumber
        }, { 'x-player-capability': playerCapability }, alias, 'card-selection');
        const matrix = card?.bingoCard?.matrix;
        if (!card?.success || card.cardNumber !== cardNumber || !isMatrix(matrix)) {
          throw new Error(`${alias} card selection returned an invalid card`);
        }
        bot.bingoCardMatrix = matrix;
        bot.bingoCardMarkedCells = Array.isArray(card.bingoCard.markedCells) ? card.bingoCard.markedCells : [];
        this.#onPlayerReady({
          alias,
          cardNumber,
          gameMode: bot.gameMode,
          bingoCardMatrix: matrix.map(column => [...column])
        });

        this.#createPlayerSocket(bot);
        await this.#connectAndJoin(bot);
        bot.connected = true;
        this.#log({ event: 'socket_joined', bot: alias, cardNumber });
      }
      this.#started = true;
      this.#log({ event: 'fleet_started', requested: this.playerCount, connected: this.status().connected, seedFingerprint: this.seedFingerprint });
      return this.status();
    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      seenTokens.clear();
    }
  }

  async reconnect(alias) {
    if (!this.#started || this.#stopped) throw new Error('Virtual-player fleet is not running');
    const bot = this.#bots.find(player => player.alias === alias);
    if (!bot) throw new Error('Virtual player not found');

    const previousSocket = bot.socket;
    bot.connected = false;
    try { bot.detachBehavior?.(); } catch { /* best-effort behavior teardown */ }
    bot.detachBehavior = null;
    if (previousSocket) {
      try { previousSocket.disconnect(); } catch { /* best-effort local socket teardown */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.#createPlayerSocket(bot);
    try {
      await this.#connectAndJoin(bot);
      bot.connected = true;
      const response = await this.#syncGameState(bot);
      const playerData = response?.data?.playerData;
      if (!response?.success || String(response.data?.roomCode || '').toUpperCase() !== this.roomCode ||
          String(playerData?.playerId || '') !== String(bot.playerId)) {
        throw new Error(`${alias} sync-game-state returned a different player or room`);
      }
      this.#log({ event: 'player_reconnected', bot: alias });
      return response;
    } catch (error) {
      bot.connected = false;
      try { bot.detachBehavior?.(); } catch { /* best-effort behavior teardown */ }
      bot.detachBehavior = null;
      try { bot.socket?.disconnect(); } catch { /* best-effort local socket teardown */ }
      throw error;
    }
  }

  async stop() {
    if (this.#stopped) return this.status();
    this.#stopped = true;
    for (const bot of this.#bots) {
      bot.connected = false;
      try { bot.detachBehavior?.(); } catch { /* best-effort behavior teardown */ }
      bot.detachBehavior = null;
      try { bot.socket?.disconnect(); } catch { /* best-effort local socket teardown */ }
    }
    this.#log({ event: 'fleet_stopped', admitted: this.#bots.length, connected: 0 });
    return this.status();
  }

  #createPlayerSocket(bot) {
    const socket = this.#socketFactory(this.backendUrl, {
      transports: ['websocket'],
      forceNew: true,
      autoConnect: false,
      reconnection: false,
      timeout: SOCKET_TIMEOUT_MS,
      ...(this.#authorizationHeader ? { extraHeaders: { Authorization: this.#authorizationHeader } } : {})
    });
    bot.socket = socket;
    socket.on('disconnect', () => { bot.connected = false; });
    const detach = this.#configurePlayer(bot);
    bot.detachBehavior = typeof detach === 'function' ? detach : null;
    return socket;
  }

  #syncGameState(bot) {
    return new Promise((resolve, reject) => {
      bot.socket.timeout(SOCKET_TIMEOUT_MS).emit('sync-game-state', {
        roomCode: this.roomCode,
        playerId: bot.playerId
      }, (error, response) => {
        if (error) {
          reject(new Error(`${bot.alias} sync-game-state timed out`));
          return;
        }
        if (!response?.success || !response.data) {
          reject(new Error(`${bot.alias} sync-game-state was rejected`));
          return;
        }
        resolve(response);
      });
    });
  }

  #log(entry) {
    try { this.#logger(entry); } catch { /* logging must not alter player behavior */ }
  }

  async #postJson(path, body, extraHeaders, alias, phase) {
    let response;
    try {
      response = await this.#fetch(`${this.backendUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...extraHeaders,
          ...(this.#authorizationHeader ? { Authorization: this.#authorizationHeader } : {})
        },
        body: JSON.stringify(body)
      });
    } catch {
      throw new Error(`${alias} ${phase} request failed`);
    }
    if (!response?.ok) throw new Error(`${alias} ${phase} failed (HTTP ${response?.status || 0})`);
    try {
      return await response.json();
    } catch {
      throw new Error(`${alias} ${phase} returned invalid JSON`);
    }
  }

  #connectAndJoin(bot) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        bot.socket.off('connect_error', onConnectError);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => {
        try { bot.socket.disconnect(); } catch { /* best-effort local socket teardown */ }
        finish(new Error(`${bot.alias} socket connection timed out`));
      }, SOCKET_TIMEOUT_MS);
      const onConnectError = () => finish(new Error(`${bot.alias} socket connection failed`));
      bot.socket.once('connect_error', onConnectError);
      bot.socket.once('connect', () => {
        bot.socket.timeout(SOCKET_TIMEOUT_MS).emit('join-room', {
          roomCode: this.roomCode,
          playerId: bot.playerId,
          playerCapability: bot.playerCapability
        }, (error, response) => {
          if (error) {
            finish(new Error(`${bot.alias} socket join timed out`));
            return;
          }
          if (!response?.success) {
            finish(new Error(`${bot.alias} socket join was rejected`));
            return;
          }
          finish();
        });
      });
      try {
        bot.socket.connect();
      } catch {
        finish(new Error(`${bot.alias} socket connection failed`));
      }
    });
  }
}
