const axios = require('axios');

class DeezerService {
  constructor() {
    this.baseURL = 'https://api.deezer.com';
  }

  /**
   * Buscar canciones en Deezer
   * @param {string} query - Término de búsqueda (nombre canción, artista, etc.)
   * @param {number} limit - Número de resultados (default: 10)
   * @returns {Promise<Array>} Lista de canciones con previews
   */
  async searchTracks(query, limit = 10) {
    try {
      const response = await axios.get(`${this.baseURL}/search`, {
        params: {
          q: query,
          limit: limit
        }
      });

      return response.data.data.map(track => ({
        id: track.id,
        title: track.title,
        artist: track.artist.name,
        album: track.album.title,
        duration: track.duration,
        preview: track.preview, // URL del preview de 30 segundos
        cover: track.album.cover_medium,
        coverSmall: track.album.cover_small,
        coverBig: track.album.cover_big
      }));
    } catch (error) {
      console.error('Error searching Deezer:', error.message);
      throw new Error('Failed to search tracks on Deezer');
    }
  }

  /**
   * Obtener información de una canción específica
   * @param {string|number} trackId - ID de la canción en Deezer
   * @returns {Promise<Object>} Información de la canción
   */
  async getTrack(trackId) {
    try {
      console.log(`🎵 Deezer API: Fetching track ${trackId}...`);
      const response = await axios.get(`${this.baseURL}/track/${trackId}`);
      const track = response.data;

      // Verificar si Deezer devolvió un error
      if (track.error) {
        console.error(`❌ Deezer API error for track ${trackId}:`, track.error);
        throw new Error(`Deezer API error: ${track.error.message || track.error.type}`);
      }

      // Verificar que tenga preview
      if (!track.preview) {
        console.warn(`⚠️ Track ${trackId} (${track.title}) has no preview URL`);
      } else {
        console.log(`✅ Track ${trackId} loaded: ${track.title} by ${track.artist.name}`);
      }

      return {
        id: track.id,
        title: track.title,
        artist: track.artist.name,
        album: track.album.title,
        duration: track.duration,
        preview: track.preview, // URL del preview de 30 segundos
        cover: track.album.cover_medium,
        coverSmall: track.album.cover_small,
        coverBig: track.album.cover_big
      };
    } catch (error) {
      console.error(`❌ Error getting track ${trackId} from Deezer:`, error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw new Error(`Failed to get track ${trackId}: ${error.message}`);
    }
  }

  /**
   * Obtener múltiples canciones por sus IDs
   * @param {Array<string|number>} trackIds - Array de IDs de canciones
   * @returns {Promise<Array>} Lista de canciones
   */
  async getTracks(trackIds) {
    try {
      const promises = trackIds.map(id => this.getTrack(id));
      return await Promise.all(promises);
    } catch (error) {
      console.error('Error getting multiple tracks:', error.message);
      throw new Error('Failed to get tracks from Deezer');
    }
  }

  /**
   * Buscar canciones por género
   * @param {string} genre - Género musical (salsa, merengue, etc.)
   * @param {number} limit - Número de resultados
   * @returns {Promise<Array>} Lista de canciones del género
   */
  async searchByGenre(genre, limit = 20) {
    return await this.searchTracks(genre, limit);
  }
}

module.exports = new DeezerService();
