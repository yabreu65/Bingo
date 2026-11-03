#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const MEDIA_TYPES = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.m4a', 'audio/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm']
]);

const mediaIdForPath = (relativePath) => `m_${Array.from(relativePath.normalize('NFKC').toLowerCase())
  .map((character) => character.codePointAt(0).toString(16).padStart(6, '0'))
  .join('')}`;

const parseArg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const walk = async (root, directory = root) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, absolute));
    else if (entry.isFile() && MEDIA_TYPES.has(extname(entry.name).toLowerCase())) {
      const path = relative(root, absolute).replaceAll('\\', '/');
      files.push({ id: mediaIdForPath(path), path, mime: MEDIA_TYPES.get(extname(entry.name).toLowerCase()) });
    }
  }
  return files;
};

const root = resolve(parseArg('--root', '.'));
const output = resolve(parseArg('--out', 'tv-media-manifest.json'));
const entries = (await walk(root)).sort((left, right) => left.path.localeCompare(right.path));
const ids = new Set();
for (const entry of entries) {
  if (ids.has(entry.id)) throw new Error(`Duplicate media identifier: ${entry.id}`);
  ids.add(entry.id);
}

await writeFile(output, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, 'utf8');
console.log(`Generated ${entries.length} media entries at ${output}`);
