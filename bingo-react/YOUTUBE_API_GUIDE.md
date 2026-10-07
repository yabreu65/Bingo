# 🎬 Guía: YouTube en el Reproductor de Música

## ✅ OPCIÓN 1: SIN API KEY (Ya funciona - RECOMENDADO)

### Cómo funciona actualmente:

El reproductor usa **react-player** que reproduce videos de YouTube mediante **iframe embebido**. Esto es como cuando insertas un video de YouTube en un sitio web.

### ✨ Ventajas:

- ✅ **No necesitas API key**
- ✅ **Gratis e ilimitado**
- ✅ **Sin configuración adicional**
- ✅ **Ya funciona con las 20 canciones**
- ✅ **No hay límites de reproducción**

### 🎵 Las canciones ya están configuradas:

Archivo: `/src/data/christmasSongs.js`

```javascript
{
  id: 1,
  title: "All I Want for Christmas Is You",
  artist: "Mariah Carey",
  youtubeId: "yXQViqx6GMY",  // ← Solo necesitas este ID
  duration: 241,
  emoji: "🎄"
}
```

### 📝 Cómo agregar más canciones (SIN API KEY):

1. **Busca la canción en YouTube** (en tu navegador)
2. **Copia la URL** del video:
   ```
   https://www.youtube.com/watch?v=yXQViqx6GMY
                                   ^^^^^^^^^^^
                                   Este es el ID
   ```
3. **Agrega la canción** al archivo `christmasSongs.js`:
   ```javascript
   {
     id: 21,
     title: "Nombre de la Canción",
     artist: "Nombre del Artista",
     youtubeId: "yXQViqx6GMY",  // ← Pega el ID aquí
     duration: 180,  // Duración en segundos (aproximado)
     emoji: "🎄"     // Emoji que prefieras
   }
   ```
4. **Listo!** La canción se agregará automáticamente a la playlist

### ⚠️ Limitaciones de este método:

- ❌ No puedes buscar canciones desde la app
- ❌ Tienes que agregar canciones manualmente
- ❌ No puedes importar playlists de YouTube
- ✅ Pero es GRATIS y SIN LÍMITES

---

## 🔑 OPCIÓN 2: CON API KEY (Búsqueda Avanzada - OPCIONAL)

Solo necesitas API key si quieres funcionalidades avanzadas.

### 🎯 Qué obtienes con API key:

- ✅ Buscar canciones desde la app
- ✅ Importar playlists públicas de YouTube
- ✅ Ver thumbnails de videos
- ✅ Obtener información adicional (views, likes)

### ⚠️ Limitaciones de YouTube API:

- **Cuota diaria**: 10,000 unidades/día (gratis)
- **Búsqueda**: 100 unidades por búsqueda
- **Límite efectivo**: ~100 búsquedas por día
- **Costo**: GRATIS hasta 10,000 unidades/día

### 📋 Cómo obtener YouTube API Key:

#### Paso 1: Ir a Google Cloud Console

```
https://console.cloud.google.com
```

#### Paso 2: Crear un proyecto

1. Click en el selector de proyectos (arriba)
2. Click "Nuevo Proyecto"
3. Nombre: `Bingo Navideño`
4. Click "Crear"
5. Espera ~30 segundos

#### Paso 3: Habilitar YouTube Data API v3

1. En el menú lateral: **APIs y Servicios** → **Biblioteca**
2. Busca: `YouTube Data API v3`
3. Click en el resultado
4. Click **"HABILITAR"**
5. Espera que se active

#### Paso 4: Crear credenciales (API Key)

1. En el menú lateral: **APIs y Servicios** → **Credenciales**
2. Click **"+ CREAR CREDENCIALES"** (arriba)
3. Selecciona **"Clave de API"**
4. Se generará automáticamente
5. **COPIA LA API KEY** (ej: `AIzaSyC...`)

#### Paso 5: Restringir la API Key (Recomendado)

1. Click en la API key recién creada
2. En "Restricciones de API":
   - Selecciona "Restringir clave"
   - Marca solo: `YouTube Data API v3`
3. Click "GUARDAR"

