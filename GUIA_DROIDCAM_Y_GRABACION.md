# Guía de Configuración DroidCam y Sistema de Grabación

## Sistema de Grabación Selectiva para Karaoke y Bailes

Esta guía te ayudará a configurar DroidCam para usar tu teléfono como cámara web y grabar solo las actuaciones de karaoke y baile.

---

## Parte 1: Configuración de DroidCam

### Requisitos:
- Teléfono Android o iPhone
- Laptop con WiFi o cable USB
- Ambos dispositivos en la misma red WiFi (para conexión inalámbrica)

### Paso 1: Instalar DroidCam en tu Teléfono

#### Para Android:
1. Abre Google Play Store
2. Busca "DroidCam Webcam"
3. Descarga la app desarrollada por "Dev47Apps"
4. Instala y abre la aplicación

#### Para iPhone:
1. Abre App Store
2. Busca "DroidCam Webcam OBS"
3. Descarga e instala
4. Abre la aplicación

### Paso 2: Instalar DroidCam Client en tu Laptop

#### Para Windows:
1. Ve a: https://www.dev47apps.com/droidcam/windows/
2. Descarga "DroidCam Client"
3. Ejecuta el instalador
4. Sigue las instrucciones de instalación

#### Para Mac:
1. Ve a: https://www.dev47apps.com/droidcam/macos/
2. Descarga "DroidCam Client for macOS"
3. Instala siguiendo las instrucciones

#### Para Linux:
```bash
cd /tmp/
wget -O droidcam_latest.zip https://files.dev47apps.net/linux/droidcam_1.8.2.zip
unzip droidcam_latest.zip -d droidcam
cd droidcam && sudo ./install-client
```

### Paso 3: Conectar DroidCam

#### Opción A: Conexión por WiFi (Recomendado)

1. **En tu teléfono:**
   - Abre DroidCam
   - Verás una dirección IP (ejemplo: 192.168.1.100)
   - Verás un puerto (ejemplo: 4747)
   - Mantén la app abierta

2. **En tu laptop:**
   - Abre DroidCam Client
   - Selecciona "WiFi / LAN"
   - Ingresa la IP y puerto que aparecen en tu teléfono
   - Marca "Video" y "Audio"
   - Click en "Start"

3. **Verificar conexión:**
   - Deberías ver la imagen de tu teléfono en DroidCam Client
   - Si no funciona, verifica que ambos estén en la misma red WiFi

#### Opción B: Conexión por USB (Más estable)

1. **En tu teléfono:**
   - Conecta el cable USB a tu laptop
   - Activa "Depuración USB" en configuración de desarrollador
   - Abre DroidCam

2. **En tu laptop:**
   - Abre DroidCam Client
   - Selecciona "USB"
   - Marca "Video" y "Audio"
   - Click en "Start"

### Paso 4: Verificar que Funciona en el Navegador

1. Abre Chrome o Edge
2. Ve a: https://webcamtests.com/
3. Click en "Test my cam"
4. Deberías ver la cámara de tu teléfono como opción
5. Selecciona "DroidCam Source"
6. Si ves la imagen, está funcionando correctamente

---

## Parte 2: Sistema de Grabación Implementado

### Características:

- **Grabación Selectiva:** Solo graba karaoke y bailes (NO trivia, sing ni group)
- **Duración:** 30 segundos automáticos
- **Calidad:** 720p, 2.5 Mbps
- **Formato:** WebM (compatible con todos los navegadores modernos)
- **Almacenamiento:** Videos guardados en el servidor
- **Galería:** Ver todas las grabaciones después del juego

### Cómo Funciona:

```
1. Jugador obtiene challenge de karaoke o baile
        ↓
2. Aparece ChallengeModal con botón "Iniciar Grabación"
        ↓
3. Jugador permite acceso a cámara (primera vez)
        ↓
4. Se selecciona automáticamente DroidCam como cámara
        ↓
5. Jugador hace clic en "Empezar a Grabar"
        ↓
6. Graba 30 segundos automáticamente
        ↓
7. Video se sube al servidor automáticamente
        ↓
8. Se puede reproducir desde la galería
```

### Archivos Implementados:

1. **Frontend:**
   - `/bingo-react/src/components/Recording/RecordingChallenge.jsx`
   - `/bingo-react/src/components/Recording/RecordingChallenge.css`
   - `/bingo-react/src/components/Recording/RecordingsGallery.jsx`

2. **Backend:**
   - `/backend/models/Recording.js`
   - `/backend/routes/recordings.js`
   - `/backend/uploads/recordings/` (carpeta para videos)

3. **Integración:**
   - Modificado: `/bingo-react/src/components/Challenges/ChallengeModal.jsx`

---

## Parte 3: Uso del Sistema de Grabación

### Para el Jugador:

1. **Cuando aparece un challenge de karaoke o baile:**
   - Verás el botón "Iniciar Grabación" junto al challenge
   - Posiciona tu teléfono/cámara para que te enfoque bien

2. **Primera vez usando grabación:**
   - El navegador pedirá permiso para usar cámara y micrófono
   - Click en "Permitir"
   - Selecciona "DroidCam Source" si hay múltiples cámaras

3. **Grabar la actuación:**
   - Click en "Empezar a Grabar"
   - Cuenta regresiva de 3 segundos
   - Realiza tu actuación (30 segundos)
   - La grabación se detiene automáticamente
   - El video se sube al servidor

