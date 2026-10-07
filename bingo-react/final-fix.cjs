const fs = require('fs');

const replacements = [
  {
    old: 'Diavolo   Liz & Los Melodicos avi   YouTube.clip.mp4',
    new: 'Diavolo Liz & Los Melodicos avi YouTube.clip.mp4'
  },
  {
    old: 'Don Omar ｜ Dile (Video Oficial ).clip.mp4',
    new: 'Don Omar - Dile (Video Oficial ).clip.mp4'
  },
  {
    old: 'Guaco - Pídeme ｜ Álbum El Sonido De Venezuela.clip.mp4',
    new: 'Guaco - Pídeme - Álbum El Sonido De Venezuela.clip.mp4'
  },
  {
    old: 'Guayabo Zarandiao ｜ Emily Galaviz ｜ SUBTITULADO.clip.mp4',
    new: 'Guayabo Zarandiao - Emily Galaviz - SUBTITULADO.clip.mp4'
  },
  {
    old: 'Mach & Daddy   Pásame La Botella  4k 60fps.clip.mp4',
    new: 'Mach & Daddy Pásame La Botella 4k 60fps.clip.mp4'
  },
  {
    old: 'PURO DEDESO DE AMAR -  (Video Oficial) - Daiquiri.clip.mp4',
    new: 'PURO DEDESO DE AMAR - (Video Oficial) - Daiquiri.clip.mp4'
  },
  {
    old: 'SESSION \\\\\"EL SENSEI\\\\\" EN VIVO POR PITI FERNÁNDEZ.clip.mp4',
    new: 'SESSION "EL SENSEI" EN VIVO POR PITI FERNÁNDEZ.clip.mp4'
  },
  {
    old: 'Sandy & Papo  ♣   Es Hora de Bailar  (Vídeo Oficial).clip.mp4',
    new: 'Sandy & Papo - Es Hora de Bailar (Vídeo Oficial).clip.mp4'
  },
  {
    old: 'Tambor Urbano  Remix Tambores I Son De MI Tierra  Primera Temporada.clip.mp4',
    new: 'Tambor Urbano Remix Tambores I Son De MI Tierra Primera Temporada.clip.mp4'
  }
];

let content = fs.readFileSync('src/config/musicPlaylists.js', 'utf8');

replacements.forEach(({old, new: newName}) => {
  if (content.includes(old)) {
    content = content.replace(old, newName);
    console.log('✅', old);
    console.log('  →', newName);
  }
});

fs.writeFileSync('src/config/musicPlaylists.js', content, 'utf8');
console.log('\n✅ Archivo actualizado');
