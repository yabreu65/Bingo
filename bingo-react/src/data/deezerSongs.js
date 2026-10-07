/**
 * Base de datos de canciones de Deezer para Challenges
 * Cada canción tiene 30 segundos de preview para los juegos
 *
 * Para encontrar IDs de Deezer:
 * 1. Busca en https://www.deezer.com/
 * 2. El ID está en la URL: https://www.deezer.com/track/XXXXXXX
 * 3. O usa la API: /api/deezer/search?query=nombre+cancion
 */

export const DEEZER_SONGS = {
  // CANCIONES PARA CHALLENGES DE BAILE
  dance: [
    {
      id: '3135556',
      title: 'Harder, Better, Faster, Stronger',
      artist: 'Daft Punk',
      genre: 'Electronic',
      challengeTypes: ['dance', 'robot']
    },
    {
      id: '555639',
      title: 'Thriller',
      artist: 'Michael Jackson',
      genre: 'Pop',
      challengeTypes: ['dance', 'zombie']
    },
    {
      id: '3129478',
      title: 'Uptown Funk',
      artist: 'Mark Ronson feat. Bruno Mars',
      genre: 'Funk',
      challengeTypes: ['dance', 'freestyle']
    },
    {
      id: '110351792',
      title: 'Despacito',
      artist: 'Luis Fonsi feat. Daddy Yankee',
      genre: 'Reggaeton',
      challengeTypes: ['dance', 'slow']
    }
  ],

  // CANCIONES PARA CHALLENGES DE SALSA
  salsa: [
    {
      id: '908438',
      title: 'Vivir Mi Vida',
      artist: 'Marc Anthony',
      genre: 'Salsa',
      challengeTypes: ['dance', 'salsa']
    },
    {
      id: '139577938',
      title: 'La Rebelión',
      artist: 'Joe Arroyo',
      genre: 'Salsa',
      challengeTypes: ['dance', 'salsa']
    },
    {
      id: '74964574',
      title: 'Llorarás',
      artist: 'Oscar D\'León',
      genre: 'Salsa',
      challengeTypes: ['dance', 'salsa']
    }
  ],

  // CANCIONES PARA CHALLENGES DE MERENGUE
  merengue: [
    {
      id: '563718',
      title: 'Suavemente',
      artist: 'Elvis Crespo',
      genre: 'Merengue',
      challengeTypes: ['dance', 'merengue']
    },
    {
      id: '140742420',
      title: 'El Tiburón',
      artist: 'Proyecto Uno',
      genre: 'Merengue',
      challengeTypes: ['dance', 'merengue']
    }
  ],

  // CANCIONES PARA CHALLENGES DE BACHATA
  bachata: [
    {
      id: '75543234',
      title: 'Obsesión',
      artist: 'Aventura',
      genre: 'Bachata',
      challengeTypes: ['dance', 'bachata', 'romantic']
    },
    {
      id: '908439',
      title: 'Propuesta Indecente',
      artist: 'Romeo Santos',
      genre: 'Bachata',
      challengeTypes: ['dance', 'bachata', 'romantic']
    }
  ],

  // CANCIONES PARA CHALLENGES DE REGGAETON
  reggaeton: [
    {
      id: '127728664',
      title: 'Gasolina',
      artist: 'Daddy Yankee',
      genre: 'Reggaeton',
      challengeTypes: ['dance', 'reggaeton', 'energetic']
    },
    {
      id: '640891182',
      title: 'Con Calma',
      artist: 'Daddy Yankee feat. Snow',
      genre: 'Reggaeton',
      challengeTypes: ['dance', 'reggaeton']
    },
    {
      id: '416647362',
      title: 'Mi Gente',
      artist: 'J Balvin, Willy William',
      genre: 'Reggaeton',
      challengeTypes: ['dance', 'reggaeton']
    }
  ],

  // CANCIONES PARA CHALLENGES DE CANTO
  sing: [
    {
      id: '555639',
      title: 'Thriller',
      artist: 'Michael Jackson',
      genre: 'Pop',
      challengeTypes: ['sing', 'iconic']
    },
    {
      id: '13159667',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      genre: 'Rock',
      challengeTypes: ['sing', 'epic']
    },
    {
      id: '903613',
      title: 'I Will Survive',
      artist: 'Gloria Gaynor',
      genre: 'Disco',
      challengeTypes: ['sing', 'disco']
    },
    {
      id: '908438',
      title: 'Vivir Mi Vida',
      artist: 'Marc Anthony',
      genre: 'Salsa',
      challengeTypes: ['sing', 'latin']
    }
  ],

  // CANCIONES NAVIDEÑAS
  christmas: [
    {
      id: '565225',
      title: 'All I Want for Christmas Is You',
      artist: 'Mariah Carey',
      genre: 'Christmas',
      challengeTypes: ['sing', 'christmas']
    },
    {
      id: '535734',
      title: 'Last Christmas',
      artist: 'Wham!',
      genre: 'Christmas',
      challengeTypes: ['sing', 'christmas']
    },
    {
      id: '823838',
      title: 'Feliz Navidad',
      artist: 'José Feliciano',
      genre: 'Christmas',
      challengeTypes: ['sing', 'christmas', 'latin']
    }
  ]
};

/**
 * Obtener una canción aleatoria para un tipo de challenge
 * @param {string} challengeType - Tipo de challenge (dance, sing, salsa, etc.)
 * @returns {Object|null} Canción aleatoria o null
 */
export const getRandomSongForChallenge = (challengeType) => {
  // Buscar en todas las categorías
  const allSongs = Object.values(DEEZER_SONGS).flat();

  // Filtrar canciones que coincidan con el tipo de challenge
  const matchingSongs = allSongs.filter(song =>
    song.challengeTypes.includes(challengeType)
  );

  if (matchingSongs.length === 0) {
    // Si no hay coincidencias específicas, usar canciones de baile genéricas
    return allSongs[Math.floor(Math.random() * allSongs.length)];
  }

  // Retornar canción aleatoria
  return matchingSongs[Math.floor(Math.random() * matchingSongs.length)];
};

/**
 * Obtener canciones por género musical
 * @param {string} genre - Género musical (salsa, merengue, bachata, reggaeton, christmas)
 * @returns {Array} Array de canciones del género
 */
export const getSongsByGenre = (genre) => {
  return DEEZER_SONGS[genre] || [];
};

/**
 * Obtener todas las canciones disponibles
 * @returns {Array} Array con todas las canciones
 */
export const getAllDeezerSongs = () => {
  return Object.values(DEEZER_SONGS).flat();
};

/**
 * Construir URL del preview de Deezer
 * NOTA: La URL del preview se obtiene desde la API, pero se puede construir manualmente
 * @param {string} trackId - ID de la canción en Deezer
 * @returns {string} URL del preview (debe obtenerse de la API)
 */
export const getDeezerPreviewUrl = async (trackId) => {
  try {
    // Llamar a tu backend que usa el servicio de Deezer
    const response = await fetch(`http://localhost:5001/api/deezer/track/${trackId}`);
    const data = await response.json();
    return data.track.preview;
  } catch (error) {
    console.error('Error getting Deezer preview:', error);
    return null;
  }
};

export default DEEZER_SONGS;
