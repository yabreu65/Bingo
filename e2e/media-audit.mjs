import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const frontendDir = join(root, 'bingo-react');
const publicDir = join(frontendDir, 'public');
const baseURL = 'http://127.0.0.1:5185';
const reportDir = join(root, 'e2e', 'artifacts', 'media-audit');
const auditMode = process.env.MEDIA_AUDIT_MODE;
const ciFixtureSource = join(root, 'e2e', 'fixtures', 'media');
const ciFixturePublicName = 'media-audit-fixtures';
const ciFixturePublicDir = join(publicDir, 'music', ciFixturePublicName);
const requireFromE2E = createRequire(import.meta.url);
const { chromium } = requireFromE2E('playwright');
const { CHALLENGE_POOLS } = requireFromE2E(join(root, 'backend/constants/index.js'));

const mediaExtensions = new Set(['.mp3', '.mp4', '.webm', '.wav', '.ogg', '.m4a']);
const mimeTypes = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4'
};

assert.ok(['local', 'ci'].includes(auditMode), 'Set MEDIA_AUDIT_MODE to "local" or "ci" explicitly');

function findChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH && existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH)) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
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

function walkMedia(directory) {
  const results = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walkMedia(fullPath));
    else if (mediaExtensions.has(entry.name.toLowerCase().slice(entry.name.lastIndexOf('.')))) results.push(fullPath);
  }
  return results.sort();
}

function relativeMediaPath(filePath) {
  return relative(publicDir, filePath).split('\\').join('/');
}

function normalize(value) {
  return value.normalize('NFC').trim();
}

function comparable(value) {
  return normalize(value).toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

function checksum(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function inspectWithFfprobe(filePath) {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries',
      'format=duration,format_name:stream=index,codec_type,codec_name,profile,width,height,sample_rate,channels',
      '-of', 'json', filePath
    ], { encoding: 'utf8' });
    const data = JSON.parse(output);
    return { readable: true, duration: Number(data.format?.duration || 0), container: data.format?.format_name || null, streams: data.streams || [] };
  } catch (error) {
    return { readable: false, error: error.message, duration: 0, container: null, streams: [] };
  }
}

function assertFfprobeAvailable() {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
  } catch (error) {
    throw new Error(`ffprobe is required for the ${auditMode} media audit: ${error.message}`);
  }
}

function parsePlaylistReferences() {
  const source = readFileSync(join(frontendDir, 'src/config/musicPlaylists.js'), 'utf8');
  return [...source.matchAll(/\{\s*"title":\s*"([^"]*)",\s*"artist":\s*"([^"]*)",\s*"localFile":\s*"([^"]*)"\s*\}/g)].map(match => ({
    catalog: 'frontend playlist', title: match[1], artist: match[2], path: `music/${match[3]}`, expectedPath: match[3]
  }));
}

async function loadKaraokeReferences() {
  const module = await import(pathToFileURL(join(frontendDir, 'src/data/karaokeList.js')));
  return module.KARAOKE_SONGS.map(song => ({
    catalog: 'frontend karaoke', title: song.title, artist: song.artist, path: `music/karaoke/${song.localFile}`, expectedPath: song.localFile
  }));
}

function loadBackendKaraokeReferences() {
  return (CHALLENGE_POOLS.karaoke || []).map(song => ({
    catalog: 'backend challenge karaoke', title: song.title, artist: song.artist, path: `music/karaoke/${song.localFile}`, expectedPath: song.localFile
  }));
}

function resolveReference(reference, physicalPaths) {
  const expected = normalize(reference.path);
  const exact = physicalPaths.find(candidate => normalize(candidate) === expected);
  if (exact) return { ...reference, status: 'AVAILABLE', foundPath: exact, match: 'exact' };
  const normalizedMatches = physicalPaths.filter(candidate => comparable(candidate) === comparable(expected));
  if (normalizedMatches.length === 1) return { ...reference, status: 'RUTA CORREGIDA', foundPath: normalizedMatches[0], match: 'normalized' };
  return { ...reference, status: normalizedMatches.length > 1 ? 'REQUIERE REVISIÓN MANUAL' : 'ARCHIVO FALTANTE', foundPath: null, candidates: normalizedMatches };
}

