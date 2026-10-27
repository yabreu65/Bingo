# Fase 2 — Juegos, retos y desafíos

## Alcance implementado

- Se añadieron pools sin repetición para trivia, adivinanzas, baile, canto,
  retos grupales y karaoke.
- Las adivinanzas se evalúan únicamente en backend. La normalización elimina
  mayúsculas, acentos, puntuación y espacios repetidos, pero no acepta
  coincidencias parciales.
- Los challenges tienen un identificador, duración, participantes, respuestas
  y estado persistidos en `Game.activeChallenge`.
- Trivia y adivinanzas no exponen sus respuestas en los eventos públicos ni en
  la sincronización de jugadores. La corrección se entrega al participante y
  se publica cuando el reto termina.
- Se registran puntos y estadísticas de trivia, adivinanzas, karaoke y retos
  completados.
  Las actualizaciones de jugadores usan incrementos atómicos.
- Los retos grupales esperan una respuesta válida de cada participante antes de
  finalizar; las respuestas se registran con una actualización atómica y el
  historial del juego conserva el resultado. Si el tiempo vence, el
  temporizador del servidor reanuda la sala.
- El organizador puede lanzar explícitamente cada tipo de reto. La TV recibe
  los retos privados necesarios, controla el fin de karaoke y muestra el estado
  de votación.
- La votación regular valida la identidad del socket, excluye al intérprete,
  limita su vigencia a quince segundos y evita volver a otorgar el bonus al
  cerrar una votación ya completada.

## Contratos Socket.IO principales

| Evento | Emisor | Propósito |
| --- | --- | --- |
| `launch-event` | Organizador | Lanza `trivia`, `riddle`, `dance`, `sing`, `group` o `karaoke`. |
| `challenge-triggered` | Backend | Entrega el reto filtrado por rol y participante. |
| `trivia-answered` | Jugador/TV autorizado | Envía el índice elegido; el backend calcula la corrección. |
| `challenge-answer` | Jugador seleccionado | Envía una respuesta de adivinanza. |
| `challenge-complete` | Participante autorizado | Registra la finalización de baile, canto o reto grupal. |
| `votingStarted` | Backend | Abre una votación regular para el reto activo. |
| `castVote` | Jugador | Registra de una a cinco estrellas con su propia identidad. |
| `endVoting` | Organizador | Cierra la votación y publica resultados. |

## Pruebas ejecutadas

- Backend Jest completo: 16 suites, 184 tests aprobados.
- Frontend Vitest completo: 9 archivos, 20 tests aprobados.
- ESLint y build Vite aprobados.
- Playwright E2E existente: paridad de 200 cartones, flujo organizador/
  jugadores/TV, trivia, bingo, reconexión, seguridad REST, desempate y
  votación.
- El flujo E2E extendido valida la presentación de riddle, dance, sing, group
  y karaoke con MongoDB efímero. El escenario de navegador completa el reto
  grupal desde ambos navegadores, verifica respuestas, puntos y reanudación,
  y conserva además una ejecución separada de expiración del temporizador.

## Datos y seguridad

Las pruebas E2E usan `MongoMemoryServer`, puertos locales y secretos efímeros
definidos por el runner. No se descargan canciones ni se requieren archivos
multimedia privados para validar los contratos esenciales.

La respuesta correcta de trivia y las respuestas aceptadas de adivinanzas son
datos privados del backend. No deben añadirse al estado público, a fixtures de
cliente ni a logs de producción.

## Pendientes deliberados

- La selección comercial de puntos de baile/canto/grupo sigue usando el bonus
  estándar existente; el producto puede ajustar esos valores en
  `backend/constants/index.js` sin cambiar los contratos de socket.
- El cierre automático de una votación regular conserva el cierre manual del
  organizador como autoridad de publicación de resultados.
