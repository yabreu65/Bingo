# Bingo Public QR Entry
Scope: Add explicit public player/TV entry routes and validate them in an isolated temporary Contabo project without changing the active Bingo router or shared Traefik static configuration.
Status: T1-T4 implemented; T5-T7 authorized after owner selected “Sí, autorizo ese alcance”; no production database access or main Bingo deployment.

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

### S8 — Current environment and delivery limits
> “No modificar el Traefik compartido globalmente.
> No detener contenedores existentes.
> No tocar MongoDB de producción.
> No abrir puertos adicionales.
> No modificar credenciales.
> No desplegar todavía los cambios en el Bingo principal.”
>
> “Primero presentar el plan exacto de aislamiento y los recursos que se crearían. Si el aislamiento es viable, solicitar autorización antes de crear el entorno temporal.”
>
> “Evitar auditorías generales y trabajo adicional innecesario.”

### S9 — Direct Contabo validation
> “Quiero probarlo directamente en el VPS Contabo, sin descargar Traefik localmente.”
>
> “1. Inspeccionar la configuración existente de Traefik y Docker en Contabo.
> 2. Determinar la forma mínima de crear un entorno temporal de prueba aislado.
> 3. Utilizar un router y hostname de prueba distintos de los utilizados por Bingo y los demás proyectos.
> 4. No conectar el entorno de prueba a la base de datos de producción.
> 5. No modificar el router de Bingo actualmente activo.
> 6. Reutilizar imágenes existentes cuando sea posible y evitar descargar componentes innecesarios.
> 7. Comprobar acceso público de jugadores, APIs de admisión, recursos estáticos, Socket.IO y protección administrativa.
> 8. Verificar que los demás servicios continúan funcionando.
> 9. Registrar los recursos creados para eliminarlos posteriormente.”

## Tasks
- T1 [S1-S2] route: frontend entry resolver for `/player/:code`, `/tv/:code`, `/organizer`, and safe legacy redirects; commit: `5936542`.
- T2 [S1-S2,S5-S6] route: frontend QR/TV URL generation and focused compatibility/capability tests; commit: `2e7fff0`.
- T3 [S3-S8] route: Bingo-only Traefik overlay with path/method allowlists, protected fallback, static routes, and Socket.IO rate limit; commits: `5ef9c75`, `4f172c1`. Risk: item 2 (selected public routers change the security boundary).
- T4 [S3-S8] route: reuse focused isolated HTTP, Socket.IO, capability, admin, TV, and Compose-routing suites; add only uncovered assertions and controlled-rollout instructions; commit: `2722856`.
- T5 [S1-S9] route: deploy a distinct temporary Contabo Compose project after explicit owner authorization, reusing available images and a fresh private Mongo replica set; commit: pending. Risk: items 2 and 5.
- T6 [S1-S9] route: verify public QR/player flow, admission APIs, static assets, Socket.IO without guest Authorization headers, protected organizer/admin, 24 same-IP clients, and baseline health of existing services; commit: pending. Risk: items 2 and 5.
- T7 [S8-S9] route: record runtime evidence and exact cleanup inventory; leave the temporary resources intact for later owner-directed cleanup; commit: pending. Risk: item 5.

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

### L3 — Branch and slice boundary
> The feature branch is based on local `main` commit `020d654`; T1 is `5936542`, T2 is `2e7fff0`, T3 is `5ef9c75` and `4f172c1`, and T4 is `2722856`. The branch inherited 13 commits beyond `origin/main`, and the original worktree had 104 dirty/untracked entries. The 4,150-line branch-total hook counts inherited history, not only this feature; T5 local verification evidence is recorded in commit `8ee0bcb`. Delivery strategy: treat `020d654..HEAD` as the local feature slice, stage only reviewed in-scope hunks, keep each high-risk Traefik change in its own commit, and do not publish the branch or inherited history.

### L4 — T3 verification status
> The structural Compose test passes 4/4 in the feature worktree and in a clean checkout of `4f172c1`. A static `docker compose config` merge of the current local trial files with synthetic environment values passed: BasicAuth fallback remains, backend/Mongo have no public Traefik labels, public network, or host ports, the UI router is GET/HEAD-only, and Socket.IO burst is 150. Docker is available but no local Traefik binary/image exists, and no image was pulled; live ingress/WebSocket behavior remains untested. No deployment or production database access occurred.

### L5 — T3 independent review and correction
> `gentle_review assess` marked the overlay high risk/item 2 and required an independent verifier. The first verifier found two actionable issues: the public UI router lacked GET/HEAD methods, and its structural test depended on pre-existing untracked Compose files. Parent reproduced RED (2/4), then corrected both in `4f172c1`; the test now uses a committed, explicitly test-only Compose fixture and passes 4/4 from a clean checkout. The first verifier's bare-root concern was a false positive: committed `main.jsx` redirects bare `/` to protected `/organizer` before mounting the SPA. Follow-up review marked S3-S7 PASS structurally/source-spot-check and noted that its own test run was not performed because it had no exact command authorization; the parent-run clean-checkout test and local merged-stack static validation passed. The fixture remains synthetic and does not replace live Traefik verification; the deployment Compose files are pre-existing untracked files and are not part of this feature commit.

### L6 — T4 test-harness map
> The existing isolated suite already covers HTTP admission/card assignment, role-bound player/host/TV Socket.IO joins, capability denials, TV-only actions, and room-state isolation in `backend/tests/u1IsolatedIntegration.test.js`; focused suites also exist for admission concurrency, player capabilities, host/admin routes, TV authorization, socket identity, and rate limiting. A parent spot-check confirmed `u1IsolatedIntegration.test.js` uses a disposable `MongoMemoryReplSet`, an ephemeral loopback HTTP server, and teardown cleanup. The public-access architecture doc is the appropriate rollout-document target. Reuse these suites and add no duplicate tests unless the run identifies a specific gap; shared-source-IP limits still cannot be proven through Traefik without runtime access.

