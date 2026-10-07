# 🎤 MODO KARAOKE - GUÍA COMPLETA

El modo karaoke ha sido implementado exitosamente en tu Bingo Bailable. Este documento te explica cómo funciona y cómo agregar tus propias canciones.

---

## 🎯 ¿Qué es el Modo Karaoke?

Es un nuevo tipo de challenge que aparece durante el juego de bingo, donde un jugador seleccionado al azar tiene **30 segundos** para cantar una canción con letras que aparecen en pantalla, acompañado de **video de YouTube**.

---

## ✅ ¿Qué ya está implementado?

### Backend:
- ✅ Tipo de challenge `KARAOKE` agregado a las constantes
- ✅ Pool de 9 canciones listas para karaoke
- ✅ Sistema de selección aleatoria de canciones
- ✅ Puntos por completar karaoke (75 puntos)
- ✅ Rotación automática: trivia → dance → sing → group → **karaoke** → trivia...

### Frontend:
- ✅ Interfaz completa de karaoke en ChallengeModal
- ✅ Reproductor de música Deezer integrado
- ✅ Display de letras con scroll automático
- ✅ Timer de 30 segundos
- ✅ Animaciones de letras (resalta la línea actual)
- ✅ Estilos CSS personalizados
- ✅ Diseño responsive

---

## 🎵 Canciones Incluidas

El sistema ya incluye **9 canciones** con Deezer IDs:

1. **Vivir Mi Vida** - Marc Anthony (con letras de ejemplo)
2. **La Rebelión** - Joe Arroyo
3. **Suavemente** - Elvis Crespo
4. **Obsesión** - Aventura
5. **Propuesta Indecente** - Romeo Santos
6. **Gasolina** - Daddy Yankee
7. **Despacito** - Luis Fonsi
8. **All I Want for Christmas** - Mariah Carey
9. **Feliz Navidad** - José Feliciano

Además, hay **11 slots vacíos** listos para que agregues tus propias canciones.

---

## 📝 Cómo Agregar Letras a las Canciones

### Paso 1: Abre el archivo de canciones

```bash
bingo-react/src/data/karaokeList.js
```

### Paso 2: Encuentra la canción que quieres editar

Busca el objeto de la canción, por ejemplo:

```javascript
{
  id: 'karaoke-002',
  title: 'La Rebelión',
  artist: 'Joe Arroyo',
  genre: 'Salsa',
  deezerId: '139577938',
  difficulty: 'medium',
  lyrics: [
    '[Agregar letras aquí]',  // <-- REEMPLAZA ESTO
    '[Línea 2]',
    '[Línea 3]'
  ]
}
```

### Paso 3: Agrega las letras línea por línea

Reemplaza los placeholders con las letras reales:

```javascript
{
  id: 'karaoke-002',
  title: 'La Rebelión',
  artist: 'Joe Arroyo',
  genre: 'Salsa',
  deezerId: '139577938',
  difficulty: 'medium',
  lyrics: [
    'Quiero que me cuentes tu vida',
    'Simón Pérez bailador',
    'Contigo empezó la primera',
    'De todas las rebeliones',
    '',  // <-- Línea vacía para espaciar
    'No le pegue a la negra',
    'No le pegue a la negra',
    'No le pegue a la negra'
  ]
}
```

### Paso 4: Consejos para las letras

- **Duración:** Las letras deben caber en 30 segundos
- **Líneas:** Usa el coro o la parte más conocida
- **Espacios:** Agrega líneas vacías `''` para hacer pausas
- **Cantidad:** Entre 6-12 líneas es ideal para 30 segundos
- **Formato:** Una línea por elemento del array

---

## 🆕 Cómo Agregar Nuevas Canciones

### Paso 1: Encuentra el ID de Deezer

**Opción A - Desde el sitio web:**
1. Ve a https://www.deezer.com/
2. Busca tu canción
3. La URL será: `https://www.deezer.com/track/XXXXXXX`
4. Copia el número (XXXXXXX) - ese es el ID

**Opción B - Desde tu API:**
```bash
curl http://localhost:5001/api/deezer/search?query=nombre+de+cancion
```

### Paso 2: Agrega la canción al archivo

En `karaokeList.js`, busca los slots vacíos (karaoke-019, karaoke-020) o agrega uno nuevo:

```javascript
{
  id: 'karaoke-021',  // <-- Usa el siguiente número
  title: 'Tu Canción Nueva',
  artist: 'El Artista',
  genre: 'Salsa',  // Salsa, Merengue, Bachata, Reggaeton, Pop, Rock, Christmas
  deezerId: '12345678',  // <-- ID de Deezer
  difficulty: 'easy',  // easy, medium, hard
  lyrics: [
    'Primera línea de la letra',
    'Segunda línea',
    'Tercera línea',
    '',
    'Coro línea 1',
    'Coro línea 2'
  ]
}
```

