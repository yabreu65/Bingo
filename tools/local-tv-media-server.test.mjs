import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixture = join(root, 'e2e/fixtures/media/ci-karaoke.mp4');

test('serves an allowlisted synthetic media file with range support', async () => {
  const mediaRoot = mkdtempSync(join(tmpdir(), 'bingo-local-tv-server-'));
  const manifest = join(mediaRoot, 'manifest.json');
  const port = 8799;
  const mediaPath = join(mediaRoot, 'music', 'ci-karaoke.mp4');
  mkdirSync(join(mediaPath, '..'), { recursive: true });
  cpSync(fixture, mediaPath);
  execFileSync(process.execPath, [
    join(root, 'tools/generate-local-tv-manifest.mjs'),
    '--root', mediaRoot,
    '--out', manifest
  ]);
  const server = spawn(process.execPath, [
    join(root, 'tools/local-tv-media-server.mjs'),
    '--root', mediaRoot,
    '--manifest', manifest,
    '--port', String(port)
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    let health;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        health = await fetch(`http://127.0.0.1:${port}/health`);
        if (health.ok) break;
      } catch {
        // The process is still starting.
      }
      await delay(50);
    }
    assert.equal(health?.status, 200);
    const manifestData = JSON.parse(await readFile(manifest, 'utf8'));
    const id = manifestData.entries[0].id;
    const full = await fetch(`http://127.0.0.1:${port}/media/${id}`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'video/mp4');
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    const fullSize = (await full.arrayBuffer()).byteLength;
    const range = await fetch(`http://127.0.0.1:${port}/media/${id}`, { headers: { Range: 'bytes=0-15' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), `bytes 0-15/${fullSize}`);
    assert.equal((await fetch(`http://127.0.0.1:${port}/media/m_missing`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/media/${id}/../m_missing`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/media/%E0%A4%A`)).status, 404);
  } finally {
    server.kill('SIGTERM');
    await new Promise(resolvePromise => server.once('exit', resolvePromise));
    rmSync(mediaRoot, { recursive: true, force: true });
  }
});
