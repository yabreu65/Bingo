# Bingo Bailable: modalidades iniciales para salas nuevas (2026-11-03)

Objetivo: las salas nuevas seleccionan automaticamente las tres modalidades combinables:
- line (Linea)
- fourCorners (Cuatro esquinas)
- centralCross (Cruz central)
La modalidad full (Carton completo) queda inicialmente desmarcada, pero el anfitrion puede seleccionarla manualmente y es exclusiva.

Cambio en backend/utils/roomConfiguration.js: normalizeNewRoomConfig solo aplica los valores anteriores cuando el request no especifica gameMode ni gameModes. Preserva configuraciones explicitas y salas anteriores sin migracion. RoomSetup no pasa config, asi que una sala nueva recibe los tres modos y AdminCenter los muestra desde la respuesta del backend.

Validacion: 26/26 Jest dirigidas PASS (gameModeSelection y roomModalities), node --check PASS, git diff --check PASS. Imagen de backend de Contabo comprobada en ejecucion aislada sin red: PASS.

ESTADO FINAL: DESPLEGADO EN CONTABO Y VERIFICADO (2026-11-03).
Se confirmo que la sala TVJJH1 habia sido cerrada y no existian salas en espera ni partidas activas. Se recreo exclusivamente el backend de Bingo.
Verificacion directa en proceso de produccion: LIVE_DEFAULT ["line","fourCorners","centralCross"].
TV y jugadores HTTP 200, Socket.IO HTTP 200, acceso administrativo no autorizado HTTP 401.
Backend, frontend y MongoDB healthy; los otros 48 contenedores sin diferencias.
Predeploy y postdeploy en /home/yoryi/bingo-new-room-modes-20261103/.

Imagen candidata: bingo-contabo-trial-020d654-backend:new-room-modes-20261103.
Overlay preparado: /home/yoryi/bingo-new-room-modes-20261103/images.yaml.
Version actual del backend: bingo-contabo-trial-020d654-backend:feedback-20261103.
Al desplegar, incluir los overlays anteriores (public-entry, music-mount, dance, feedback, tv-reveal) y el nuevo overlay al final. Actualizar solo backend, nunca mongo ni los demas contenedores.