### Paso 3: No olvides la coma

Asegúrate de poner una coma `,` después de cada canción excepto la última:

```javascript
{
  id: 'karaoke-020',
  title: 'Canción 1',
  // ... resto de datos
},  // <-- COMA AQUÍ
{
  id: 'karaoke-021',
  title: 'Canción 2',
  // ... resto de datos
}  // <-- SIN COMA en la última
```

---

## 🎮 Cómo Funciona en el Juego

### Flujo del Karaoke:

1. **Durante el juego**, cada 3-4 números cantados aparece un challenge
2. **Rotación:** trivia → dance → sing → group → **karaoke** → trivia...
3. **Selección aleatoria:**
   - Se elige un jugador al azar que no haya participado recientemente
   - Se selecciona una canción aleatoria del pool
4. **Pantalla de karaoke:**
   - Título y artista de la canción
   - Reproductor Deezer con preview de 30 segundos
   - Letras que se iluminan automáticamente
   - Timer de 30 segundos
5. **Completar:** El host clickea "Completar Karaoke" para continuar

### Características:

- 🎵 Música de Deezer automática
- 📜 Letras con scroll automático
- ⚡ La línea actual se resalta con animación
- ⏱️ Timer visible de 30 segundos
- 🎨 Diseño colorido y festivo
- 📱 Responsive (funciona en móviles)

---

## 🎨 Personalización

### Cambiar el tiempo de karaoke:

En `backend/constants/index.js`:
```javascript
CHALLENGE_DURATION: 30,  // <-- Cambia a 45 o 60 si quieres más tiempo
```

### Cambiar la frecuencia de karaoke:

El karaoke aparece en rotación con otros challenges. Para que aparezca más seguido, edita la rotación en:
`backend/socket/utils/challengeSelector.js`

### Cambiar los puntos del karaoke:

En `backend/constants/index.js`:
```javascript
KARAOKE_COMPLETED: 75,  // <-- Cambia el puntaje
```

---

## 🐛 Troubleshooting

### "No hay letras disponibles"
- Verifica que el array `lyrics` tenga contenido
- Asegúrate de no tener `[Agregar letras aquí]` en las letras

### "No se reproduce la música"
- Verifica que el `deezerId` sea correcto
- Algunos tracks de Deezer no tienen preview de 30s

### "No aparece el karaoke en el juego"
- Asegúrate de que el backend esté reiniciado
- Verifica que el frontend esté compilado
- El karaoke aparece en rotación, espera a que le toque su turno

### "Error al cargar karaokeList.js"
- Verifica que no haya errores de sintaxis (comas, corchetes)
- Usa un linter de JavaScript para verificar el archivo

---

## 📊 Ejemplo Completo de Canción

```javascript
{
  id: 'karaoke-025',
  title: 'El Gran Varón',
  artist: 'Willie Colón',
  genre: 'Salsa',
  deezerId: '123456789',
  difficulty: 'medium',
  lyrics: [
    'En la sala de un hospital',
    'A las 9:43 nació Simón',
    'Era el verano del 56',
    'El orgullo de Don Andrés',
    '',
    'Por ser varón',
    'Que me traigan de todo',
    'Pa\' mi Simón',
    'Hay que celebrar su nacimiento',
    '',
    'Simón, Simón',
    'Que alegría conocerte'
  ]
}
```

---

## 🚀 Próximos Pasos Recomendados

1. **Agregar letras a las 20 canciones** incluidas
2. **Buscar 30-50 canciones más** populares en Deezer
3. **Organizar por géneros** para mejor variedad
4. **Testear el sistema** jugando varias partidas
5. **Ajustar tiempos** si 30 segundos es muy corto/largo

---

## 📞 Notas Importantes

- **Deezer previews:** Solo duran 30 segundos (limitación de Deezer API)
- **Sin internet:** El karaoke no funcionará sin conexión
- **Letras manuales:** Debes agregar las letras tú mismo (derechos de autor)
- **Filtrado automático:** Las canciones sin letras no aparecerán en el juego

---

## ✨ ¡Disfruta tu Modo Karaoke!

Ya está todo listo. Solo necesitas:
1. Agregar las letras de tus canciones favoritas
2. Reiniciar el backend: `cd backend && npm start`
3. Iniciar el frontend: `cd bingo-react && npm run dev`
4. ¡Jugar y cantar!

---

**Creado para Bingo Bailable** 🎉
Desarrollado con ❤️ por Claude Code
