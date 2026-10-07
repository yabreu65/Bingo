# Integración de Deezer en Bingo Bailable

## 📝 Descripción

Se ha integrado Deezer API para reproducir previews de 30 segundos en los challenges de baile y canto del juego.

## ✅ ¿Qué se ha implementado?

### Backend
- **Servicio de Deezer** (`backend/services/deezerService.js`)
  - Búsqueda de canciones
  - Obtener información de tracks específicos
  - Obtener previews de 30 segundos

- **API Routes** (`backend/routes/deezerRoutes.js`)
  - `GET /api/deezer/search?query=nombre&limit=10` - Buscar canciones
  - `GET /api/deezer/track/:id` - Obtener información de un track
  - `GET /api/deezer/genre/:genre?limit=20` - Buscar por género

### Frontend
- **Componente DeezerPlayer** (`bingo-react/src/components/Music/DeezerPlayer.jsx`)
  - Reproductor de previews de 30 segundos
  - Controles de play/pause
  - Control de volumen
  - Muestra portada del álbum
  - Auto-play opcional

- **Base de datos de canciones** (`bingo-react/src/data/deezerSongs.js`)
  - Canciones organizadas por tipo de challenge
  - Géneros: Salsa, Merengue, Bachata, Reggaeton, Pop, Christmas
  - Función para obtener canciones aleatorias según el tipo de challenge

- **Integración con Challenges** (`bingo-react/src/components/Challenges/ChallengeModal.jsx`)
  - Los challenges de baile y canto ahora reproducen automáticamente una canción de Deezer
  - La canción se selecciona aleatoriamente según el tipo de challenge

## 🎵 ¿Cómo funciona?

1. Cuando aparece un challenge de **baile** o **canto**:
   - Se selecciona automáticamente una canción apropiada de Deezer
   - El preview de 30 segundos se reproduce automáticamente
   - El jugador puede controlar el volumen

2. **Preview de 30 segundos**:
   - Deezer ofrece previews gratuitos de 30 segundos
   - No requiere autenticación de usuario
   - Perfecto para la duración de los challenges

## 🔧 Uso

### Para agregar más canciones:

1. Busca la canción en Deezer:
   ```bash
   curl "http://localhost:5001/api/deezer/search?query=nombre+cancion"
   ```

2. Copia el `id` de la respuesta

3. Agrégala en `bingo-react/src/data/deezerSongs.js`:
   ```javascript
   {
     id: '555639',
     title: 'Thriller',
     artist: 'Michael Jackson',
     genre: 'Pop',
     challengeTypes: ['dance', 'zombie', 'sing']
   }
   ```

### Para usar el componente DeezerPlayer en otros lugares:

```jsx
import DeezerPlayer from './components/Music/DeezerPlayer';

<DeezerPlayer
  trackId="555639"  // ID de la canción en Deezer
  autoPlay={true}   // Reproducir automáticamente
  showControls={true}  // Mostrar controles
/>
```

## 🧪 Testing

### Probar el backend:
```bash
# Obtener información de Thriller
curl "http://localhost:5001/api/deezer/track/555639"

# Buscar canciones de salsa
curl "http://localhost:5001/api/deezer/search?query=salsa&limit=5"

# Buscar por género
curl "http://localhost:5001/api/deezer/genre/merengue?limit=10"
```

### Probar el frontend:
1. Inicia el juego en modo single player
2. Espera a que aparezca un challenge de baile o canto
3. El reproductor de Deezer debería aparecer automáticamente
4. Verifica que:
   - ✅ El audio se reproduce
   - ✅ Se muestra la portada del álbum
   - ✅ Los controles funcionan
   - ✅ El timer del challenge funciona correctamente

## 📊 Base de datos actual

### Canciones disponibles:
- **Baile**: 4 canciones (Daft Punk, Michael Jackson, Bruno Mars, Luis Fonsi)
- **Salsa**: 3 canciones (Marc Anthony, Joe Arroyo, Oscar D'León)
- **Merengue**: 2 canciones (Elvis Crespo, Proyecto Uno)
- **Bachata**: 2 canciones (Aventura, Romeo Santos)
- **Reggaeton**: 3 canciones (Daddy Yankee, J Balvin)
- **Canto**: 4 canciones (Michael Jackson, Queen, Gloria Gaynor, Marc Anthony)
- **Navidad**: 3 canciones (Mariah Carey, Wham!, José Feliciano)

**Total**: ~20 canciones con previews de 30 segundos

## 💡 Ventajas de usar Deezer

1. **Gratis**: Los previews son gratuitos
2. **Legal**: Uso autorizado por Deezer API
3. **Sin autenticación**: No requiere login de usuarios
4. **30 segundos**: Duración perfecta para challenges
5. **Alta calidad**: Audio de buena calidad
6. **Gran catálogo**: Millones de canciones disponibles
7. **Estable**: API confiable de Deezer

## 🚀 Próximos pasos (opcional)

- Agregar más canciones a la base de datos
- Implementar caché de previews para mejor performance
- Agregar opción para que el organizador seleccione la canción
- Integrar con Spotify como alternativa/fallback
- Permitir playlists personalizadas

## 📝 Notas

- Los previews de Deezer son de 30 segundos máximo
- No se pueden descargar los archivos (solo streaming)
- Requiere conexión a internet
- La URL del preview expira después de un tiempo (se regenera automáticamente)

## 🎯 Conclusión

La integración está completa y funcionando. Los challenges de baile y canto ahora tienen música de fondo de Deezer con previews de 30 segundos, mejorando significativamente la experiencia del juego.