#### Paso 6: Agregar al proyecto

Edita el archivo `.env` en `bingo-react/`:

```bash
# Backend URL
VITE_BACKEND_URL=http://localhost:5001

# YouTube API Key (Opcional para búsqueda)
VITE_YOUTUBE_API_KEY=AIzaSyC_TU_API_KEY_AQUI
```

⚠️ **IMPORTANTE**: Nunca subas `.env` a GitHub. Ya está en `.gitignore`.

#### Paso 7: Reiniciar el servidor

```bash
# Detén el servidor (Ctrl + C)
# Vuelve a iniciar
npm run dev
```

### 🔍 Usar el buscador (con API key):

El componente `YouTubeSearch` se habilitará automáticamente cuando detecte la API key.

```jsx
import YouTubeSearch from '../Music/YouTubeSearch';

<YouTubeSearch
  onSelectSong={(song) => {
    console.log('Canción seleccionada:', song);
    // Agregar a playlist, etc.
  }}
/>
```

---

## 📊 Comparación

| Característica | Sin API Key | Con API Key |
|----------------|-------------|-------------|
| Reproducir música | ✅ Sí | ✅ Sí |
| Gratis | ✅ Sí | ✅ Sí (10k/día) |
| Sin límites | ✅ Sí | ⚠️ 100 búsquedas/día |
| Buscar canciones | ❌ No | ✅ Sí |
| Importar playlists | ❌ No | ✅ Sí |
| Configuración | ✅ Ninguna | ⚠️ Obtener API key |
| Agregar canciones | 🔧 Manual | 🔍 Automático |

---

## 🎯 Recomendación

### Para este proyecto de Bingo:

**Opción 1 (Sin API key)** es SUFICIENTE porque:

- ✅ Ya tienes 20 canciones navideñas
- ✅ Es más simple y sin configuración
- ✅ No hay límites de reproducción
- ✅ Agregar canciones manualmente es rápido
- ✅ Los usuarios no necesitan buscar canciones

### Usa API key SOLO si:

- Quieres que los usuarios **busquen canciones** desde la app
- Necesitas **importar playlists** grandes de YouTube
- Quieres **información adicional** de los videos

---

## 🔧 Solución de Problemas

### La música no se reproduce:

1. ✅ Verifica que el `youtubeId` sea correcto
2. ✅ Abre el video en YouTube para confirmar que existe
3. ✅ Algunos videos pueden estar bloqueados por región
4. ✅ Videos con restricción de edad no funcionarán

### Error "Video unavailable":

- El video fue eliminado o es privado
- Está bloqueado en tu país
- Tiene restricciones de copyright para embebido
- **Solución**: Usa otro video de la misma canción

### API Key no funciona:

1. ✅ Verifica que YouTube Data API v3 esté habilitada
2. ✅ Confirma que la API key esté en `.env`
3. ✅ Reinicia el servidor dev (`npm run dev`)
4. ✅ Revisa la consola del navegador por errores
5. ✅ Verifica que no hayas excedido la cuota diaria

### Cuota excedida:

- Espera hasta mañana (se resetea a las 12am PST)
- O crea otro proyecto en Google Cloud
- O limita las búsquedas en la app

---

## 📱 Ejemplo: Agregar canción manualmente

```javascript
// 1. Busca en YouTube: "Rudolph the Red Nosed Reindeer"
// 2. URL del video: https://www.youtube.com/watch?v=3Ro1E_LEg6w
// 3. Copia el ID: 3Ro1E_LEg6w
// 4. Agrégalo a christmasSongs.js:

{
  id: 21,
  title: "Rudolph the Red-Nosed Reindeer",
  artist: "Gene Autry",
  youtubeId: "3Ro1E_LEg6w",
  duration: 142,
  emoji: "🦌"
}
```

---

## 🎁 Resumen

**No necesitas hacer nada adicional!**

El sistema ya funciona perfectamente sin API key. Solo necesitas API key si quieres búsqueda avanzada, que probablemente no necesites para un juego de bingo.

**¡Disfruta la música navideña!** 🎄🎅🎵
