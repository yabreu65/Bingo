# Bingo Bailable - Retos MP3 locales (2026-11-03)

Cambios:
- Las diez pistas de baile se almacenan en bingo-react/public/music/retos.
- Los cuatro retos grupales reutilizan esas pistas.
- Canto (sing) congelado; karaoke no se ha modificado.
- TV en QR: sin reproduccion hasta comenzar la partida.
- En baile y grupo se pausa el video, se inicia el MP3 y se detiene al terminar el reto.
- Configuracion de sala: inicio de pista en segundos (0-180, predeterminado 20);
  duracion baile (10-120, predeterminado 30); grupal (10-120, predeterminado 45).

Contabo temporal:
- Host: bingo.31.220.98.21.sslip.io
- MP3: /home/yoryi/bingo-rollout-20261103/music/retos/
- Carpeta de musica existente montada en solo lectura en /usr/share/nginx/html/music.
- Imagen backend: bingo-contabo-trial-020d654-backend:dance-20261103
- Imagen frontend: bingo-contabo-trial-020d654-frontend:dance-20261103
- Overlay Compose: /home/yoryi/bingo-dance-release-20261103/images.yaml
- Mantener overlays anteriores de Traefik y music-mount al usar Docker Compose.

Rollback: restaurar solamente los contenedores backend y frontend con las imagenes
anteriores (backend:modalities-20261103, frontend:qr-modes-20261103) usando
las mismas Compose de base, sin el overlay dance-20261103. No tocar MongoDB
ni eliminar volumenes.

Validacion:
- FFprobe 10/10 pistas.
- Jest dirigido backend 24/24.
- Vitest frontend completo 63/63.
- ESLint dirigido, build Vite y git diff --check PASS.
- Contabo MP3 HTTP 206 para 10/10, TV y jugador HTTP 200, admin protegido HTTP 401.
- Socket.IO HTTP 200, backend runtime de modalidades musical PASS.
- Otros 47 contenedores sin diferencias de inventario.
- Suite completa backend sin finalizar por atasco de pruebas de integracion;
  se detuvo sin modificar servicios.

Pendiente: aceptacion humana con una TV real. Comprobar silencio en QR,
musica al iniciar partida, reto de baile, reto grupal, y reanudacion al
finalizar. Algunos navegadores exigen un clic previo para audio con sonido.
