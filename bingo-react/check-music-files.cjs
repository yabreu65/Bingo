const fs = require('fs');
const path = require('path');

// Leer archivos físicos
const musicDir = path.join(__dirname, 'public/music');
const physicalFiles = fs.readdirSync(musicDir).sort();

// Leer musicPlaylists.js
const playlistContent = fs.readFileSync('src/config/musicPlaylists.js', 'utf8');
const localFileMatches = playlistContent.match(/"localFile":\s*"([^"]+)"/g) || [];
const referencedFiles = localFileMatches.map(m => m.match(/"localFile":\s*"([^"]+)"/)[1]).sort();

console.log('📁 Total archivos físicos:', physicalFiles.length);
console.log('📝 Total archivos en musicPlaylists.js:', referencedFiles.length);
console.log('');

// Encontrar archivos referenciados que NO existen físicamente
console.log('❌ Archivos en musicPlaylists.js que NO existen en /public/music/:');
const missing = referencedFiles.filter(f => !physicalFiles.includes(f));
if (missing.length === 0) {
  console.log('   ✅ Ninguno (todos existen)');
} else {
  missing.forEach(f => console.log('   -', f));
}
console.log('');

// Encontrar archivos físicos que NO están referenciados
console.log('⚠️  Archivos en /public/music/ que NO están en musicPlaylists.js:');
const unreferenced = physicalFiles.filter(f => !referencedFiles.includes(f));
if (unreferenced.length === 0) {
  console.log('   ✅ Ninguno (todos están referenciados)');
} else {
  unreferenced.forEach(f => console.log('   -', f));
}
