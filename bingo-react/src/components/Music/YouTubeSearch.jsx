import { useState } from 'react';
import './YouTubeSearch.css';

/**
 * Componente OPCIONAL de búsqueda de YouTube
 * Requiere VITE_YOUTUBE_API_KEY en .env
 * Si no hay API key, no se mostrará este componente
 */
const YouTubeSearch = ({ onSelectSong }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

  // Si no hay API key, no mostrar el componente
  if (!API_KEY) {
    return null;
  }

  const searchYouTube = async (e) => {
    e.preventDefault();

    if (!query.trim()) {
      setError('Por favor ingresa un término de búsqueda');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&` +
        `q=${encodeURIComponent(query + ' christmas song')}&` +
        `type=video&` +
        `videoCategoryId=10&` + // Música
        `maxResults=10&` +
        `key=${API_KEY}`
      );

      if (!response.ok) {
        throw new Error('Error al buscar en YouTube');
      }

      const data = await response.json();

      const formattedResults = data.items.map(item => ({
        id: Math.random(), // ID temporal
        title: item.snippet.title,
        artist: item.snippet.channelTitle,
        youtubeId: item.id.videoId,
        thumbnail: item.snippet.thumbnails.default.url,
        duration: 0, // Se podría obtener con otra llamada a la API
        emoji: '🎵'
      }));

      setResults(formattedResults);
    } catch (err) {
      console.error('YouTube search error:', err);
      setError('Error al buscar. Verifica tu API key.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (song) => {
    if (onSelectSong) {
      onSelectSong(song);
    }
    setResults([]);
    setQuery('');
  };

  return (
    <div className="youtube-search">
      <h4>🔍 Buscar Canciones en YouTube</h4>

      <form onSubmit={searchYouTube} className="search-form">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar canción navideña..."
          className="search-input"
        />
        <button type="submit" className="search-btn" disabled={loading}>
          {loading ? '⏳' : '🔍'}
        </button>
      </form>

      {error && <div className="search-error">{error}</div>}

      {results.length > 0 && (
        <div className="search-results">
          {results.map((song, index) => (
            <div
              key={index}
              className="search-result-item"
              onClick={() => handleSelect(song)}
            >
              <img src={song.thumbnail} alt={song.title} />
              <div className="result-info">
                <div className="result-title">{song.title}</div>
                <div className="result-artist">{song.artist}</div>
              </div>
              <button className="add-btn">+ Agregar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default YouTubeSearch;
