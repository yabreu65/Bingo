#!/usr/bin/env node
import { constants } from 'node:fs';
import { readFile, lstat, realpath, open } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { URL } from 'node:url';

const MEDIA_TYPES = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.m4a', 'audio/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm']
]);
const MEDIA_ID_PATTERN = /^m_[0-9a-f]+$/;

const parseArg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const root = await realpath(resolve(parseArg('--root', '.')));
const manifestPath = resolve(parseArg('--manifest', 'tv-media-manifest.json'));
const port = Number.parseInt(parseArg('--port', '8787'), 10);
const allowedOrigin = parseArg('--allow-origin', '');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid --port');
if (allowedOrigin && !/^https:\/\//.test(allowedOrigin)) throw new Error('--allow-origin must be HTTPS');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest?.version !== 1 || !Array.isArray(manifest.entries)) throw new Error('Unsupported media manifest');

const entries = new Map();
for (const entry of manifest.entries) {
  if (!MEDIA_ID_PATTERN.test(entry.id) || typeof entry.path !== 'string' ||
      isAbsolute(entry.path) || /^[A-Za-z]:[\\/]/.test(entry.path)) {
    throw new Error(`Invalid media manifest entry: ${entry.id}`);
  }
  const relativePath = entry.path.replaceAll('\\', '/');
  const absolutePath = resolve(root, relativePath);
  if (relative(root, absolutePath).startsWith('..') || relativePath.split('/').some((segment) => segment === '..')) {
    throw new Error(`Media manifest traversal path: ${entry.path}`);
  }
  const mime = MEDIA_TYPES.get(extname(relativePath).toLowerCase());
  if (!mime || entries.has(entry.id)) throw new Error(`Invalid or duplicate media entry: ${entry.id}`);
  entries.set(entry.id, { path: absolutePath, mime });
}

const send = (response, status, headers, body) => {
  response.writeHead(status, headers);
  if (response.method !== 'HEAD') response.end(body);
  else response.end();
};

const rangeFor = (header, size) => {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true };
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
};

const corsHeaders = allowedOrigin
  ? {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin'
  }
  : {};

// Reject symlinks in every component, not only lexical ../ traversal.
// The configured root must be trusted and not writable by untrusted users.
const openMedia = async (path) => {
  let current = root;
  for (const part of relative(root, path).split('/')) {
    current = resolve(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
  }
  const canonical = await realpath(path);
  const within = relative(root, canonical);
  if (within === '..' || within.startsWith('../') || isAbsolute(within)) {
    throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
  }
  const file = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await file.stat();
    const verified = await lstat(path);
    if (!metadata.isFile() || verified.isSymbolicLink() ||
        metadata.ino !== verified.ino || metadata.dev !== verified.dev ||
        await realpath(path) !== canonical) {
      throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
    }
    return { file, metadata };
  } catch (error) { await file.close(); throw error; }
};

const server = createServer(async (request, response) => {
  let file;
  try {
    if (request.headers.origin && request.headers.origin !== allowedOrigin) {
      send(response, 403, { 'Cache-Control': 'no-store' }, 'Forbidden');
      return;
    }
    if (!['127.0.0.1', 'localhost'].includes((request.headers.host || '').split(':')[0])) {
      send(response, 403, { 'Cache-Control': 'no-store' }, 'Forbidden');
      return;
    }
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.method === 'OPTIONS') {
      if (!allowedOrigin || request.headers.origin !== allowedOrigin) {
        send(response, 403, { 'Cache-Control': 'no-store' }, 'Forbidden');
        return;
      }
      send(response, 204, corsHeaders, '');
      return;
    }
    if (url.pathname === '/health') {
      send(response, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders }, '{"ok":true}');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, { Allow: 'GET, HEAD' }, '');
      return;
    }
    let mediaId = '';
    try {
      mediaId = decodeURIComponent(url.pathname.replace(/^\/media\//, ''));
    } catch {
      send(response, 404, { 'Cache-Control': 'no-store' }, 'Not found');
      return;
    }
    const entry = url.pathname.startsWith('/media/') ? entries.get(mediaId) : null;
    if (!entry) {
      send(response, 404, { 'Cache-Control': 'no-store' }, 'Not found');
      return;
    }
    const opened = await openMedia(entry.path);
    file = opened.file;
    const metadata = opened.metadata;
    const stream = (range) => {
      const source = file.createReadStream(range);
      file = undefined; // Stream owns and closes the descriptor.
      source.on('error', () => response.destroy());
      response.on('close', () => source.destroy());
      source.pipe(response);
    };
    const range = rangeFor(request.headers.range, metadata.size);
    const baseHeaders = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Type': entry.mime,
      ...corsHeaders
    };
    if (range?.invalid) {
      send(response, 416, { ...baseHeaders, 'Content-Range': `bytes */${metadata.size}` }, '');
      return;
    }
    if (!range) {
      response.writeHead(200, { ...baseHeaders, 'Content-Length': metadata.size });
      if (request.method === 'HEAD') response.end();
      else stream();
      return;
    }
    const length = range.end - range.start + 1;
    response.writeHead(206, {
      ...baseHeaders,
      'Content-Length': length,
      'Content-Range': `bytes ${range.start}-${range.end}/${metadata.size}`
    });
    if (request.method === 'HEAD') response.end();
    else stream({ start: range.start, end: range.end });
  } catch (error) {
    if (['ENOENT', 'ELOOP', 'ENOTDIR'].includes(error.code)) send(response, 404, { 'Cache-Control': 'no-store' }, 'Not found');
    else send(response, 500, { 'Cache-Control': 'no-store' }, 'Media service error');
  } finally {
    if (file) await file.close();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local TV media server listening on http://127.0.0.1:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
