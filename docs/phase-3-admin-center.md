# Fase 3 — Centro de Administración por sala

## Alcance

El organizador de una sala puede administrar contenidos y configuración sin editar código. La administración es **room-scoped** y reutiliza la credencial secreta `hostCapability`; no se creó un administrador global basado en una contraseña expuesta.

## Arquitectura

- `backend/models/AdminContent.js`: preguntas, adivinanzas, plantillas de baile/canto/grupo/karaoke y metadatos de pistas.
- `backend/models/Playlist.js`: playlists ligadas a una sala y a pistas autorizadas.
- `backend/models/Prize.js`: inventario y entregas atómicas de premios descriptivos.
- `backend/routes/adminRoutes.js`: CRUD, importación/exportación y autorización.
- `backend/utils/adminCatalog.js`: validación, límites y adaptación al contrato legacy de challenges.
- `bingo-react/src/components/Organizer/AdminCenter.jsx`: interfaz real integrada al dashboard del organizador.
- `bingo-react/src/components/Player/PlayerCardView.jsx`: reproduce en modo sincronizado la playlist local activa de la sala.

Cuando una sala activa contenido administrado, el motor crea un snapshot de los pools en `Game.availablePools` y la selección prioriza ese snapshot sobre los catálogos legacy. La edición posterior no cambia una ronda ya iniciada ni expone respuestas correctas en eventos públicos. El E2E visual verifica que la primera trivia usa la pregunta administrada.

## Autorización

Todas las rutas requieren `x-room-host-capability` válido para la sala, o una identidad JWT con rol `admin`. Jugadores y TV reciben `403`. El código público de sala por sí solo no autoriza operaciones.

## API

Base: `/api/admin/rooms/:code`

- `GET/POST /contents`
- `GET/PATCH/DELETE /contents/:id`
- `POST /contents/:id/duplicate`
- `POST /contents/import` con JSON o CSV validado, máximo 100 filas
- `GET /contents/export?format=json|csv`
- `GET/POST /playlists`
- `PATCH/DELETE /playlists/:id`
- `GET/POST /prizes`
- `PATCH/DELETE /prizes/:id`
- `POST /prizes/:id/deliveries`

Las eliminaciones son archivado lógico. Las entregas usan una actualización atómica con inventario positivo y protección contra entrega duplicada al mismo jugador.

## Sala y reglas

La configuración existente continúa en `PATCH /api/rooms/:code/config`. Fase 3 agrega nombre del evento, visibilidad de resultados, máximo de jugadores, desempate, playlist activa y marca de contenido administrado. El centro permite editar modalidad, intervalos, frecuencia, tipos de reto y playlist; cambiar `gameMode` o `maxPlayers` durante una ronda es rechazado por el contrato de la sala, y una ronda ya creada conserva sus snapshots.

## Importación/exportación

El importador solo acepta objetos declarativos; no evalúa expresiones ni ejecuta valores. Valida tipo, texto, opciones, índice correcto, respuestas aceptadas, puntos, duración y límites de participantes antes de escribir. Si alguna fila falla, no se importa ninguna.

Las exportaciones administrativas incluyen respuestas correctas porque la ruta ya exige autorización de organizador. Las rutas públicas siguen usando `stripTriviaAnswers`.

## Música

Las pistas se registran por identificador seguro y metadatos. No se aceptan rutas absolutas del equipo ni se descargan archivos privados. Las pruebas pueden usar recursos sintéticos o identificadores controlados; un recurso faltante no debe bloquear el ciclo del juego.

## Pruebas

- Backend: validación de catálogo, límites, importación sin estados parciales y autorización room-scoped.
- Frontend: suite existente, lint y build.
- E2E visual: el organizador crea dos pistas locales sintéticas, selecciona y ordena una playlist, la activa, cambia la configuración, crea/edita/entrega un premio y verifica persistencia en MongoDB; un jugador consume la playlist activa desde el reproductor sincronizado.
- Fases 1 y 2: se conservan sus suites y contratos.

## Limitaciones reales

La creación histórica de salas sigue usando una capability de organizador efímera, aunque el backend también conserva soporte JWT para `host` y `admin`. No se implementó subida de multimedia ni streaming nuevo; la biblioteca musical existente permanece intacta.
