# Bingo Public QR Entry
Scope: Add explicit public player/TV entry routes and preserve the organizer's Basic Auth boundary for the temporary Bingo deployment.
Status: Authorized implementation; no production database access or Contabo deployment.

## Specs

### S1 — Player flow and organizer protection
> “Los jugadores entran mediante QR sin Basic Auth, mientras el organizador mantiene su protección.”
>
> “Los jugadores que escanean el QR NO deben introducir usuario ni contraseña de Basic Auth.
>
> Flujo esperado:
> QR → ingresar nombre → seleccionar cartón → jugar.
>
> El organizador debe conservar su autenticación y sus capacidades administrativas.”

### S2 — Explicit frontend paths and safe legacy compatibility
> “1. No depender de los parámetros ?room= o ?tv= para separar routers de Traefik.
>
> 2. Analizar e implementar rutas explícitas de frontend para jugador y TV, manteniendo compatibilidad con los enlaces existentes cuando sea seguro.”

### S3 — Organizer and administration remain protected
> “3. Mantener protegida la entrada del organizador, creación de salas, configuración y operaciones administrativas.”
>
> “4. Evitar que un invitado pueda crear salas, administrar partidas o acceder a funciones protegidas.”
>
> “No eliminar globalmente Basic Auth ni abrir el backend directamente a Internet.”

### S4 — Narrow public REST surface
> “4. Publicar solamente los endpoints necesarios de admisión, selección de cartón, reconexión y autorización de TV.”

### S5 — Public static resources
> “5. Permitir los recursos estáticos necesarios para cargar las vistas públicas.”

### S6 — Keep capability checks
> “3. Reutilizar el mecanismo de admisión y capacidades que ya existe en Bingo.
>
> 6. Mantener la validación de capacidades de jugador, anfitrión y TV en cada operación sensible.”
>
> “5. Mantener la autorización independiente de TV.”

### S7 — Public Socket.IO controls
> “7. Revisar las conexiones Socket.IO públicas y aplicar controles razonables que no bloqueen a 24 bots y jugadores detrás de una misma IP.”
>
> “8. Validar mediante pruebas aisladas:
>    - QR sin contraseña.
>    - Ingreso y selección de cartón.
>    - Conexión Socket.IO.
>    - Organizador protegido.
>    - Acciones administrativas rechazadas sin autorización.
>    - TV con su autorización independiente.”

### S8 — Scope, environment, and delivery limits
> “6. Mantener protegidos MongoDB, servicios internos y los demás proyectos de Contabo.
>
> RESTRICCIONES:
> No modificar servicios de otros proyectos.
> No publicar puertos del backend.
> No eliminar globalmente Basic Auth.
> No consultar ni modificar la base de producción.
> No hacer refactorizaciones generales.
> No desplegar todavía en Contabo.
>
> ENTREGA:
> Implementación mínima, pruebas dirigidas PASS/FAIL y cambios necesarios para desplegar de manera controlada.
>
> No ampliar el alcance a nuevas funcionalidades de Bingo.”

## Tasks
- T1 [S1-S2] route: frontend entry resolver for `/player/:code`, `/tv/:code`, `/organizer`, and safe legacy redirects; commit: pending.
- T2 [S1-S2,S5-S6] route: frontend QR/TV URL generation and focused compatibility/capability tests; commit: pending.
- T3 [S3-S8] route: Bingo-only Traefik overlay with path/method allowlists, protected fallback, static routes, and Socket.IO rate limit; commit: pending. Risk: item 2 (selected public routers change the security boundary).
- T4 [S3-S8] route: isolated HTTP, Socket.IO, TV, and Compose-routing tests plus controlled-deployment instructions; commit: pending.
- T5 [S1-S8] route: run focused verification, inspect final diff, and record PASS/FAIL evidence; commit: pending.

## Log

### L1 — Original request
> “Gentle Shell, quiero corregir la experiencia de ingreso de jugadores de Bingo Bailable.
>
> DECISIÓN FUNCIONAL:
> Los jugadores que escanean el QR NO deben introducir usuario ni contraseña de Basic Auth.
>
> Flujo esperado:
> QR → ingresar nombre → seleccionar cartón → jugar.
>
> El organizador debe conservar su autenticación y sus capacidades administrativas.
>
> TAREA:
> 1. Revisar exclusivamente las rutas Traefik, frontend, API pública de admisión y Socket.IO del despliegue temporal.
> 2. Definir e implementar la separación mínima entre acceso público de jugadores y acceso protegido del organizador.
> 3. Reutilizar el mecanismo de admisión y capacidades que ya existe en Bingo.
> 4. Evitar que un invitado pueda crear salas, administrar partidas o acceder a funciones protegidas.
> 5. Mantener la autorización independiente de TV.
> 6. Mantener protegidos MongoDB, servicios internos y los demás proyectos de Contabo.
> 7. Ejecutar pruebas dirigidas del ingreso por QR, cartón y WebSocket sin Basic Auth, y comprobar que el acceso administrativo no queda expuesto.
>
> No eliminar globalmente Basic Auth ni abrir el backend directamente a Internet.
> No realizar refactorizaciones generales.
> No alterar otros servicios.
>
> Primero entregar la propuesta de rutas y controles de acceso para revisión antes de modificar Traefik o desplegar.
>
> OBJETIVO:
> Que cualquier invitado con el QR pueda entrar a Bingo sin contraseña del servidor, manteniendo segura la administración.”

### L2 — Approved adjustment
> “Gentle Shell, apruebo la propuesta de acceso público de Bingo Bailable con los siguientes ajustes.
>
> OBJETIVO:
> Los jugadores entran mediante QR sin Basic Auth, mientras el organizador mantiene su protección.
>
> IMPLEMENTACIÓN:
>
> 1. No depender de los parámetros ?room= o ?tv= para separar routers de Traefik.
>
> 2. Analizar e implementar rutas explícitas de frontend para jugador y TV, manteniendo compatibilidad con los enlaces existentes cuando sea seguro.
>
> 3. Mantener protegida la entrada del organizador, creación de salas, configuración y operaciones administrativas.
>
> 4. Publicar solamente los endpoints necesarios de admisión, selección de cartón, reconexión y autorización de TV.
>
> 5. Permitir los recursos estáticos necesarios para cargar las vistas públicas.
>
> 6. Mantener la validación de capacidades de jugador, anfitrión y TV en cada operación sensible.
>
> 7. Revisar las conexiones Socket.IO públicas y aplicar controles razonables que no bloqueen a 24 bots y jugadores detrás de una misma IP.
>
> 8. Validar mediante pruebas aisladas:
>    - QR sin contraseña.
>    - Ingreso y selección de cartón.
>    - Conexión Socket.IO.
>    - Organizador protegido.
>    - Acciones administrativas rechazadas sin autorización.
>    - TV con su autorización independiente.
>
> RESTRICCIONES:
> No modificar servicios de otros proyectos.
> No publicar puertos del backend.
> No eliminar globalmente Basic Auth.
> No consultar ni modificar la base de producción.
> No hacer refactorizaciones generales.
> No desplegar todavía en Contabo.
>
> ENTREGA:
> Implementación mínima, pruebas dirigidas PASS/FAIL y cambios necesarios para desplegar de manera controlada.
>
> No ampliar el alcance a nuevas funcionalidades de Bingo.”
