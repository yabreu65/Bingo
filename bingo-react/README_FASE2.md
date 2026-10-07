# 🎄 Bingo Bailable Navideño - Fase 2 🎅

Aplicación web interactiva de Bingo Navideño con sistema de puntos, cartones digitales, retos personalizados y ranking en tiempo real.

## ✨ Características Implementadas

### ✅ Fase 1 (Migrada a React)
- ✅ Sistema de registro de jugadores
- ✅ Bingo automático (números 1-75)
- ✅ 20 canciones navideñas rotativas
- ✅ Sistema de retos (Trivia, Baile, Canto)
- ✅ Controles del juego (Play, Pause, Stop, Reto Manual)
- ✅ Diseño navideño responsive con animaciones
- ✅ Todas las validaciones

### 🚀 Fase 2 (NUEVAS Funcionalidades)

#### 1. **Sistema de Puntos y Ranking** ⭐
- **Puntuación:**
  - +100 puntos por trivia correcta
  - +50 puntos por reto de baile completado
  - +50 puntos por reto de canto completado
  - +75 puntos por reto grupal
  - +200 puntos por línea completa
  - +500 puntos por BINGO completo
  - +150 puntos por 4 esquinas
  - +175 puntos por cruz central
  - +25 puntos de bonificación por racha de 3 aciertos consecutivos

- **Niveles:**
  - ⭐ Novato (0-200 pts)
  - ⭐⭐ Aprendiz (201-500 pts)
  - ⭐⭐⭐ Experto (501-1000 pts)
  - 👑 Maestro Navideño (1001+ pts)

- **Ranking en Tiempo Real:**
  - Tabla de clasificación dinámica
  - Top 3 destacado con medallas (🥇🥈🥉)
  - Actualización automática
  - Animaciones de cambio de posición

#### 2. **Cartones de Bingo Digitales** 🎴
- Cartón único 5x5 para cada jugador
- Distribución B-I-N-G-O estándar (B:1-15, I:16-30, N:31-45, G:46-60, O:61-75)
- Espacio FREE en el centro
- Marcado automático de números
- Visualización individual por jugador
- Colores distintivos: blanco (no marcado), verde (marcado), dorado (FREE)
- Detector automático de:
  - Líneas completas (horizontal, vertical, diagonal)
  - 4 esquinas
  - Cruz central
  - Cartón completo (BINGO)

#### 3. **Retos Ampliados** 🎯
- **30 Preguntas de Trivia** (Fáciles, Medias, Difíciles)
- **20 Retos de Baile** (salsa, TikTok, robot, pareja, etc.)
- **20 Retos de Canto** (ópera, rap, dueto, beatbox, etc.)
- **10 Retos Grupales NUEVOS** (todos participan)

#### 4. **Estadísticas Personales** 📊
Para cada jugador:
- Total de puntos acumulados
- Nivel actual y progreso hacia siguiente nivel
- Retos completados
- Porcentaje de aciertos en trivias
- Racha actual de aciertos
- Números marcados en cartón (X/25)
- Líneas completadas
- Logros desbloqueados (4 esquinas, cruz, BINGO)

#### 5. **Historial Extendido** 📋
- Últimos 20 números cantados (en lugar de 10)
- Colores por letra (B-I-N-G-O)
- Barra de progreso: "X/75 números cantados"
- Tracking completo del juego

#### 6. **Notificaciones y Alertas** 🔔
- Sistema de alertas visuales
- Indicadores de proximidad a victoria
- Notificaciones de rachas
- Celebraciones especiales

#### 7. **Efectos Visuales** ✨
- Confeti al ganar
- Animación de copos de nieve
- Efectos bounce en números
- Transiciones suaves
- Badges y medallas visuales
- Panel de "Jugador del Momento"

#### 8. **Controles Adicionales** 🎮
- Botón "📊 Ver Ranking" (modal con tabla completa)
- Botón "🎴 Ver Todos los Cartones" (vista de organizador)
- Botón "⏹️ Detener Juego"
- Botón "🎯 Reto Manual"

## 🏗️ Arquitectura del Proyecto

```
bingo-react/
├── src/
│   ├── components/
│   │   ├── Registration/
│   │   │   ├── RegistrationScreen.jsx   # Pantalla de registro
│   │   │   └── RegistrationScreen.css
│   │   ├── Game/
│   │   │   ├── GameScreen.jsx           # Pantalla principal del juego
│   │   │   └── GameScreen.css
│   │   ├── BingoCard/
│   │   │   ├── BingoCard.jsx            # Componente de cartón
│   │   │   └── BingoCard.css
│   │   ├── Challenges/
│   │   │   ├── ChallengeModal.jsx       # Modal de retos
│   │   │   └── ChallengeModal.css
│   │   ├── Ranking/
│   │   │   ├── Leaderboard.jsx          # Tabla de clasificación
│   │   │   └── Leaderboard.css
│   │   └── UI/
│   │       ├── Snowflakes.jsx           # Copos de nieve
│   │       ├── Confetti.jsx             # Efecto confeti
│   │       └── Modal.jsx                # Modal reutilizable
│   ├── context/
│   │   └── GameContext.jsx              # Estado global del juego
│   ├── data/
│   │   ├── songs.js                     # 20 canciones navideñas
│   │   ├── triviaQuestions.js           # 30 preguntas de trivia
│   │   └── challenges.js                # Retos de baile/canto/grupales
│   ├── utils/
│   │   ├── bingoCardGenerator.js        # Generador de cartones
│   │   ├── pointsCalculator.js          # Sistema de puntos
│   │   └── exportResults.js             # Exportar resultados
│   ├── App.jsx                          # Componente raíz
│   ├── App.css
│   ├── main.jsx                         # Entry point
│   └── index.css                        # Estilos globales
├── package.json
└── vite.config.js
```

