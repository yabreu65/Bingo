#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
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

const root = resolve(parseArg('--root', '.'));
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
  ? { 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' }
  : {};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
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
    const metadata = await stat(entry.path);
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
      else createReadStream(entry.path).pipe(response);
      return;
    }
    const length = range.end - range.start + 1;
    response.writeHead(206, {
      ...baseHeaders,
      'Content-Length': length,
      'Content-Range': `bytes ${range.start}-${range.end}/${metadata.size}`
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(entry.path, { start: range.start, end: range.end }).pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT') send(response, 404, { 'Cache-Control': 'no-store' }, 'Not found');
    else send(response, 500, { 'Cache-Control': 'no-store' }, 'Media service error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local TV media server listening on http://127.0.0.1:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