### L7 — T4 access-suite and rollout evidence
> Ran the focused backend Jest command recorded in `docs/m5.4-public-access.md`: 8 suites and 81 tests passed. `u1IsolatedIntegration.test.js` used a disposable `MongoMemoryReplSet` and loopback HTTP/Socket.IO server. Existing tests cover admission/card assignment, capability denials, host/admin protection, TV authorization, socket identity, and event limits; no duplicate backend test was added. `docs/m5.4-public-access.md` now records exact public route/method allowlists, protected fallback, pre-deployment validation, smoke/rollback gates, and the explicit not-deployed/runtime-unverified status; this documentation/evidence slice is commit `2722856`. The pre-existing unrelated hunk in the same documentation file remains unstaged. Actual Traefik same-IP and WSS behavior remain unverified.

### L8 — T5 final verification and remaining decision
> The feature slice from base `020d654` contains the explicit routing, overlay, tests, rollout documentation, and verification evidence; `git diff --check` passes for the committed slice and current worktree. The Compose structural test passed 4/4 in a clean checkout of `4f172c1`; the isolated backend access command passed 8 suites/81 tests; focused frontend tests (8/8 and 14/14) and frontend build passed in T1/T2, with no frontend code changed afterward. The current local merged trial config also passed a static Compose merge check using synthetic environment values: Basic Auth fallback remained, backend/Mongo had no public labels/network/host ports, UI was GET/HEAD-only, and burst was 150. `gentle_review` assessed T3 as high risk/item 2; independent review's S3-S7 checks passed after the correction. The review did not run the clean test due lack of exact command authorization, but the parent did run it and observed PASS. Live Traefik matching, Basic Auth challenge, source-IP rate behavior, and WSS remain unverified; no image was pulled or deployment performed. The worktree retains extensive pre-existing dirty/untracked entries and no staged paths; only reviewed feature files were committed, while a pre-existing hunk in `docs/m5.4-public-access.md` remains unstaged. Risk: item 2 (public router rules change the security boundary). The local-Traefik verification path was superseded by the owner's direct-Contabo strategy. T5-T7 now cover the owner-authorized isolated VPS verification; no local Traefik image was pulled. T5-T7 evidence and work-unit commits are pending.

### L9 — Contabo validation request
> “Gentle Shell, cambiamos la estrategia de validación del acceso público de Bingo Bailable.
>
> Quiero probarlo directamente en el VPS Contabo, sin descargar Traefik localmente.
>
> OBJETIVO:
> Validar el ingreso de jugadores mediante QR sin Basic Auth, manteniendo protegidos el organizador y la administración.
>
> PROCEDIMIENTO:
>
> 1. Inspeccionar la configuración existente de Traefik y Docker en Contabo.
> 2. Determinar la forma mínima de crear un entorno temporal de prueba aislado.
> 3. Utilizar un router y hostname de prueba distintos de los utilizados por Bingo y los demás proyectos.
> 4. No conectar el entorno de prueba a la base de datos de producción.
> 5. No modificar el router de Bingo actualmente activo.
> 6. Reutilizar imágenes existentes cuando sea posible y evitar descargar componentes innecesarios.
> 7. Comprobar acceso público de jugadores, APIs de admisión, recursos estáticos, Socket.IO y protección administrativa.
> 8. Verificar que los demás servicios continúan funcionando.
> 9. Registrar los recursos creados para eliminarlos posteriormente.
>
> RESTRICCIONES:
> No modificar el Traefik compartido globalmente.
> No detener contenedores existentes.
> No tocar MongoDB de producción.
> No abrir puertos adicionales.
> No modificar credenciales.
> No desplegar todavía los cambios en el Bingo principal.
>
> Primero presentar el plan exacto de aislamiento y los recursos que se crearían. Si el aislamiento es viable, solicitar autorización antes de crear el entorno temporal.
>
> Evitar auditorías generales y trabajo adicional innecesario.”

### L10 — Authorization
> “Sí, autorizo ese alcance”
>
> The selected scope includes only the distinct temporary test project, its new dynamic router/possible ACME certificate, isolated test data and test-only secrets, with no edits to shared Traefik static configuration, existing routers, services, ports, or existing credentials.

### L11 — Read-only Contabo preflight
> Shared Traefik v3.7 is running on the existing HTTP/HTTPS listeners with Docker `exposedByDefault=false`, HTTPS redirection, the existing Let's Encrypt HTTP-challenge resolver, and network `pawtech_public`. The current temporary Bingo frontend/backend/Mongo are healthy; the existing Bingo trial router remains untouched. Docker reports 45 containers total, 23 running, 22 not running, and none marked unhealthy. Required backend, Nginx, and Mongo images are already present. The proposed test hostname resolves to the VPS and has no router-label collision. Inspection did not read secrets or logs and changed no remote resources.

### L12 — Test topology and client constraints
> `backend/services/roomAdmission.js` uses MongoDB transactions and returns HTTP 503 for standalone MongoDB, so the isolated test database must be a single-node replica set. The existing virtual-player fleet already provides exactly 24 players, but its Contabo mode is pinned to the prior trial hostname and adds Basic Auth to guest requests. Keep its source unchanged; use it through a one-off test adapter that targets the approved test hostname without guest Authorization headers, while using the existing trial Basic Auth only to create the isolated test room. This preserves the requested no-Basic-Auth guest proof and avoids changing the existing runner contract.