4. **Ver tus grabaciones:**
   - Al final del juego, aparecerá "Ver Grabaciones"
   - Puedes reproducir, descargar o eliminar tus videos

### Para el Organizador:

- Todas las grabaciones quedan guardadas en el servidor
- Puedes acceder a la galería completa del juego
- Los videos se pueden descargar para compartir después

---

## Parte 4: Solución de Problemas

### "No aparece la opción de grabar"
- Verifica que el challenge sea de tipo karaoke o dance
- Trivia, sing y group NO activan grabación

### "La cámara no funciona"
- Verifica que DroidCam Client esté abierto y conectado
- Verifica que el navegador tenga permisos de cámara
- Prueba en https://webcamtests.com/ primero

### "El video no se graba"
- Verifica que tengas espacio en disco
- Verifica que el navegador sea Chrome, Edge o Firefox
- Safari puede tener limitaciones con WebM

### "La calidad del video es mala"
- Verifica buena iluminación en la habitación
- Acerca más el teléfono al performer
- Usa conexión USB en lugar de WiFi para mejor estabilidad

### "La conexión WiFi se corta"
- Cambia a conexión USB (más estable)
- Verifica que nadie esté descargando/usando mucho internet
- Acerca el teléfono al router WiFi

### "No veo DroidCam como opción de cámara"
- Reinicia DroidCam Client en la laptop
- Reconecta el teléfono
- Reinicia el navegador
- Verifica que DroidCam Client muestre "Connected"

---

## Parte 5: Consejos para Mejores Grabaciones

### Posicionamiento de la Cámara:
- Coloca el teléfono a 1-2 metros del performer
- Altura: A nivel del pecho o cara
- Ángulo: Ligeramente hacia arriba (más favorecedor)
- Estable: Usa un tripié o soporte para teléfono

### Iluminación:
- Luz frontal (nunca de espaldas)
- Evita ventanas atrás del performer (contraluces)
- Luz natural es mejor que artificial
- Si es de noche, usa 2-3 lámparas frontales

### Audio:
- Mantén el teléfono cerca (máximo 2 metros)
- Reduce ruido ambiental (cierra ventanas, apaga ventiladores)
- Si hay música alta, acerca el teléfono para captar mejor la voz

### Encuadre:
- Modo vertical para mejor aprovechamiento
- Incluye desde la cintura hacia arriba
- Deja un poco de espacio arriba de la cabeza
- Centrar al performer en el cuadro

---

## Parte 6: Configuración Avanzada (Opcional)

### Cambiar Calidad de Grabación:

En `RecordingChallenge.jsx`, modificar:

```javascript
// Calidad HD (consume más espacio)
videoBitsPerSecond: 5000000  // 5 Mbps

// Calidad Media (recomendado)
videoBitsPerSecond: 2500000  // 2.5 Mbps

// Calidad Baja (poco espacio)
videoBitsPerSecond: 1000000  // 1 Mbps
```

### Cambiar Duración de Grabación:

En `RecordingChallenge.jsx`:

```javascript
// Por defecto: 30 segundos
const RECORDING_DURATION = 30 * 1000;

// Para 45 segundos:
const RECORDING_DURATION = 45 * 1000;

// Para 1 minuto:
const RECORDING_DURATION = 60 * 1000;
```

### Usar Múltiples Cámaras:

Si tienes varias cámaras, el componente permite seleccionar:
- Dropdown aparece si hay 2+ cámaras detectadas
- Selecciona la cámara antes de empezar a grabar
- La selección se guarda para próximas grabaciones

---

## Parte 7: Especificaciones Técnicas

### Formato de Video:
- **Codec:** VP9 (WebM)
- **Resolución:** 1280x720 (720p)
- **Bitrate:** 2.5 Mbps
- **FPS:** 30 fps (automático)
- **Audio:** Opus, 128 kbps
- **Tamaño aproximado:** 5-7 MB por 30 segundos

### Base de Datos (Recording Model):
```javascript
{
  gameId: ObjectId,
  roomCode: String,
  playerId: ObjectId,
  playerName: String,
  challengeType: 'karaoke' | 'dance',
  challengeText: String,
  filename: String,
  fileSize: Number,
  duration: Number,
  uploadedAt: Date
}
```

### API Endpoints:

```
POST /api/recordings/upload
- Sube un video grabado
- Body: FormData con archivo
- Response: Recording document

GET /api/recordings/game/:roomCode
- Obtiene todas las grabaciones de un juego
- Response: Array de recordings

GET /api/recordings/:id
- Obtiene un video específico
- Response: Video file stream

DELETE /api/recordings/:id
- Elimina una grabación
- Solo el dueño o organizador puede eliminar
```

---

## Resumen Rápido:

1. **Instala DroidCam** en teléfono y laptop
2. **Conecta** por WiFi o USB
3. **Verifica** que funcione en webcamtests.com
4. **Juega** una partida de Bingo Bailable
5. **Cuando salga karaoke/baile:** Click en "Empezar a Grabar"
6. **Actúa** durante 30 segundos
7. **Ve tus videos** en la galería al final del juego

---

Sistema de Grabación Selectiva implementado por Claude Code
Desarrollado para Bingo Bailable
