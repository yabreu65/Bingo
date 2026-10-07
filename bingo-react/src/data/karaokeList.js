/**
 * BANCO DE CANCIONES PARA MODO KARAOKE
 *
 * Cada canción tiene:
 * - id: Identificador único
 * - title: Título de la canción
 * - artist: Artista
 * - genre: Género musical
 * - localFile: Nombre del archivo de video en public/music/karaoke/ (REQUERIDO)
 * - difficulty: Dificultad (easy, medium, hard)
 *
 * INSTRUCCIONES PARA AGREGAR VIDEOS:
 * 1. Consigue o descarga el video de karaoke en formato .mp4
 * 2. Guarda el archivo en: public/music/karaoke/
 * 3. Agrega el nombre del archivo en el campo 'localFile'
 * 4. El desafío durará todo el video (no hay límite de 30 segundos)
 *
 * EJEMPLO:
 * Si guardas el video como: public/music/karaoke/vivir-mi-vida.mp4
 * Entonces usa: localFile: "vivir-mi-vida.mp4"
 */

export const KARAOKE_SONGS = [
  // SALSA
  {
    id: 'karaoke-001',
    title: 'La Vida Es Un Carnaval',
    artist: 'Celia Cruz',
    genre: 'Salsa',
    localFile: 'la-vida-es-un-carnaval.mp4',
    difficulty: 'easy'
  },
  {
    id: 'karaoke-002',
    title: 'El Africano',
    artist: 'Wilfrido Vargas',
    genre: 'Salsa',
    localFile: 'el-africano.mp4',
    difficulty: 'easy'
  },

  // MERENGUE
  {
    id: 'karaoke-003',
    title: 'El Meneaito',
    artist: 'Gaby',
    genre: 'Merengue',
    localFile: 'el-meneaito.mp4',
    difficulty: 'easy'
  },
  {
    id: 'karaoke-004',
    title: 'Mayonesa',
    artist: 'Chocolate',
    genre: 'Merengue',
    localFile: 'mayonesa.mp4',
    difficulty: 'easy'
  },

  // POP LATINO
  {
    id: 'karaoke-005',
    title: 'Aserejé',
    artist: 'Las Ketchup',
    genre: 'Pop Latino',
    localFile: 'asereje.mp4',
    difficulty: 'easy'
  },
  {
    id: 'karaoke-006',
    title: 'Macarena',
    artist: 'Los del Río',
    genre: 'Pop Latino',
    localFile: 'macarena.mp4',
    difficulty: 'easy'
  },
  {
    id: 'karaoke-007',
    title: 'La Flaca',
    artist: 'Jarabe de Palo',
    genre: 'Pop Latino',
    localFile: 'la-flaca.mp4',
    difficulty: 'medium'
  },

  // ROCK/POP EN ESPAÑOL
  {
    id: 'karaoke-008',
    title: 'De Música Ligera',
    artist: 'Soda Stereo',
    genre: 'Rock',
    localFile: 'de-musica-ligera.mp4',
    difficulty: 'medium'
  },

  // RANCHERA/REGIONAL
  {
    id: 'karaoke-009',
    title: 'El Polvorete',
    artist: 'Vicente Fernández',
    genre: 'Ranchera',
    localFile: 'el-polvorete.mp4',
    difficulty: 'medium'
  },
  {
    id: 'karaoke-010',
    title: 'Caballo Viejo',
    artist: 'Simón Díaz',
    genre: 'Folklore',
    localFile: 'caballo-viejo.mp4',
    difficulty: 'easy'
  },

  // URBANO LATINO
  {
    id: 'karaoke-011',
    title: 'Veneka',
    artist: 'Rawayana & Akapellah',
    genre: 'Urbano',
    localFile: 'veneka.mp4',
    difficulty: 'medium'
  },

  // TRADICIONAL
  {
    id: 'karaoke-012',
    title: 'Colgando de un Hilito',
    artist: 'Traditional',
    genre: 'Tradicional',
    localFile: 'colgando-de-un-hilito.mp4',
    difficulty: 'easy'
  }
];

/**
 * Obtener una canción aleatoria de karaoke
 * @param {string} genre - Género opcional para filtrar
 * @returns {Object} Canción de karaoke
 */
export const getRandomKaraokeSong = (genre = null) => {
  let availableSongs = KARAOKE_SONGS;

  // Filtrar por género si se especifica
  if (genre) {
    availableSongs = KARAOKE_SONGS.filter(song =>
      song.genre.toLowerCase() === genre.toLowerCase()
    );
  }

  // Filtrar canciones que tengan archivo local
  const songsWithVideo = availableSongs.filter(song =>
    song.localFile !== null && song.localFile !== ''
  );

  // Si no hay canciones con video, usar todas las disponibles
  const finalSongs = songsWithVideo.length > 0 ? songsWithVideo : availableSongs;

  if (finalSongs.length === 0) {
    console.warn('⚠️ No hay canciones de karaoke disponibles');
    return null;
  }

  const randomIndex = Math.floor(Math.random() * finalSongs.length);
  return finalSongs[randomIndex];
};

/**
 * Obtener canciones por género
 * @param {string} genre - Género musical
 * @returns {Array} Array de canciones del género
 */
export const getKaraokeSongsByGenre = (genre) => {
  return KARAOKE_SONGS.filter(song =>
    song.genre.toLowerCase() === genre.toLowerCase()
  );
};

/**
 * Obtener canciones por dificultad
 * @param {string} difficulty - easy, medium, hard
 * @returns {Array} Array de canciones de esa dificultad
 */
export const getKaraokeSongsByDifficulty = (difficulty) => {
  return KARAOKE_SONGS.filter(song =>
    song.difficulty === difficulty
  );
};

/**
 * Obtener canción por ID
 * @param {string} id - ID de la canción
 * @returns {Object|null} Canción o null si no existe
 */
export const getKaraokeSongById = (id) => {
  return KARAOKE_SONGS.find(song => song.id === id) || null;
};

/**
 * Obtener todas las canciones de karaoke
 * @returns {Array} Array con todas las canciones
 */
export const getAllKaraokeSongs = () => {
  return KARAOKE_SONGS;
};

/**
 * Obtener géneros disponibles
 * @returns {Array} Array de géneros únicos
 */
export const getAvailableGenres = () => {
  const genres = [...new Set(KARAOKE_SONGS.map(song => song.genre))];
  return genres.filter(genre => genre !== '[Género]');
};

export default KARAOKE_SONGS;
