# Bingo Bailable — Auditoría y rediseño responsive del organizador (2026-11-03)

## Objetivo
Reorganizar la pantalla del organizador en escritorio, tableta y teléfono sin alterar la lógica del Bingo, la gestión de cartones, la TV, la música, el karaoke ni la seguridad.

## Cambios implementados
- Encabezado contenido y simétrico: título, sala, Centro de Administración y estado.
- Indicadores alineados en 4 columnas para escritorio y 2 columnas para tabletas/móviles.
- Número actual y controles del sorteo antes de los retos.
- Controles del juego en 4 columnas para >=768px y 2 columnas para <768px.
- Ocho acciones activas de retos en filas de 4 o 2 botones, sin dejar huecos y sin el botón de canto congelado (karaoke sigue disponible).
- Se sustituyó el falso valor fijo "Playlist A" por "Repertorio: General/Playlist asignada", según la configuración de la sala.
- Navegación móvil accesible: Juego, Retos, Jugadores y Acceso; los paneles permanecen montados, solo se muestran por CSS.
- Banner móvil de reto activo que permite acceder a la sección Retos.
- El Centro de Administración dispone de un lienzo propio cuando está abierto; no se amontona junto a los controles del sorteo.
- Acceso con QR, gestión de jugadores y configuraciones conservan callbacks y funcionalidades.
- Estilos adicionales para formularios administrativos, pestañas y separación en móviles.
- Botones deshabilitados con menor opacidad y sin apariencia de disponibles.

## Auditoría de las vistas
Se inspeccionaron las rutas y vistas de App: portada, selección de modo, creación/acceso de sala, ingreso por QR, selección de cartón, organizador, jugador, TV, registro y juego individual. También se revisaron las reglas CSS móviles de QuickJoin, RoomSetup, CardSelection, PlayerCardView, TVDisplay y AdminCenter. La intervención visual fue deliberadamente focalizada en el organizador, que era la pantalla con mayor densidad y problemas de simetría. La nieve ya se había eliminado de todas las vistas en el despliegue anterior.

## Evidencias técnicas
- Vitest frontend completo: 20 archivos y 72/72 pruebas aprobadas.
- Tests nuevos del organizador: 2/2, navegación en 4 secciones, orden de paneles, conservación de callbacks y botones esenciales.
- ESLint dirigido, git diff --check y compilación Vite: PASS.
- Auditoría de Chrome real con datos de prueba locales (sin crear una sala en producción): 390, 768, 1024, 1440 píxeles.
- Sin desbordamiento horizontal a los cuatro anchos. Controles 2 columnas a 390px y 4 a anchos >=768px. Retos: 2 columnas visibles a 390px y 4 a anchos mayores.
- Cambio de pestaña móvil funcional, panel Juego oculto cuando Retos está seleccionado y viceversa.
- Centro de Administración móvil: abierto, pestañas en 2 columnas, sin desbordamiento horizontal.
- Prueba de smartphone y capturas realizadas en un navegador automatizado con sesión ficticia; todavía debe hacerse aceptación visual humana con credenciales de organizador reales.

## Producción
- Imagen: bingo-contabo-trial-020d654-frontend:responsive-20261103
- Despliegue: /home/yoryi/bingo-organizer-responsive-20261103/images.yaml
- Fuente multimedia de la TV conservada como montaje de solo lectura.
- Sitio principal y rutas TV/jugador HTTP 200; Socket.IO HTTP 200; ruta /organizer sin credenciales HTTP 401.
- Efectos aplauso.mp3 y burro.mp3 HTTP 206.
- Bundle en frontend remoto contiene la navegación nueva.
- 49 contenedores verificados: 48 ajenos al frontend no cambiaron; backend y MongoDB saludables.
- Respaldo de inventario: predeploy.json y postdeploy.json dentro de la carpeta de despliegue.
- Rollback: omitir overlay de responsive y recrear exclusivamente frontend con imagen previa bingo-contabo-trial-020d654-frontend:no-snow-20261103. No tocar MongoDB ni volúmenes.

## Estado Git
Los cambios se conservan en el árbol de trabajo local, sin commit ni PR. El repositorio contiene muchas modificaciones anteriores no relacionadas; no se hizo un commit mezclado que pudiera introducir cambios ajenos. Conviene ordenar esa rama por separado antes de sincronizar con GitHub.

## Pendiente
- Aceptación visual funcional con sala real: probar Juego, Retos, Jugadores, Acceso y Centro de Administración en teléfono; comprobar que el organizador puede seguir operando el sorteo mientras navega por las secciones.
- Revisión visual detallada de las otras pantallas en dispositivos reales si el usuario encuentra problemas específicos. Las principales reglas responsive se revisaron estáticamente, pero no se ejecutaron capturas autenticadas completas de todas ellas.
