const fs = require('fs');
const path = require('path');

const musicDir = path.join(__dirname, 'public/music');
const files = fs.readdirSync(musicDir);

const mappings = [];

console.log('🧹 Limpiando nombres de archivos...\n');

files.forEach(oldName => {
  // Limpiar caracteres especiales problemáticos
  let newName = oldName
    .replace(/"/g, '')  // Eliminar comillas dobles
    .replace(/♣/g, '-')  // Reemplazar símbolos especiales
    .replace(/｜/g, '-')  // Reemplazar pipe japonés
    .replace(/⧸/g, '-')  // Reemplazar barra especial
    .replace(/\\/g, '-')  // Reemplazar backslash
    .replace(/\s+/g, ' ')  // Normalizar espacios múltiples
    .replace(/\s+-\s+/g, ' - ')  // Normalizar guiones con espacios
    .trim();

  if (newName !== oldName) {
    const oldPath = path.join(musicDir, oldName);
    const newPath = path.join(musicDir, newName);

    try {
      fs.renameSync(oldPath, newPath);
      console.log('✅', oldName);
      console.log('  →', newName);
      mappings.push({ old: oldName, new: newName });
    } catch (err) {
      console.error('❌ Error renombrando:', oldName, err.message);
    }
  }
});

console.log(`\n📊 Total archivos renombrados: ${mappings.length}`);

// Guardar mapeo para actualizar musicPlaylists.js
fs.writeFileSync('rename-mappings.json', JSON.stringify(mappings, null, 2));
console.log('💾 Mapeo guardado en: rename-mappings.json');
