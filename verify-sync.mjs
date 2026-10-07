import { MUSIC_PLAYLISTS } from './bingo-react/src/config/musicPlaylists.js';
import fs from 'fs';
import path from 'path';

const musicDir = './bingo-react/public/music';

// Get physical files
const physicalFiles = fs.readdirSync(musicDir)
  .filter(file => file.endsWith('.mp4'))
  .sort();

// Get playlist files
const playlistFiles = MUSIC_PLAYLISTS.map(song => song.localFile).sort();

console.log('📊 VERIFICATION REPORT');
console.log('='.repeat(60));
console.log(`\n📁 Physical files in public/music: ${physicalFiles.length}`);
console.log(`📄 Entries in MUSIC_PLAYLISTS: ${playlistFiles.length}`);

// Check for files in filesystem but not in playlist
const missingInPlaylist = physicalFiles.filter(file => !playlistFiles.includes(file));
if (missingInPlaylist.length > 0) {
  console.log(`\n❌ Files in filesystem but NOT in playlist (${missingInPlaylist.length}):`);
  missingInPlaylist.forEach(file => console.log(`   - ${file}`));
} else {
  console.log(`\n✅ All physical files are in playlist`);
}

// Check for files in playlist but not in filesystem
const missingInFilesystem = playlistFiles.filter(file => !physicalFiles.includes(file));
if (missingInFilesystem.length > 0) {
  console.log(`\n❌ Files in playlist but NOT in filesystem (${missingInFilesystem.length}):`);
  missingInFilesystem.forEach(file => console.log(`   - ${file}`));
} else {
  console.log(`✅ All playlist entries have physical files`);
}

// Show sample of matched files
console.log(`\n📋 Sample of synchronized entries (first 15):`);
console.log('-'.repeat(60));
MUSIC_PLAYLISTS.slice(0, 15).forEach((song, i) => {
  const exists = fs.existsSync(path.join(musicDir, song.localFile)) ? '✅' : '❌';
  console.log(`${i+1}. ${exists} "${song.title}" - ${song.artist}`);
  console.log(`   📁 ${song.localFile}`);
});

if (physicalFiles.length === playlistFiles.length &&
    missingInPlaylist.length === 0 &&
    missingInFilesystem.length === 0) {
  console.log('\n' + '='.repeat(60));
  console.log('🎉 ¡PERFECTO! Sincronización 100% completa');
  console.log('='.repeat(60));
}
