import fs from 'fs';
import path from 'path';

const musicDir = './bingo-react/public/music';
const outputFile = './bingo-react/src/config/musicPlaylists.js';

// Get all MP4 files
const mp4Files = fs.readdirSync(musicDir)
  .filter(file => file.endsWith('.mp4'))
  .sort();

console.log(`Found ${mp4Files.length} music files`);

// Extract title and artist from filename
function parseFilename(filename) {
  // Remove .mp4 extension
  let name = filename.replace(/\.mp4$/, '');

  // Try to split by " - " to get artist and title
  const parts = name.split(' - ');

  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim()
    };
  } else {
    // If no separator, use the whole name as title
    return {
      artist: name.trim(),
      title: name.trim()
    };
  }
}

// Generate playlist entries
const playlistEntries = mp4Files.map(file => {
  const { artist, title } = parseFilename(file);
  return {
    title,
    artist,
    localFile: file
  };
});

// Generate the JavaScript file content
const fileContent = `/**
 * Playlist General de Música para Bingo Bailable
 *
 * Un solo playlist con todas las canciones bailables mezcladas
 * Formato de cada canción:
 * {
 *   title: "Título de la canción",
 *   artist: "Artista",
 *   localFile: "nombre-del-archivo.mp4" // Archivo en public/music/
 * }
 */

export const MUSIC_PLAYLISTS = ${JSON.stringify(playlistEntries, null, 2)}

/**
 * Función para mezclar el playlist aleatoriamente
 */
export const shufflePlaylist = () => {
  const shuffled = [...MUSIC_PLAYLISTS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Función para obtener una canción aleatoria
 */
export const getRandomSong = () => {
  return MUSIC_PLAYLISTS[Math.floor(Math.random() * MUSIC_PLAYLISTS.length)];
};

/**
 * Función para obtener el playlist completo
 */
export const getAllSongs = () => {
  return MUSIC_PLAYLISTS;
};

export default MUSIC_PLAYLISTS;
`;

// Write the file
fs.writeFileSync(outputFile, fileContent, 'utf8');

console.log(`✅ Generated ${outputFile} with ${playlistEntries.length} songs`);
console.log('\nFirst 5 entries:');
playlistEntries.slice(0, 5).forEach((entry, i) => {
  console.log(`${i + 1}. "${entry.title}" - ${entry.artist}`);
  console.log(`   File: ${entry.localFile}`);
});
