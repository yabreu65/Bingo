const fs = require('fs');
const path = require('path');

// Leer archivos físicos
const musicDir = path.join(__dirname, 'public/music');
const physicalFiles = fs.readdirSync(musicDir);

// Crear un mapa de búsqueda (nombre normalizado -> nombre real)
const fileMap = new Map();
physicalFiles.forEach(file => {
  const normalized = file.normalize('NFC').toLowerCase();
  fileMap.set(normalized, file);
});

// Leer y actualizar musicPlaylists.js
const playlistPath = 'src/config/musicPlaylists.js';
let content = fs.readFileSync(playlistPath, 'utf8');

// Buscar todas las entradas localFile
const lines = content.split('\n');
let fixed = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const match = line.match(/"localFile":\s*"([^"]+)"/);

  if (match) {
    const currentFile = match[1];
    const normalized = currentFile.normalize('NFC').toLowerCase();

    // Buscar el archivo real
    const realFile = fileMap.get(normalized);

    if (realFile && realFile !== currentFile) {
      // Reemplazar con el nombre exacto del disco, escapando caracteres especiales de JavaScript
      const escaped = realFile
        .replace(/\\/g, '\\\\')  // Escapar backslashes
        .replace(/"/g, '\\"');   // Escapar comillas dobles

      lines[i] = line.replace(
        /"localFile":\s*"[^"]+"/,
        `"localFile": "${escaped}"`
      );

      console.log(`✅ ${i+1}: ${currentFile}`);
      console.log(`   → ${realFile}`);
      fixed++;
    } else if (!realFile) {
      // Archivo no encontrado, buscar uno similar
      const similar = physicalFiles.find(f => {
        const base1 = currentFile.substring(0, 30).toLowerCase();
        const base2 = f.substring(0, 30).toLowerCase();
        return base2.includes(base1) || base1.includes(base2);
      });

      if (similar) {
        const escaped = similar
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"');

        lines[i] = line.replace(
          /"localFile":\s*"[^"]+"/,
          `"localFile": "${escaped}"`
        );

        console.log(`🔄 ${i+1}: ${currentFile}`);
        console.log(`   → ${similar}`);
        fixed++;
      } else {
        console.log(`❌ ${i+1}: No se encontró: ${currentFile}`);
      }
    }
  }
}

console.log(`\n📊 Total corregidos: ${fixed}`);

if (fixed > 0) {
  // Guardar
  const newContent = lines.join('\n');
  fs.writeFileSync(playlistPath, newContent, 'utf8');
  console.log(`✅ Archivo actualizado: ${playlistPath}`);
}