## 🚀 Cómo Usar

### Instalación
```bash
cd bingo-react
npm install
```

### Desarrollo
```bash
npm run dev
```
La aplicación estará disponible en: **http://localhost:5173/**

### Build para Producción
```bash
npm run build
```

### Preview de Producción
```bash
npm run preview
```

## 🎮 Flujo del Juego

1. **Registro de Jugadores**
   - Agregar mínimo 2 jugadores
   - Cada jugador recibe un cartón único
   - Click en "Iniciar Juego"

2. **Durante el Juego**
   - Se cantan números automáticamente cada 30 segundos
   - Los números se marcan automáticamente en los cartones
   - Cada 3 números aparece un reto para un jugador aleatorio
   - Se acumulan puntos según el rendimiento

3. **Retos**
   - **Trivia**: Responder pregunta navideña (4 opciones)
   - **Baile**: Completar reto de baile en 20 segundos
   - **Canto**: Completar reto de canto en 30 segundos
   - **Grupal**: Todos participan (30 segundos)

4. **Victoria**
   - Se detecta automáticamente cuando alguien completa:
     - Primera línea (+200 pts)
     - 4 esquinas (+150 pts)
     - Cruz central (+175 pts)
     - Cartón completo (+500 pts)

5. **Ver Resultados**
   - Ranking en tiempo real
   - Estadísticas individuales
   - Visualizar cartones de todos

## 🎯 Características Técnicas

### Stack Tecnológico
- **React 19** - Framework principal
- **Vite 5** - Build tool y dev server
- **Context API** - Gestión de estado global
- **CSS Modules** - Estilos component-scoped

### Patrones de Diseño
- **Component-based architecture** - Componentes reutilizables
- **Context + Hooks** - Estado global sin Redux
- **Custom Hooks** - Lógica reutilizable
- **Utility functions** - Funciones puras separadas

### Optimizaciones
- Lazy loading de componentes
- Memoización donde es necesario
- Virtual DOM de React
- CSS optimizado
- Imágenes y assets optimizados

## 🎨 Personalización

### Modificar Configuración del Juego
Editar `src/context/GameContext.jsx`:
```javascript
const [config, setConfig] = useState({
  timeBetweenNumbers: 30,      // Segundos entre números
  challengeFrequency: 3,        // Cada X números sale un reto
  enabledChallengeTypes: {      // Tipos de retos habilitados
    trivia: true,
    dance: true,
    sing: true,
    group: true
  },
  gameMode: 'full',             // Modo de juego
  soundEnabled: true            // Sonidos (pendiente fase 3)
});
```

### Agregar Canciones
Editar `src/data/songs.js`:
```javascript
export const SONGS = [
  "🎄 Nueva Canción",
  // ... más canciones
];
```

### Agregar Preguntas de Trivia
Editar `src/data/triviaQuestions.js`:
```javascript
{
  question: "¿Nueva pregunta?",
  options: ["A", "B", "C", "D"],
  correct: 0, // índice de la respuesta correcta
  difficulty: "easy" // easy, medium, hard
}
```

### Modificar Puntuación
Editar `src/utils/pointsCalculator.js`:
```javascript
export const POINTS = {
  TRIVIA_CORRECT: 100,
  DANCE_COMPLETE: 50,
  SING_COMPLETE: 50,
  // ...
};
```

## 📱 Responsive Design

La aplicación es totalmente responsive:
- **Desktop**: Experiencia completa con todas las funcionalidades
- **Tablet**: Layout adaptado con navegación optimizada
- **Mobile**: Interfaz touch-friendly con controles grandes

## 🔮 Próximas Fases

### Fase 3 (Planeada)
- Backend con Node.js/Express
- Base de datos (MongoDB/PostgreSQL)
- Autenticación de usuarios
- Múltiples salas/partidas simultáneas
- WebSockets para multijugador en tiempo real
- Dashboard de administración
- Historial de partidas
- Estadísticas globales
- API REST completa

## 🐛 Solución de Problemas

### El servidor no inicia
```bash
# Limpiar y reinstalar
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Errores de compilación
```bash
# Limpiar cache de Vite
rm -rf node_modules/.vite
npm run dev
```

### Problemas de versión de Node
Asegúrate de tener Node.js 18+ instalado:
```bash
node --version  # Debe ser v18.x o superior
```

## 📝 Notas del Desarrollador

- **Estado Global**: Todo el estado del juego se maneja en `GameContext.jsx`
- **Componentes Puros**: La mayoría de componentes son funcionales y stateless
- **Separación de Concerns**: Lógica de negocio en `utils/`, UI en `components/`
- **Datos Mock**: Todas las canciones, preguntas y retos están en `data/`
- **Escalabilidad**: Arquitectura preparada para agregar backend en Fase 3

## 🎉 ¡Disfruta del Juego!

Esta es una aplicación completamente funcional lista para:
- ✅ Usarse en fiestas navideñas
- ✅ Escalarse a multijugador online
- ✅ Agregar backend y base de datos
- ✅ Desplegarse en producción

---

**Desarrollado con ❤️ para la temporada navideña 🎄**
