# Bingo Public QR Entry
Scope: Add explicit public player/TV entry routes and validate them in an isolated temporary Contabo project without changing the active Bingo router or shared Traefik static configuration.
Status: T1-T7 complete. The isolated Contabo stack remains running with no host-published ports, private internal app/database networks, and frontend-only shared ingress. Its test room/session and resources are retained for later owner-directed cleanup. Music playback remains out of scope. The failed partial staging tree remains untouched. No production database access or main Bingo deployment occurred.

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
- T5 [S1-S9] route: deploy a distinct temporary Contabo Compose project after explicit owner authorization, reusing available images and a fresh private Mongo replica set; commit: `0a34a32` (Compose definition), runtime evidence L20: `b34ed91`. Music playback is out of scope. Risk: items 2 and 5.
- T6 [S1-S9] route: verify public QR/player flow, admission APIs, static assets, Socket.IO without guest Authorization headers, protected organizer/admin, 24 same-IP clients, and baseline health of existing services; runtime result L21, evidence commit: `b34ed91`. Risk: items 2 and 5.
- T7 [S8-S9] route: record runtime evidence and exact cleanup inventory; leave the temporary resources intact for later owner-directed cleanup; evidence commit: `b34ed91`. Risk: item 5.

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

### L13 — T5 local verification and blocker
> Commit `0a34a32` records the isolated Compose definition and this task-spec update as a separate work unit (301 authored changed lines). The frontend production build passed; local `docker compose config --quiet`, structural assertions, focused diff checks, and the remote router-name collision check passed. The Compose assertions confirmed four services, no host-published ports, cached-image-only policy, internal DB/application networks, frontend-only shared ingress, replica-set MongoDB, unique router labels, the existing BasicAuth middleware reference, public route method/path allowlists, and the 50/150 Socket.IO limiter. No remote resources were created.
>
> `gentle_review assess` first used the session cwd outside the repository; the scoped retry then failed because the dirty worktree contains untracked files requiring an explicit declaration. No candidate was assessed. The independent verifier could not be launched because this repository is not a registered worktree of the session's current Git clone. T5 is blocked until the owner authorizes a read-only verifier to access this independent repository. The branch-total hook warning includes inherited history; do not publish the branch. Risk: items 2 and 5.

### L14 — Independent T5 verification
> The independent verifier covered S1-S9. It passed S2-S5, S7, and S8 structurally; S1, S6, and S9 remain unverified pending runtime. It confirmed the public/static/API/socket allowlists, protected fallback, 50/150 Socket.IO limiter, private app/database networks, frontend-only `pawtech_public` attachment, no host-published ports, and replica-set Mongo configuration. It identified that the declared bind inputs (`secrets/mongo-keyfile`, `mongo-bootstrap.js`, `frontend-dist`, and `nginx.conf`) must be staged before Compose can start, and that deployment must pin `--project-name bingo-qr-entry-validation-20261103` to prevent volume-name reuse. The parent separately confirmed the proposed host resolves to the VPS and has no current router-label collision. The verifier performed no SSH, secret/log reads, Compose operations, or remote changes.

### L15 — Partial staging failure
> The authorized staging command exited 1 after 12m19s: macOS tar emitted extended-header warnings and could not visit `music/karaoke`. The remote staging directory now contains `compose.yaml`, `nginx.conf`, `mongo-bootstrap.js`, and an incomplete frontend bundle (139 files, 481,403,452 bytes; 55 of 71 music files). AppleDouble sidecar files were also transferred. Do not start Compose from this bundle. Post-transfer read-only health snapshot: 45 containers total, 23 running, none unhealthy or restarting; `/tmp` has 67,219,488 KB free. No containers, networks, volumes, or routers were created.

### L16 — Owner selects entry-only media scope
> “Use an entry-only bundle.” Stage a clean copy in a separate remote directory without `/music/karaoke`; leave the partial original staging directory untouched. Validate QR/player/TV entry, APIs, protected routes, and the 24-client guest flow; do not claim karaoke playback was validated.

