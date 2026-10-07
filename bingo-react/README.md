# 🎄 Bingo Bailable Navideño 🎅

> Aplicación de bingo multijugador en tiempo real con música sincronizada, retos interactivos y temática navideña.

[![React](https://img.shields.io/badge/React-19.2.0-61DAFB?logo=react)](https://react.dev/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8.1-010101?logo=socketdotio)](https://socket.io/)
[![Vite](https://img.shields.io/badge/Vite-5.4.10-646CFF?logo=vite)](https://vitejs.dev/)

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Desarrollo](#-desarrollo)
- [Producción](#-producción)
- [Arquitectura](#-arquitectura)
- [Funcionalidades](#-funcionalidades)
- [Contribuir](#-contribuir)

---

## ✨ Características

### 🎮 Multijugador en Tiempo Real
- **Hasta 50 jugadores simultáneos** en una sala
- Sincronización en tiempo real vía **Socket.io**
- Reconexión automática al recargar la página
- Sistema de salas con códigos únicos de 6 dígitos

### 🎯 Sistema de Bingo Completo
- **200 cartones únicos** pre-generados
- Cartones 5x5 con distribución B-I-N-G-O estándar (1-75)
- Múltiples formas de ganar:
  - Línea horizontal, vertical o diagonal
  - Cuatro esquinas
  - Cruz central
  - Cartón completo (BINGO)

### 🎵 Música Sincronizada
- Reproducción de música mediante **YouTube API**
- Control centralizado por el anfitrión
- 7 modos musicales: Salsa, Merengue, Bachata, Reggaeton, Navideño, Variado, Mega
- Cambio automático de canciones
- Sincronización de play/pause/volumen en tiempo real

### 🎤 Retos Interactivos
- **50 retos diferentes:**
  - 20 retos de baile
  - 20 retos de canto
  - 10 retos grupales
- **30 preguntas de trivia navideña** (fácil, media, difícil)
- Aparecen cada 4 números cantados
- Rotación automática sin repetir jugadores
- **Obligatorio completar** para continuar el juego

### 📺 Vista para TV/Proyector
- Pantalla fullscreen optimizada
- Muestra número actual gigante
- Historial de números cantados
- Video de YouTube embebido
- QR code para unirse rápidamente
- Decoraciones navideñas animadas

### 🚀 Acceso Rápido
- **Quick Join:** Únete con código + nombre + cartón en un solo paso
- **QR Code:** Escanea y accede directamente
- URLs directas:
  - TV Display: `?tv=CODIGO_SALA`
  - Quick Join: `?room=CODIGO_SALA`

---

## 📦 Requisitos Previos

### Software Necesario
- **Node.js** v18.0.0 o superior
- **npm** v9.0.0 o superior (incluido con Node.js)
- **Backend** del servidor Socket.io (ver carpeta `/backend`)

### Navegadores Soportados
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

---

## 🔧 Instalación

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd bingo-bailable/bingo-react
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Instalar y ejecutar el backend

```bash
cd ../backend
npm install
npm run dev
```

El backend se ejecutará en `http://localhost:5001`

---

## ⚙️ Configuración

### Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# URL del backend Socket.io
VITE_BACKEND_URL=http://localhost:5001

# Para producción:
# VITE_BACKEND_URL=https://tu-backend.com
```

### Configurar IDs de YouTube (IMPORTANTE)

⚠️ **ACCIÓN REQUERIDA:** Antes de usar en producción, debes actualizar los IDs de YouTube en:

`src/config/musicPlaylists.js`

Actualmente todos los `videoId` están configurados con un valor de prueba. Reemplázalos con IDs reales de YouTube para cada canción.

**Ejemplo:**

```javascript
{
  title: "Feliz Navidad",
  artist: "José Feliciano",
  duration: "3:05",
  videoId: "Z-e8hcgA_4w"  // ❌ ID de prueba
  // videoId: "gF25HqddRtc" // ✅ ID real de YouTube
}
```

Para obtener un ID de YouTube:
1. Abre el video en YouTube
2. Copia el código después de `v=` en la URL
3. Ejemplo: `https://youtube.com/watch?v=gF25HqddRtc` → ID: `gF25HqddRtc`

---

## 🚀 Desarrollo

### Iniciar servidor de desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173` (o el puerto que Vite asigne)

### Acceso desde red local

```bash
npm run dev -- --host
```

Esto permite acceder desde otros dispositivos en la misma red local.

### Linting

```bash
npm run lint
```

---

## 🏗️ Producción

### Build

```bash
npm run build
```

Los archivos optimizados se generan en la carpeta `dist/`

### Preview del build

```bash
npm run preview
```

### Deploy

Puedes desplegar la carpeta `dist/` en cualquier servidor estático:
- **Netlify**
- **Vercel**
- **Firebase Hosting**
- **AWS S3 + CloudFront**
- **Nginx** / **Apache**

**Importante:** No olvides configurar la variable de entorno `VITE_BACKEND_URL` con la URL de tu backend en producción.

---

## 🏛️ Arquitectura

### Estructura del Proyecto

```
bingo-react/
├── src/
│   ├── components/          # Componentes React
│   │   ├── BingoCard/       # Cartón de bingo
│   │   ├── Challenges/      # Sistema de retos
│   │   ├── Game/            # Pantalla de juego (single player)
│   │   ├── Landing/         # Página de inicio
│   │   ├── Music/           # Reproductores de música
│   │   ├── Organizer/       # Dashboard del organizador
│   │   ├── Player/          # Vista del jugador
│   │   ├── Ranking/         # Tabla de clasificación
│   │   ├── Room/            # Sistema de salas
│   │   ├── TVDisplay/       # Vista para TV/proyector
│   │   └── UI/              # Componentes UI reutilizables
│   ├── context/             # Context API
│   │   ├── GameContext.jsx  # Estado del juego (local)
│   │   └── SocketContext.jsx# Conexión Socket.io
│   ├── config/              # Configuraciones
│   │   └── musicPlaylists.js# Playlists de YouTube
│   ├── data/                # Datos estáticos
│   │   ├── challenges.js    # Banco de retos
│   │   ├── christmasSongs.js# Canciones navideñas
│   │   ├── songs.js         # Canciones generales
│   │   └── triviaQuestions.js# Preguntas de trivia
│   ├── utils/               # Utilidades
│   │   ├── bingoCardGenerator.js # Generador de cartones
│   │   └── exportResults.js     # Exportación de resultados
│   ├── App.jsx              # Componente raíz con routing
│   └── main.jsx             # Entry point
├── public/                  # Archivos estáticos
├── .env.example             # Ejemplo de variables de entorno
├── package.json             # Dependencias
├── vite.config.js           # Configuración de Vite
└── README.md                # Este archivo
```

### Stack Tecnológico

#### Frontend
- **React 19.2.0** - Biblioteca UI
- **Vite 5.4.10** - Build tool y dev server
- **Socket.io Client 4.8.1** - WebSockets en tiempo real
- **React Player 3.4.0** - Reproductor de YouTube
- **QRCode.react 4.2.0** - Generador de QR codes

#### Backend (ver `/backend`)
- **Node.js + Express**
- **Socket.io Server**
- **MongoDB** (opcional, para persistencia)

### Patrones de Diseño

- **Context API** - Gestión de estado global
- **Custom Hooks** - `useGame()`, `useSocket()`
- **Componentes Controlados** - Formularios y inputs
- **Separación de Responsabilidades** - Lógica vs. presentación
- **Provider Pattern** - Proveedores anidados

---

## 🎯 Funcionalidades

### Flujo Principal (Multijugador)

```
1. Landing Page
   ↓
2. Room Setup (Crear/Unirse)
   ↓
3. Card Selection (Elegir cartón 1-200)
   ↓
4. Waiting Room (Esperar jugadores)
   ↓
   ├─→ HOST: Organizer Dashboard
   └─→ PLAYER: Player Card View
```

### Roles

#### Anfitrión (Host)
- Crear la sala
- Controlar el juego (iniciar, pausar, cantar números)
- Cambiar música y modo musical
- Lanzar eventos especiales (retos, trivias, premios)
- Ver todos los cartones de los jugadores
- Acceso a dashboard completo

#### Jugador (Player)
- Unirse a la sala
- Seleccionar cartón
- Marcar números
- Completar retos
- Reclamar BINGO

### Eventos del Juego

- **Números cantados** cada 30 segundos (configurable)
- **Retos interactivos** cada 4 números
- **Cambio automático de canciones** según duración
- **Verificación automática** de líneas, esquinas, cruz, y cartón completo

---

## 🛠️ Troubleshooting

### El backend no conecta

**Problema:** "Socket disconnected" o "Conectando al servidor..."

**Solución:**
1. Verifica que el backend esté ejecutándose en `http://localhost:5001`
2. Verifica la variable de entorno `VITE_BACKEND_URL` en `.env`
3. Revisa la consola del backend para errores

### No se reproduce la música

**Problema:** El reproductor de YouTube no carga

**Solución:**
1. Verifica que los `videoId` sean válidos en `musicPlaylists.js`
2. Algunos videos pueden tener restricciones de embed
3. Verifica que no haya bloqueadores de anuncios

### Los jugadores no se sincronizan

**Problema:** Los números cantados no aparecen en todos los dispositivos

**Solución:**
1. Verifica que todos estén en la misma sala (mismo código)
2. Revisa la conexión de red de cada dispositivo
3. Recarga la página y reconecta

### Error al unirse a sala

**Problema:** "Sala no encontrada" o "Código inválido"

**Solución:**
1. Verifica que el código sea exacto (6 dígitos)
2. Asegúrate de que el anfitrión ya creó la sala
3. Verifica que la sala no haya alcanzado el límite de 50 jugadores

---

## 📝 Notas de Desarrollo

### StrictMode

Actualmente deshabilitado en `main.jsx` para evitar doble conexión de Socket.io.

### Sistema de Puntos

El sistema de puntuación fue eliminado. La aplicación ahora se enfoca en la experiencia de juego sin competencia por puntos.

### React 19

Esta aplicación usa React 19 (versión RC). Si encuentras problemas de compatibilidad, considera downgrade a React 18.

---

## 📄 Licencia

[Especifica tu licencia aquí]

---

## 👨‍💻 Autor

[Tu nombre/organización]

---

## 🎉 ¡Disfruta el Juego!

Si encuentras bugs o tienes sugerencias, por favor abre un issue en el repositorio.

**¡Felices fiestas y que gane el mejor! 🎄🎅**
