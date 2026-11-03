# Bingo Bailable - TV: baile grupal y pausa de resultados (2026-11-03)

## Cambio realizado
- Baile grupal en TV: "¡TODOS A BAILAR EN GRUPO!", nunca "Jugador: <nombre>".
- Trivia y adivinanza en TV: anuncio de CORRECTO o INCORRECTO con aplausos o burro.
- La pantalla de resultado permanece 12 segundos si es correcta y 7 segundos si es incorrecta.
- Esos tiempos cubren los efectos actuales (aplausos ~11,75 s y burro ~5,15 s).
- El video de la TV se pausa mientras se muestra el anuncio y se reanuda al terminar.
- El anuncio sobrevive a los mensajes de finalizacion de reto del backend.
- No cambia el backend, el sorteo, los puntos, karaoke, retos individuales o tiempos de numeros.
- El servidor puede procesar el siguiente numero durante la retencion visual; la retencion
  es de la TV, no una pausa global del sorteo. Para un bloqueo sincronizado de la partida
  se necesitaria una modificacion adicional del backend.

## Comprobaciones
- 69 de 69 pruebas frontend (Vitest) aprobadas; 8 del TVDisplay.
- ESLint y compilacion Vite aprobados; git diff --check aprobado.
- TV HTTP 200; jugador HTTP 200; organizador sin acceso HTTP 401.
- Archivos aplauso.mp3 y burro.mp3 HTTP 206.
- Verificacion de nuevo bundle frontend en contenedor exitosa.
- Inventario de 49 contenedores: los 48 ajenos al frontend no cambiaron.
- La musica continua montada en modo solo lectura.

## Despliegue
- Imagen nueva: bingo-contabo-trial-020d654-frontend:tv-reveal-20261103
- Overlay: /home/yoryi/bingo-tv-reveal-20261103/images.yaml
- Imagen anterior para rollback: bingo-contabo-trial-020d654-frontend:feedback-20261103
- Mantener los overlays existentes de entrada publica, music-mount, dance y feedback
  antes del overlay tv-reveal. No alterar MongoDB ni otros servicios.
- Baseline de contenedores: predeploy.json y postdeploy.json en la carpeta de despliegue.

## Pendiente
Confirmacion real en TV: que la pantalla y audio resulten adecuados al evento.
No hay commit o PR: el repositorio de trabajo contiene otras modificaciones no relacionadas.