function externalChallengeReferences() {
  return ['dance', 'sing', 'group'].flatMap(type => (CHALLENGE_POOLS[type] || []).map(song => ({
    catalog: `backend challenge ${type}`, title: song.text, deezerId: song.deezerId, status: 'PREVIEW DEEZER / EXTERNO'
  })));
}

function fixtureReferences() {
  return [
    { catalog: 'CI media fixture', title: 'CI tone', artist: 'Synthetic fixture', path: `music/${ciFixturePublicName}/ci-tone.mp3` },
    { catalog: 'CI media fixture', title: 'CI video', artist: 'Synthetic fixture', path: `music/${ciFixturePublicName}/ci-video.mp4` }
  ];
}

function encodeMediaPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function auditHttpAndPlayback(page, media) {
  const url = `${baseURL}/${encodeMediaPath(media.path)}`;
  const head = await fetch(url, { method: 'HEAD' });
  const range = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
  const result = {
    url, http200: head.status === 200, headStatus: head.status, contentType: head.headers.get('content-type'),
    contentLength: head.headers.get('content-length'), range206: range.status === 206, rangeStatus: range.status,
    contentRange: range.headers.get('content-range'), playback: null, error: null
  };
  if (!result.http200 || !result.range206) return result;
  try {
    await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
    const tag = media.mime.startsWith('audio/') ? 'audio' : 'video';
    await page.setContent(`<${tag} id="media" src="${url}" muted playsinline preload="auto"></${tag}>`);
    result.playback = await page.locator('#media').evaluate(async element => {
      await new Promise(resolvePromise => {
        if (element.readyState >= 2) resolvePromise();
        else element.addEventListener('loadedmetadata', resolvePromise, { once: true });
        setTimeout(resolvePromise, 5000);
      });
      let playError = null;
      try { await element.play(); } catch (error) { playError = error.name; }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 750));
      return {
        readyState: element.readyState, paused: element.paused, duration: element.duration,
        currentTime: element.currentTime, mediaError: element.error?.code || null, playError
      };
    });
  } catch (error) {
    result.error = error.message;
  }
  return result;
}

