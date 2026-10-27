# Fase 1: contrato y motor de Bingo

Este documento describe el contrato funcional que comparten el backend y el
frontend para el juego online. No sustituye las reglas comerciales pendientes
de las fases posteriores.

## Cartones

- Hay 200 cartones determinísticos, numerados del 1 al 200.
- Cada columna usa el rango tradicional `B` 1–15, `I` 16–30, `N` 31–45,
  `G` 46–60 y `O` 61–75. Los cinco valores de cada columna se ordenan.
- La matriz persistida existente se conserva como `matrix[col][row]` y se
  identifica como `matrixVersion: "v1-column-major"`. No se migran ni se
  reescriben cartones asignados.
- Las coordenadas públicas siempre son cero-based `{ row, col }`. Las vistas
  deben leer la matriz mediante `getCardCell`; nunca deben intercambiar filas y
  columnas implícitamente.
- La celda central `(2, 2)` contiene `BINGO` y comienza marcada.
- En modo online, el cartón persistido por el backend es la fuente autoritativa.
  El frontend solo representa ese payload y conserva `matrixVersion` durante
  selección, espera, reconexión y juego.

## Modalidades y reclamos

La configuración de sala y `Game.gameMode` usan los identificadores:
`line`, `fourCorners`, `centralCross` y `full`.

- `line`: cualquier fila, columna o diagonal completa.
- `fourCorners`: `(0,0)`, `(0,4)`, `(4,0)` y `(4,4)`.
- `centralCross`: fila central y columna central; la celda libre se cuenta una
  sola vez.
- `full`: las 25 celdas, incluida la celda libre.

El servidor reconstruye la evidencia usando la tarjeta persistida y los
números llamados. Rechaza coordenadas inválidas, valores no llamados, tarjetas
con forma incorrecta, modos distintos al configurado y reclamos fuera de una
partida activa. El frontend puede mostrar progreso, pero no decide el ganador.
El desempate existente se conserva para reclamos simultáneos de cartón completo.

## Estados y eventos

`Room.gameState` usa `waiting`, `playing`, `paused` y `finished`. `Game.status`
usa `active`, `paused` y `finished`; al iniciar se crea un juego `active`, y
pausar, reanudar, finalizar o reiniciar sincroniza ambos documentos.

Las acciones de inicio, llamada, marcado y reclamo comprueban el estado antes
de mutar datos. Pausar o finalizar limpia los timers. El marcado válido emite
`cell-marked`; los reclamos usan `bingo-claimed`, `bingo-rejected`,
`bingo-verified` y `game-finished`; las transiciones usan
`game-state-changed`. La reconexión vuelve a consultar el estado persistido.

## Jugadores y estadísticas

Una partida requiere al menos dos participantes con cartón digital o manual.
La asignación digital protege la combinación sala/cartón con un índice único
parcial. El marcado válido es idempotente y actualiza atómicamente la marca,
`stats.numbersMarked` y los puntos por número. El primer reclamo válido
actualiza atómicamente el ganador y suma los puntos de la modalidad, además de
`gamesWon`, `bingosAchieved` y el logro específico cuando corresponde.

El valor `POINTS.FIRST_BINGO_BONUS` y los puntos de retos siguen perteneciendo
a flujos fuera del alcance de esta fase; no se inventa un sistema de premios.

## Modo local y modo online

`GameContext` conserva el modo local. Utiliza la misma generación determinística,
la misma versión de matriz y los mismos patrones de `gameMode`, pero no se
convierte en un cliente Socket.IO. El modo online continúa delegando asignación,
marcado, reclamos, persistencia y autorización al backend.

## Verificación y límites

Las pruebas de unidad cubren la estructura y unicidad de los 200 cartones, la
orientación, los cuatro patrones, números no llamados y permisos. La suite E2E
usa MongoMemoryServer, Chromium de Playwright y servicios locales aislados; lee
las 25 celdas visibles, marca tres casillas de filas y columnas distintas,
comprueba persistencia, reconexión, seguridad, TV, trivia, desempate y votación.

El job E2E está versionado en `.github/workflows/ci.yml`. Su ejecución remota
requiere un push posterior y por eso no se afirma aquí un resultado de GitHub
Actions. La privacidad de cartones públicos, revocación avanzada de tokens,
persistencia distribuida de timers y las reglas comerciales de retos/premios
son pendientes fuera de esta Fase 1.
