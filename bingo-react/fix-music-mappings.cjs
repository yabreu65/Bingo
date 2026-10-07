const fs = require('fs');
const path = require('path');

// Leer archivos físicos
const musicDir = path.join(__dirname, 'public/music');
const physicalFiles = fs.readdirSync(musicDir).sort();

console.log('📁 Archivos físicos encontrados:', physicalFiles.length);

// Leer musicPlaylists.js
const playlistPath = 'src/config/musicPlaylists.js';
let playlistContent = fs.readFileSync(playlistPath, 'utf8');

console.log('📝 Procesando musicPlaylists.js...\n');

// Mapeo manual de archivos problemáticos conocidos
const manualMappings = {
  "SESSION \\": "SESSION \"EL SENSEI\" EN VIVO POR PITI FERNÁNDEZ.clip.mp4",
  "Guaco - Pídeme ｜ Álbum El Sonido De Venezuela.clip.mp4": "Guaco - Pídeme ｜ Álbum El Sonido De Venezuela.clip.mp4",
  "Sandy & Papo  ♣   Es Hora de Bailar  (Vídeo Oficial).clip.mp4": "Sandy & Papo  ♣   Es Hora de Bailar  (Vídeo Oficial).clip.mp4",
  "Raffaella Carrà - Pedro (español) [Video Musical Restaurado] - Millemilioni Buenos Aires, 1980.clip.mp4": "Raffaella Carrà - Pedro (español) [Video Musical Restaurado] - Millemilioni Buenos Aires, 1980.clip.mp4",
  "Rica y apretadita - El General (Letra HD) ⧸ No me trates de engañar hmm.clip.mp4": "Rica y apretadita - El General (Letra HD) ⧸ No me trates de engañar hmm.clip.mp4",
  "Gusttavo Lima - Balada (Tchê Tchê Rere) [DVD Gusttavo Lima e Você - Ao Vivo].clip.mp4": "Gusttavo Lima - Balada (Tchê Tchê Rere) [DVD Gusttavo Lima e Você - Ao Vivo].clip.mp4"
};

let fixedCount = 0;
let notFoundCount = 0;
const notFound = [];

// Encontrar y reemplazar cada localFile
const regex = /"localFile":\s*"([^"\\]*(\\.[^"\\]*)*)"/g;
let match;
const matches = [];

while ((match = regex.exec(playlistContent)) !== null) {
  matches.push({
    fullMatch: match[0],
    fileName: match[1],
    index: match.index
  });
}

console.log('🔍 Verificando', matches.length, 'archivos...\n');

// Procesar en orden inverso para no afectar los índices
for (let i = matches.length - 1; i >= 0; i--) {
  const { fullMatch, fileName } = matches[i];

  // Verificar si el archivo existe
  if (physicalFiles.includes(fileName)) {
    // Ya está correcto
    continue;
  }

  // Buscar en mapeo manual
  let correctFile = manualMappings[fileName];

  if (!correctFile) {
    // Intentar buscar archivo similar
    const baseName = fileName.replace('.clip.mp4', '');
    correctFile = physicalFiles.find(f =>
      f.toLowerCase().includes(baseName.toLowerCase().substring(0, 20))
    );
  }

  if (correctFile && physicalFiles.includes(correctFile)) {
    // Reemplazar
    const newLocalFile = `"localFile": "${correctFile.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    playlistContent = playlistContent.replace(fullMatch, newLocalFile);
    console.log('✅ Corregido:', fileName);
    console.log('   → ', correctFile);
    fixedCount++;
  } else {
    console.log('❌ No encontrado:', fileName);
    notFound.push(fileName);
    notFoundCount++;
  }
}

console.log('\n📊 Resumen:');
console.log('   ✅ Archivos corregidos:', fixedCount);
console.log('   ❌ No encontrados:', notFoundCount);

if (fixedCount > 0) {
  // Guardar backup
  const backupPath = playlistPath + '.backup';
  fs.copyFileSync(playlistPath, backupPath);
  console.log('\n💾 Backup guardado en:', backupPath);

  // Guardar archivo actualizado
  fs.writeFileSync(playlistPath, playlistContent, 'utf8');
  console.log('✅ Archivo actualizado:', playlistPath);
} else {
  console.log('\n⚠️  No se realizaron cambios');
}

if (notFound.length > 0) {
  console.log('\n⚠️  Archivos que necesitan mapeo manual:');
  notFound.forEach(f => console.log('   -', f));
}