### L17 — Bound the entry-only bundle
> Excluding only `/music/karaoke` still leaves about 1.05 GB of other music assets. To honor the selected entry-only scope and skip music playback, the clean bundle omits the full `/music/` tree. The remaining build is 39 files / 1,186,328 bytes, including the page, JS/CSS, and small sound assets. Player/TV route rendering remains in scope; all music playback is excluded.

### L18 — Entry-only staging passed
> A clean remote staging directory at `/tmp/bingo-qr-entry-validation-20261103-entry-only` now contains the Compose file, Nginx config, Mongo bootstrap script, and all 39 entry-only frontend files (1,186,328 bytes). The full `/music/` tree and AppleDouble sidecars are absent. The previous partial directory remains untouched. No Docker containers, networks, volumes, or Traefik routers existed at this point.

### L19 — Remote pre-start checks passed
> Fresh test-only Mongo/JWT secrets and the Mongo keyfile were created in the active staging directory with restrictive permissions; values were not printed or recorded. The remote Compose config passed in quiet mode with explicit project name, cached-image checks passed without pulls, the existing test BasicAuth middleware reference was confirmed, `pawtech_public` exists, and no project containers/private networks/volumes were present. A pre-start container-state baseline was saved. Temporary Mongo helper containers were auto-removed.

### L20 — Isolated stack started and independently inspected
> The background launch session ended with SSH exit 255 (`Connection reset by peer`), so its final inventory/summary step did not complete. A separate read-only Docker inspection confirmed the actual stack is ready: four project containers; Mongo and backend healthy; Mongo bootstrap exited 0; frontend running; zero host-published ports; both project networks are internal; only frontend is attached to `pawtech_public`; the four expected Traefik router labels and two project volumes exist. The saved pre-start snapshot comparison reported no existing-service degradation. No logs, environment values, credentials, or capabilities were read. No cleanup was performed. T5 is complete; public HTTP/TLS and 24-client runtime checks remain pending.

### L21 — Public QR, TV, protection, and shared-IP runtime checks
> On the isolated HTTPS hostname, player and TV routes plus the referenced static JavaScript returned 200 without Authorization. The existing Bingo trial root and test organizer route returned 401; the organizer response included a Basic challenge. Unauthenticated room creation and config PATCH returned 401; Basic Auth alone on config returned 403. Authorized creation of one isolated room succeeded; its public room read returned 200 without capability/hash fields. Host-authorized TV-link issue, no-Basic-Auth TV claim, and no-Basic-Auth session renewal all succeeded. The real room's player/TV views returned 200. A same-source-IP fleet admitted and connected all 24 guests without guest HTTP or Socket.IO Authorization headers, remained connected for the 5-second stability window, then closed cleanly. The room remained in `waiting`; no game was started. The existing trial still returned 401. Post-run read-only Docker comparison found 49 total containers: 45 existing containers matched the pre-start status/health/restart baseline exactly, and four test containers were present (Mongo/backend healthy, frontend running, bootstrap exited 0); no existing container was unhealthy or restarting. The first comparison attempt used the wrong baseline field names and reported a false delta; the corrected comparison is unchanged. The runner also printed a tautological `UNAUTHENTICATED_CREATE_NO_LOCATION=true` placeholder; it is excluded from evidence. No credentials, room codes, capabilities, headers, hashes, or logs were recorded. Test room/session state remains in the isolated test DB; no cleanup was performed. Music/karaoke remains out of scope.

### L22 — Runtime evidence slice and delivery boundary
> Commit `b34ed91` contains the two feature evidence files only: this task record and `odd/results/bingo-qr-entry-validation-20261103/resources.md` (80 insertions, 4 deletions); pre-commit checks passed. The hook's 4,511-line/22-commit count is branch-total history since `origin/main`, including inherited commits; the feature boundary remains base `020d654`, and only reviewed feature evidence paths were staged. This is the final T6/T7 evidence slice. No push or publish occurred; temporary resources remain for later owner-directed cleanup.
