# 🎵 Guía del Sistema de Música Navideña

## 📍 Dónde está el reproductor

El reproductor de música está integrado automáticamente en **todas** las pantallas:

### ✅ Pantallas con música:

1. **Pantalla de Registro** (`/src/components/Registration/RegistrationScreen.jsx`)
   - Música mientras registras jugadores (modo single player)

2. **Sala de Espera** (`/src/components/Room/WaitingRoom.jsx`)
   - Música mientras esperas que se unan jugadores (modo multiplayer)

3. **Pantalla de Juego** (`/src/components/Game/GameScreen.jsx`)
   - Música durante el juego activo

## 🎮 Cómo usar el reproductor

### Botón Flotante
- Verás un botón **🎵** en la esquina inferior derecha
- Haz clic para **expandir/contraer** el reproductor

### Controles disponibles:
- **⏮️ Anterior** - Canción anterior
- **▶️/⏸️ Play/Pause** - Reproducir/Pausar
- **⏭️ Siguiente** - Siguiente canción
- **🔊 Volumen** - Control deslizante de volumen
- **🔇 Silenciar** - Activar/desactivar sonido
- **🔀 Aleatorio** - Regenerar playlist aleatoria
- **📋 Playlist** - Ver lista completa de canciones

## 📝 Cómo agregar más canciones

### Archivo de canciones: `/src/data/christmasSongs.js`

```javascript
{
  id: 21,  // Número único incremental
  title: "Nombre de la Canción",
  artist: "Nombre del Artista",
  youtubeId: "CODIGO_YOUTUBE",  // El código después de watch?v=
  duration: 180,  // Duración en segundos
  emoji: "🎄"  // Emoji representativo
}
```

### Ejemplo de cómo obtener el youtubeId:

1. Busca la canción en YouTube
2. Copia la URL: `https://www.youtube.com/watch?v=yXQViqx6GMY`
3. El `youtubeId` es: `yXQViqx6GMY` (lo que está después de `v=`)

### Ejemplo de canción nueva:

```javascript
{
  id: 21,
  title: "Frosty the Snowman",
  artist: "Gene Autry",
  youtubeId: "fM5fJeJf-IM",
  duration: 135,
  emoji: "⛄"
}
```

## 🔧 Configuración del reproductor

### Parámetros disponibles:

```jsx
<MusicPlayer
  autoPlay={true}              // Reproducción automática (true/false)
  syncMode={false}             // Modo sincronizado para multiplayer
  currentSongId={null}         // ID de canción actual (para sync)
  onSongChange={(song) => {}}  // Callback cuando cambia la canción
/>
```

## 🌐 Modo Sincronizado (Multiplayer)

Para sincronizar la música entre todos los jugadores:

```jsx
<MusicPlayer
  autoPlay={true}
  syncMode={true}                    // Activar sincronización
  currentSongId={room.currentSongId} // ID desde el servidor
/>
```

**Nota**: En modo sincronizado, solo el anfitrión puede controlar la música.

## 🎨 Personalizar estilos

Los estilos están en: `/src/components/Music/MusicPlayer.css`

### Cambiar color del botón flotante:
```css
.music-toggle-btn {
  background: linear-gradient(135deg, #TU_COLOR_1, #TU_COLOR_2);
}
```

### Cambiar posición del botón:
```css
.music-toggle-btn {
  bottom: 20px;  /* Distancia desde abajo */
  right: 20px;   /* Distancia desde la derecha */
}
```

## 🔊 Playlist Actual (20 canciones)

1. 🎄 All I Want for Christmas Is You - Mariah Carey
2. ❄️ Last Christmas - Wham!
3. 🎅 Feliz Navidad - José Feliciano
4. 🔔 Jingle Bell Rock - Bobby Helms
5. 🌲 Rockin' Around The Christmas Tree - Brenda Lee
6. ⛄ White Christmas - Bing Crosby
7. 🎁 Santa Claus Is Coming to Town - Michael Bublé
8. ✨ Wonderful Christmastime - Paul McCartney
9. 🌟 It's Beginning to Look a Lot Like Christmas - Michael Bublé
10. ❄️ Let It Snow! - Dean Martin
11. 🔔 Jingle Bells - Frank Sinatra
12. 💚 Mistletoe - Justin Bieber
13. 🔥 The Christmas Song - Nat King Cole
14. 🎅 Santa Tell Me - Ariana Grande
15. 🌲 Underneath the Tree - Kelly Clarkson
16. ☮️ Happy Xmas (War Is Over) - John Lennon
17. 🛷 Sleigh Ride - The Ronettes
18. 🎄 Holly Jolly Christmas - Burl Ives
19. ⛄ Winter Wonderland - Ella Fitzgerald
20. 🎁 Christmas (Baby Please Come Home) - Darlene Love

## 📦 Dependencias

- `react-player` - Reproductor de YouTube integrado
- No necesita API key de YouTube
- No requiere autenticación
- Funciona offline con IDs válidos

## 🚀 Próximas mejoras

- [ ] Sincronización en tiempo real entre jugadores
- [ ] Integración con Spotify OAuth (opcional)
- [ ] Controles de ecualizador
- [ ] Modo karaoke con letras
- [ ] Votación para siguiente canción
- [ ] Historia de reproducción
- [ ] Favoritos personalizados

## 💡 Tips

- El reproductor usa YouTube de forma embebida (sin anuncios)
- La música continúa entre transiciones de pantalla
- Puedes controlar el volumen independientemente del sistema
- El shuffle crea una nueva playlist aleatoria cada vez
- Las canciones avanzan automáticamente

## ❓ Problemas comunes

**No se reproduce el audio:**
- Verifica que el botón no esté en pausa (⏸️)
- Revisa el volumen del slider
- Asegúrate de que no esté silenciado (🔇)

**Video no carga:**
- Verifica tu conexión a internet
- Comprueba que el `youtubeId` sea válido
- Algunos videos pueden estar bloqueados en tu región

**Botón flotante no aparece:**
- Asegúrate de estar en una pantalla con `<MusicPlayer />`
- Revisa la consola del navegador por errores

---

¡Disfruta la música navideña! 🎄🎅🎵
