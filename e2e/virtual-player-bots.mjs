import { pathToFileURL } from 'node:url';
import { basicAuthHeaderFromEnv } from './basic-auth.mjs';
import { VirtualPlayerBehavior } from './virtual-player-behavior.mjs';
import { VirtualPlayerFleet } from './virtual-player-fleet.mjs';

const usage = `Usage:
  node e2e/virtual-player-bots.mjs start [--mode local|contabo] --backend-url <approved-origin> --room-code ABC123 --seed <seed> [--first-card 1..177]

The mode defaults to local and starts exactly 24 synthetic players. Local mode accepts only HTTP loopback.
Contabo mode accepts only https://bingo.31.220.98.21.sslip.io and reads Basic Auth from
BINGO_BASIC_AUTH_USER and BINGO_BASIC_AUTH_PASSWORD in the protected process environment; credentials are not CLI options.
Keep the runner in the foreground; stop with Ctrl-C or kill -INT <PID>.`;

export function authorizationHeaderFromEnv(env = process.env) {
  return basicAuthHeaderFromEnv(env);
}

export function parseVirtualPlayerArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  if (argv[0] !== 'start') throw new Error(usage);
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--mode', '--backend-url', '--room-code', '--seed', '--first-card'].includes(key)) throw new Error(`Unknown option.\n${usage}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}\n${usage}`);
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate option: ${key}\n${usage}`);
    options[name] = value;
    index += 1;
  }
  const mode = options.mode || 'local';
  if (!['local', 'contabo'].includes(mode)) throw new Error('Unsupported mode; choose local or contabo');
  for (const name of ['backendUrl', 'roomCode', 'seed']) {
    if (!options[name]) throw new Error(`Missing required option: --${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}\n${usage}`);
  }
  const firstCard = options.firstCard === undefined ? 1 : Number(options.firstCard);
  if (!Number.isInteger(firstCard) || firstCard < 1 || firstCard > 177) throw new Error('--first-card must be an integer between 1 and 177');
  return { ...options, firstCard, mode, help: false };
}

export async function runVirtualPlayerCli(argv = process.argv.slice(2), io = console, env = process.env) {
  let options;
  try {
    options = parseVirtualPlayerArgs(argv);
  } catch (error) {
    io.error(error.message);
    return 2;
  }
  if (options.help) {
    io.log(usage);
    return 0;
  }

  let authorizationHeader;
  if (options.mode === 'contabo') {
    try {
      authorizationHeader = authorizationHeaderFromEnv(env);
    } catch (error) {
      io.error(error.message);
      return 2;
    }
  }

  let fleet;
  let heartbeat;
  let resolveStop;
  let signalReceived = false;
  const stopRequested = new Promise(resolve => { resolveStop = resolve; });
  const handleSignal = signal => {
    if (signalReceived) return;
    signalReceived = true;
    io.log(`Stopping virtual players (${signal})...`);
    resolveStop();
  };
  const onInterrupt = () => handleSignal('SIGINT');
  const onTerminate = () => handleSignal('SIGTERM');

  try {
    const behavior = new VirtualPlayerBehavior();
    fleet = new VirtualPlayerFleet({
      mode: options.mode,
      backendUrl: options.backendUrl,
      authorizationHeader,
      roomCode: options.roomCode,
      seed: options.seed,
      firstCard: options.firstCard,
      configurePlayer: bot => behavior.attach(bot),
      logger: entry => {
        if (entry.event === 'player_admitted' || entry.event === 'socket_joined') return;
        io.log(JSON.stringify(entry));
      }
    });
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onTerminate);
    await fleet.start();
    const status = fleet.status();
    io.log(`Virtual players connected: ${status.connected}/${status.requested}; admitted=${status.admitted}; seedFingerprint=${fleet.seedFingerprint}; pid=${process.pid}`);
    io.log(`Stop from another local terminal: kill -INT ${process.pid}`);
    heartbeat = setInterval(() => {
      const current = fleet.status();
      io.log(`Virtual players status: connected=${current.connected}/${current.requested}; admitted=${current.admitted}`);
    }, 15_000);
    heartbeat.unref?.();
    await stopRequested;
    return 0;
  } catch (error) {
    io.error(`Virtual-player runner failed: ${error.message}`);
    return 1;
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
    if (heartbeat) clearInterval(heartbeat);
    if (fleet) {
      const finalStatus = await fleet.stop();
      io.log(`Virtual players stopped: admitted=${finalStatus.admitted}; connected=${finalStatus.connected}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runVirtualPlayerCli().then(code => { process.exitCode = code; });
}
