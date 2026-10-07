// Playlist de canciones navideñas con IDs de YouTube
export const christmasSongs = [
  {
    id: 1,
    title: "All I Want for Christmas Is You",
    artist: "Mariah Carey",
    youtubeId: "yXQViqx6GMY",
    duration: 241,
    emoji: "🎄"
  },
  {
    id: 2,
    title: "Last Christmas",
    artist: "Wham!",
    youtubeId: "E8gmARGvPlI",
    duration: 263,
    emoji: "❄️"
  },
  {
    id: 3,
    title: "Feliz Navidad",
    artist: "José Feliciano",
    youtubeId: "N8NcQzMQN_U",
    duration: 189,
    emoji: "🎅"
  },
  {
    id: 4,
    title: "Jingle Bell Rock",
    artist: "Bobby Helms",
    youtubeId: "Z0ajuTaHBtM",
    duration: 128,
    emoji: "🔔"
  },
  {
    id: 5,
    title: "Rockin' Around The Christmas Tree",
    artist: "Brenda Lee",
    youtubeId: "1qYz7rfgLWE",
    duration: 124,
    emoji: "🌲"
  },
  {
    id: 6,
    title: "White Christmas",
    artist: "Bing Crosby",
    youtubeId: "w9QLn7gM-hY",
    duration: 186,
    emoji: "⛄"
  },
  {
    id: 7,
    title: "Santa Claus Is Coming to Town",
    artist: "Michael Bublé",
    youtubeId: "V2C6s83TjEM",
    duration: 194,
    emoji: "🎁"
  },
  {
    id: 8,
    title: "Wonderful Christmastime",
    artist: "Paul McCartney",
    youtubeId: "94Ye-3C1FC8",
    duration: 236,
    emoji: "✨"
  },
  {
    id: 9,
    title: "It's Beginning to Look a Lot Like Christmas",
    artist: "Michael Bublé",
    youtubeId: "rLspLsD1870",
    duration: 155,
    emoji: "🌟"
  },
  {
    id: 10,
    title: "Let It Snow! Let It Snow! Let It Snow!",
    artist: "Dean Martin",
    youtubeId: "mN7LW0Y00kE",
    duration: 112,
    emoji: "❄️"
  },
  {
    id: 11,
    title: "Jingle Bells",
    artist: "Frank Sinatra",
    youtubeId: "k-ARuoSI0cE",
    duration: 134,
    emoji: "🔔"
  },
  {
    id: 12,
    title: "Mistletoe",
    artist: "Justin Bieber",
    youtubeId: "LUjTa1jS8qQ",
    duration: 190,
    emoji: "💚"
  },
  {
    id: 13,
    title: "The Christmas Song",
    artist: "Nat King Cole",
    youtubeId: "hwacxSnc4tI",
    duration: 189,
    emoji: "🔥"
  },
  {
    id: 14,
    title: "Santa Tell Me",
    artist: "Ariana Grande",
    youtubeId: "nlR0MkrRklg",
    duration: 188,
    emoji: "🎅"
  },
  {
    id: 15,
    title: "Underneath the Tree",
    artist: "Kelly Clarkson",
    youtubeId: "YfF3OLIl5EA",
    duration: 230,
    emoji: "🌲"
  },
  {
    id: 16,
    title: "Happy Xmas (War Is Over)",
    artist: "John Lennon",
    youtubeId: "flA5ndOyZbI",
    duration: 211,
    emoji: "☮️"
  },
  {
    id: 17,
    title: "Sleigh Ride",
    artist: "The Ronettes",
    youtubeId: "FsiL35T46kU",
    duration: 152,
    emoji: "🛷"
  },
  {
    id: 18,
    title: "Holly Jolly Christmas",
    artist: "Burl Ives",
    youtubeId: "V5rNn7sdI6g",
    duration: 142,
    emoji: "🎄"
  },
  {
    id: 19,
    title: "Winter Wonderland",
    artist: "Ella Fitzgerald",
    youtubeId: "CIyvtS9K0rc",
    duration: 145,
    emoji: "⛄"
  },
  {
    id: 20,
    title: "Christmas (Baby Please Come Home)",
    artist: "Darlene Love",
    youtubeId: "UV8x7H3DD8Y",
    duration: 168,
    emoji: "🎁"
  }
];

// Función para obtener una canción aleatoria
export const getRandomSong = () => {
  const randomIndex = Math.floor(Math.random() * christmasSongs.length);
  return christmasSongs[randomIndex];
};

// Función para crear una playlist aleatoria
export const createRandomPlaylist = (count = 10) => {
  const shuffled = [...christmasSongs].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

// Función para buscar canciones por título o artista
export const searchSongs = (query) => {
  const lowerQuery = query.toLowerCase();
  return christmasSongs.filter(song =>
    song.title.toLowerCase().includes(lowerQuery) ||
    song.artist.toLowerCase().includes(lowerQuery)
  );
};
