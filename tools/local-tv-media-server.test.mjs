import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixture = join(root, 'e2e/fixtures/media/ci-karaoke.mp4');

test('serves an allowlisted synthetic media file with range support', async () => {
  const workspace = mkdtempSync(join(root, 'tools/.tmp-t6-media-'));
  const mediaRoot = join(workspace, 'media');
  mkdirSync(mediaRoot);
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
    '--port', String(port),
    '--allow-origin', 'https://event.example'
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
    const healthWithCors = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Origin: 'https://event.example' }
    });
    assert.equal(healthWithCors.headers.get('access-control-allow-origin'), 'https://event.example');
    const privateNetworkPreflight = await fetch(`http://127.0.0.1:${port}/media/${id}`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://event.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Private-Network': 'true'
      }
    });
    assert.equal(privateNetworkPreflight.status, 204);
    assert.equal(privateNetworkPreflight.headers.get('access-control-allow-private-network'), 'true');
    const full = await fetch(`http://127.0.0.1:${port}/media/${id}`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'video/mp4');
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    const fullSize = (await full.arrayBuffer()).byteLength;
    const head = await fetch(`http://127.0.0.1:${port}/media/${id}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(fullSize));
    assert.equal(await head.text(), '');
    const foreign = await fetch(`http://127.0.0.1:${port}/media/${id}`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
    const range = await fetch(`http://127.0.0.1:${port}/media/${id}`, { headers: { Range: 'bytes=0-15' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), `bytes 0-15/${fullSize}`);
    assert.equal((await fetch(`http://127.0.0.1:${port}/media/m_missing`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/media/${id}/../m_missing`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/media/%E0%A4%A`)).status, 404);
    const outside = join(workspace, 'outside.mp4');
    writeFileSync(outside, 'SYNTHETIC_OUTSIDE_CANARY');
    unlinkSync(mediaPath);
    symlinkSync(outside, mediaPath);
    // Re-point the allowlisted file through a symlink after server startup.
    // An alias outside the configured root must not be followed.
    const escaped = await fetch(`http://127.0.0.1:${port}/media/${id}`);
    assert.equal(escaped.status, 404);
    assert.ok(!(await escaped.text()).includes('SYNTHETIC_OUTSIDE_CANARY'));
    const outsideDir = join(workspace, 'external');
    mkdirSync(outsideDir);
    writeFileSync(join(outsideDir, 'ci-karaoke.mp4'), 'DIRECTORY_ESCAPE_CANARY');
    rmSync(join(mediaRoot, 'music'), { recursive: true, force: true });
    symlinkSync(outsideDir, join(mediaRoot, 'music'));
    const directoryEscape = await fetch(`http://127.0.0.1:${port}/media/${id}`);
    assert.equal(directoryEscape.status, 404);
    assert.ok(!(await directoryEscape.text()).includes('DIRECTORY_ESCAPE_CANARY'));
    execFileSync(process.execPath, [join(root, 'tools/generate-local-tv-manifest.mjs'), '--root', mediaRoot, '--out', manifest]);
    assert.equal(JSON.parse(await readFile(manifest, 'utf8')).entries.length, 0);
  } finally {
    server.kill('SIGTERM');
    await new Promise(resolvePromise => server.once('exit', resolvePromise));
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('refuses manifest traversal before opening a listening socket', () => {
  const owned = mkdtempSync(join(root, 'tools/.tmp-t6-manifest-'));
  try {
    for (const badPath of ['../outside.mp4', '/outside.mp4']) {
      const manifest = join(owned, 'manifest.json');
      writeFileSync(manifest, JSON.stringify({ version: 1, entries: [{ id: 'm_1234', path: badPath }] }));
      assert.throws(() => execFileSync(process.execPath, [join(root, 'tools/local-tv-media-server.mjs'),
        '--root', owned, '--manifest', manifest, '--port', '8799'], { stdio: 'pipe' }), error => {
        assert.equal(error.status, 1);
        assert.equal(error.stdout.toString(), '');
        assert.match(error.stderr.toString(), /Media manifest traversal path|Invalid media manifest entry/);
        return true;
      });
    }
  } finally { rmSync(owned, { recursive: true, force: true }); }
});
