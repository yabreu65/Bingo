# Bingo Bailable - Sonidos de trivia y adivinanzas (2026-11-03)

Problema identificado:
- Trivia: los eventos iniciales no contenian isCorrect, pero la TV interpretaba
  undefined como incorrecto, reproducia el burro y luego otro efecto de resultado.
- Adivinanzas: las respuestas se comparaban con igualdad muy literal y la
  musica normal se podia superponer al efecto cuando el juego reanudaba.

Correccion:
- Un solo efecto por reto y respuesta, solo cuando el resultado es booleano.
- Respuesta correcta: aplausos. Incorrecta: burro. Ambas funciones respetan silencio.
- Solo un par de audios en la TV, sin refs duplicados.
- Volumen del video baja temporalmente durante el efecto y se restablece al acabar.
- Adivinanzas aceptan articulos opcionales al inicio de una respuesta correcta.
- Sin cambios a puntos, karaoke, musica normal ni gestion de cartones.

Pruebas:
- 65/65 pruebas frontend completas PASS; pruebas adicionales trivia incorrecta PASS.
- 25/25 pruebas backend dirigidas PASS; ESLint, build Vite y diff check PASS.
- HTTP 206 de aplauso.mp3 y burro.mp3 en Contabo.
- HTTP TV/jugador 200, organizador protegido 401 y Socket.IO 200.
- Backend desplegado verifica reglas de adivinanzas.
- Todos los contenedores ajenos a frontend/backend de Bingo sin diferencias.

Contabo:
- Imagen backend: bingo-contabo-trial-020d654-backend:feedback-20261103.
- Imagen frontend: bingo-contabo-trial-020d654-frontend:feedback-20261103.
- Overlay Compose: /home/yoryi/bingo-sound-fix-20261103/images.yaml.
- Inventario de respaldo antes/despues en el mismo directorio.
- Mantener overlays previos de musica, public-entry, dance y MongoDB.
- Rollback: omitir overlay feedback y recrear solo backend/frontend
  sobre imagenes dance-20261103, sin tocar MongoDB ni otros servicios.

Pendiente: aceptacion con TV real y sonido real de los cuatro escenarios.
Si efectos se encuentran silenciados en configuracion de la sala, no se oyen.