function markdownReport(report) {
  const rows = report.references.map(item => [item.catalog, item.title || item.path, item.path, item.foundPath || '—', item.status].map(value => String(value).replaceAll('|', '\\|')));
  const table = ['| Catálogo | Recurso | Ruta esperada | Ruta encontrada | Estado |', '|---|---|---|---|---|', ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
  return `# Media audit\n\nGenerated: ${report.generatedAt}\n\n- Mode: ${report.mode}\n- Catalog audit: ${report.catalogAudit}\n\n## Summary\n\n- Physical media: ${report.summary.physicalMedia}\n- Valid physical media: ${report.summary.validPhysicalMedia}\n- Reference records: ${report.summary.referenceRecords}\n- Missing references: ${report.summary.missingReferences}\n- Corrected/normalized references: ${report.summary.correctedReferences}\n- Duplicate checksums: ${report.summary.duplicateChecksums}\n- Unreferenced media: ${report.summary.unreferencedMedia}\n- Deezer preview references: ${report.summary.deezerPreviewReferences}\n\n## References\n\n${table}\n\n## Physical media\n\n${report.physicalMedia.map(item => `- ${item.path}: ${item.bytes} bytes, ${item.durationSeconds}s, ${item.mime}, ${item.playback?.status || 'not tested'}`).join('\n')}\n\n## HTTP safety\n\n- Missing media returns 404: ${report.httpSafety.missingMedia404}\n- Traversal attempt rejected: ${report.httpSafety.traversalRejected}\n`;
}

async function main() {
  assertFfprobeAvailable();
  if (auditMode === 'ci') {
    assert.ok(existsSync(ciFixtureSource), 'CI media fixtures directory is missing');
    cpSync(ciFixtureSource, ciFixturePublicDir, { recursive: true });
  }
  const auditRoot = auditMode === 'ci' ? ciFixturePublicDir : publicDir;
  const physicalFiles = walkMedia(auditRoot);
  const physicalPaths = physicalFiles.map(relativeMediaPath);
  const physicalMedia = physicalFiles.map(filePath => {
    const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    const probe = inspectWithFfprobe(filePath);
    return {
      path: relativeMediaPath(filePath), bytes: statSync(filePath).size, sha256: checksum(filePath),
      mime: mimeTypes[extension] || 'application/octet-stream', extension, readable: probe.readable,
      durationSeconds: Number(probe.duration.toFixed(3)), container: probe.container, streams: probe.streams,
      hasAudio: probe.streams.some(stream => stream.codec_type === 'audio'), hasVideo: probe.streams.some(stream => stream.codec_type === 'video')
    };
  });
  const catalogReferences = [
    ...parsePlaylistReferences(),
    ...(await loadKaraokeReferences()),
    ...loadBackendKaraokeReferences(),
    { catalog: 'TV/Challenges sound effects', title: 'Aplauso', artist: 'Local effect', path: 'sounds/aplauso.mp3' },
    { catalog: 'TV/Challenges sound effects', title: 'Burro', artist: 'Local effect', path: 'sounds/burro.mp3' }
  ];
  const references = (auditMode === 'ci' ? fixtureReferences() : catalogReferences)
    .map(reference => resolveReference(reference, physicalPaths));
  const resolvedPaths = new Set(references.filter(item => item.foundPath).map(item => item.foundPath));
  const hashGroups = new Map();
  for (const item of physicalMedia) hashGroups.set(item.sha256, [...(hashGroups.get(item.sha256) || []), item.path]);
  const duplicateGroups = [...hashGroups.values()].filter(group => group.length > 1);

  const frontend = startFrontend();
  let browser;
  try {
    await waitForFrontend();
    browser = await chromium.launch({ headless: true, executablePath: findChromiumExecutable() });
    const page = await browser.newPage();
    for (const media of physicalMedia) {
      media.playback = await auditHttpAndPlayback(page, media);
      const playback = media.playback.playback;
      media.playback.status = playback?.readyState >= 2 && playback.paused === false && playback.duration > 0 && playback.currentTime > 0
        ? 'DISPONIBLE Y PROBADA' : 'FALLO PENDIENTE';
      console.log(`MEDIA ${media.playback.status}: ${media.path}`);
    }
    const missingResponse = await fetch(`${baseURL}/music/not-found.mp4`, { headers: { Range: 'bytes=0-1023' } });
    const traversalResponse = await fetch(`${baseURL}/music/%252e%252e%252fforbidden.mp4`, { headers: { Range: 'bytes=0-1023' } });
    const externalReferences = externalChallengeReferences();
    const report = {
      generatedAt: new Date().toISOString(), mode: auditMode,
      catalogAudit: auditMode === 'local' ? 'full local catalog and physical library' : 'deferred: private/local catalog assets are not present in CI',
      references, externalReferences, physicalMedia, duplicateGroups,
      httpSafety: {
        missingMedia404: missingResponse.status === 404, traversalRejected: traversalResponse.status === 404,
        missingMediaStatus: missingResponse.status, traversalStatus: traversalResponse.status
      },
      summary: {
        physicalMedia: physicalMedia.length,
        validPhysicalMedia: physicalMedia.filter(item => item.readable && item.playback.status === 'DISPONIBLE Y PROBADA').length,
        referenceRecords: references.length, missingReferences: references.filter(item => item.status === 'ARCHIVO FALTANTE').length,
        correctedReferences: references.filter(item => item.status === 'RUTA CORREGIDA').length,
        duplicateChecksums: duplicateGroups.length,
        unreferencedMedia: physicalPaths.filter(path => !resolvedPaths.has(path)).length,
        deezerPreviewReferences: externalReferences.length
      }
    };
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(reportDir, 'latest.md'), markdownReport(report));
    assert.equal(report.httpSafety.missingMedia404, true, 'Missing media must return 404');
    assert.equal(report.httpSafety.traversalRejected, true, 'Traversal media request must be rejected');
    assert.equal(report.summary.validPhysicalMedia, report.summary.physicalMedia, 'Every audited physical media file must be readable and playable');
    if (auditMode === 'ci') {
      assert.equal(physicalPaths.some(path => path.startsWith('music/') && !path.startsWith(`music/${ciFixturePublicName}/`)), false, 'CI must not require private/local music assets');
      assert.equal(report.summary.missingReferences, 0, 'CI fixture references must be complete');
    }
    console.log(`MEDIA AUDIT PASS: ${report.summary.validPhysicalMedia}/${report.summary.physicalMedia} physical resources tested; ${report.summary.missingReferences} missing references documented`);
  } finally {
    await browser?.close();
    await stopFrontend(frontend);
    if (auditMode === 'ci') rmSync(ciFixturePublicDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
