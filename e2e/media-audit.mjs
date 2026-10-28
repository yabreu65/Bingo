import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const frontendDir = join(root, 'bingo-react');
const baseURL = 'http://127.0.0.1:5185';
const requireFromE2E = createRequire(import.meta.url);
const { chromium } = requireFromE2E('playwright');

const tracks = [
  { label: 'Bandolero — Olga Tañón', file: 'Bandolero - Olga Tanon.mp4', available: true },
  { label: 'Crayola — Danny Ocean', file: 'Danny Ocean - Crayola.mp4', available: false },
  { label: 'Meneaito — Gaby', file: 'karaoke/el-meneaito.mp4', available: true },
  { label: 'Las Avispas — Juan Luis Guerra', file: 'Juan Luis Guerra 4.40 - Las Avispas.mp4', available: false },
  { label: 'Lambada — Kaoma', file: 'Kaoma - Lambada 1989 HD.mp4', available: false },
  { label: 'La Botella', file: 'La Botella.mp4', available: false },
  { label: 'Es Mentiroso — Olga Tañón', file: 'Olga Tanon - Es Mentiroso.mp4', available: false }
];

function findChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH && existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH)) {
    return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  }
  if (existsSync(chromium.executablePath())) return chromium.executablePath();
  const candidates = [
    join(process.env.HOME || '', 'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
    join(process.env.HOME || '', 'Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
  ];
  const executable = candidates.find(candidate => existsSync(candidate));
  assert.ok(executable, 'No Chromium executable found');
  return executable;
}

function startFrontend() {
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5185'], {
    cwd: frontendDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
}

async function waitForFrontend() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/`);
      if (response.ok) return;
    } catch {
      // The dev server is still starting.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  throw new Error('Timed out waiting for Vite media audit server');
}

async function stopFrontend(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  } else {
    child.kill('SIGTERM');
  }
}

async function main() {
  const frontend = startFrontend();
  let browser;
  try {
    await waitForFrontend();
    browser = await chromium.launch({ headless: true, executablePath: findChromiumExecutable() });
    const page = await browser.newPage();

    for (const track of tracks) {
      const encodedPath = track.file.split('/').map(encodeURIComponent).join('/');
      const url = `${baseURL}/music/${encodedPath}`;
      const response = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
      if (!track.available) {
        assert.equal(response.status, 404, `${track.label} should return 404 when its file is absent`);
        console.log(`MEDIA PASS: ${track.label} -> 404 missing resource`);
        continue;
      }

      assert.equal(response.status, 206, `${track.label} should support byte ranges`);
      assert.equal(response.headers.get('content-type'), 'video/mp4');
      await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
      await page.setContent(`<video id="media" src="${url}" muted playsinline preload="auto"></video>`);
      const playback = await page.locator('#media').evaluate(async (video) => {
        await new Promise(resolvePromise => {
          if (video.readyState >= 2) resolvePromise();
          else video.addEventListener('loadeddata', resolvePromise, { once: true });
          setTimeout(resolvePromise, 5000);
        });
        await video.play();
        await new Promise(resolvePromise => setTimeout(resolvePromise, 2000));
        return { readyState: video.readyState, paused: video.paused, duration: video.duration, currentTime: video.currentTime };
      });
      assert.ok(playback.readyState >= 2, `${track.label} did not become ready`);
      assert.equal(playback.paused, false, `${track.label} paused unexpectedly`);
      assert.ok(playback.duration > 0, `${track.label} has no duration`);
      assert.ok(playback.currentTime > 0, `${track.label} currentTime did not advance`);
      console.log(`MEDIA PASS: ${track.label} -> 206, readyState=${playback.readyState}, currentTime=${playback.currentTime.toFixed(2)}s`);
    }
    console.log('MEDIA AUDIT PASS: all seven requested songs checked individually');
  } finally {
    await browser?.close();
    await stopFrontend(frontend);
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
