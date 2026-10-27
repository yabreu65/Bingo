# Bingo U1 Security Closeout
Objective: Close player-identity spoofing and selected U1 hook findings while preserving the approved staged candidate unchanged.
Strategy/Risk: Issue 32-byte guest capabilities bound to room/player, verify owner claims atomically, scrub all public serialization; security, concurrency, and legacy-session compatibility are high risks.

## Specs
- **S1 — Per-player capability:** “propón e implementa credencial opaca por jugador invitado (random 32 bytes, solo hash persistente con roomId/playerId; nunca exponer hash/secreto en consultas públicas, broadcasts, logs, room.populate players ni URL). Emitir player capability únicamente al crear/join para ese jugador y conservarla en sesión local cliente; exigir en join-room invitados no-host, select-card HTTP y operaciones que deben verificar propietario”
- **S2 — Host and owner identity:** “Usa hostCapability ya existente para host en lugar de una nueva vía privilegiada.” “claim-bingo debe comparar socket.roomCode/socket.playerId/socket.id con propietario actual atómico en BD”
- **S3 — Fail-closed compatibility:** “Diseñar fail closed para legacy sin credencial, explicar compatibilidad sin mutar BD real.” Review `/:code/reconnect` and equivalent identity paths so they cannot bypass owner checks.
- **S4 — Required security regressions:** “Añadir tests RED->GREEN que prueben jugador de sala B no cambia sala A; otro invitado de la misma sala no cambia tarjeta, no reclama BINGO, no secuestra socket; credencial errónea y replay de socket viejo rechazados; host y TV legítimos preservados; ningún secreto se divulga.”
- **S5 — Bounded hook hardening:** “Revisar también bugs del hook: guard de scheduleRoomInterval (ya existe en main, arreglar acotado), error.message HTTP (respuestas genéricas registrando causa servidor), inputs críticos y WaitingRoom flujo host/secret, sin refactor masiva.”
- **S6 — Preserve approved boundary:** “Mantén el candidato U1 staged INTACTO durante el diagnóstico y crea tus correcciones como diff UNSTAGED hasta tener pruebas y una propuesta de review nativo; si Git requiere staged exact set en nueva revisión, detén y reporta plan.” The original hold on RDD/commit is superseded by the latest user-authorized final-closure mission in S8-S11; preserve the staged snapshot until the exact combined candidate is ready.
- **S7 — Verification and safety:** “ejecuta tests focalizados, backend total, frontend total, lint, build, diff checks, smoke de Mongo efímero si es posible; si hay cambio de esquema, sin migrar datos reales.” No touch real `bingo-navidad`, `.env`, music, push, merge, deploy, or U2.
- **S8 — Expanded final security audit:** “Revisa todo el flujo, no solamente los tests existentes.” “No basta verificar que un `playerId` exista: comprueba pertenencia, identidad, credencial y autoridad para la operación.” “No dejes una vulnerabilidad de autorización conocida simplemente porque ya existía en `main`.” The audit must cover organizer, guest players, reconnects, socket actions, REST writes, voting/tie-break, challenge/trivia, bingo claims, TV/manual player behavior, and secret disclosure exactly as described in the latest user request. TV authorization decision (verbatim): “Dedicated TV capability (Recommended)”.
- **S9 — Required isolated integration:** “Prepara una prueba de integración HTTP + Socket.IO + MongoDB completamente aislado.” “No reutilices ninguna base existente ni realices instalaciones o cambios de infraestructura riesgosgos.” Verify the user's 14 numbered sequence (create host; two guests; distinct cards; TV; start/pause; host/player reconnect; reject another player's card and forged bingo; cross-room rejection; state sync; no public credential leak; host retains control; TV/tie-break compatibility; clean socket/process teardown) using only resources created by the test.
- **S10 — Fresh native review and delivery gate:** “Una aprobación del candidato anterior no autoriza automáticamente el nuevo candidato.” Inspect installed Gentle Pi documentation, review each bounded candidate slice on its own fresh valid native lineage, preserve bindings and follow provider transitions, then run the normal GGA hook before committing that slice locally on the requested feature branch. No bypass, push, merge to main, deploy, or U2.
- **S11 — U1 closure report:** Report exact security changes and role flows tested, test counts, isolated Mongo outcome, RDD/GGA outcomes, commit SHA/branch/Git state, production-data safety, and any residuals. Do not claim “U1 CERRADA LOCALMENTE” without every required gate.
- **S12 — Recording authorization:** “Include recordings in U1” — “Extend scope to secure recording upload and destructive operations, with tests and frontend compatibility.”
- **S13 — Native-budget split:** “Authorize chained local commits” — “Split into smaller reviewable candidate slices, run fresh native review and normal GGA hook for each, and use multiple local commits.”
- **S14 — Reversible candidate isolation:** “Authorize reversible isolation” — “Back up and verify the exact current candidate locally, then isolate/review/commit bounded slices on the requested branch and restore/verify remaining changes between slices.”

## Tasks
- T1 — Map ownership, read, mutation, serialization, and reconnect surfaces; freeze index boundary — S1-S3,S6 — inline — done; tmux `bingo`, branch and 20-path staged digest recorded; hook findings classified; no repo index changes. Commit: none.
- T2 — Add backend guest capability issue/hash/storage/redaction and capability-gated select-card with RED/GREEN tests — S1,S3,S4 — inline — done; focused HTTP boundary suite passed 5/5. Commit: pending.
- T3 — Preserve guest capability in client session; bind socket join, claim, reconnect, sync, verify-room, mark/update, player REST routes, challenge/vote identities, and tie-break votes to current owner; preserve TV/manual-player flows — S1-S4 — inline — done; focused backend/frontend suites green. Commit: pending.
- T4 — Add bounded schedule, safe-error, critical-input, and WaitingRoom compatibility fixes — S5 — inline — done; focused timer 1/1, HTTP error/game-ID/manual-card 13/13, legacy WaitingRoom 2/2. Commit: pending.
- T5 — Run requested focused/full checks and ephemeral smoke; verify exact staged snapshot remains unchanged — S4,S6,S7 — inline — done for prior closeout; backend 10 suites/130 tests, frontend 6 files/12 tests, ESLint, Vite build, and diff checks passed; staged snapshot unchanged. Mongo smoke not run at that checkpoint. Commit: none.
- T6 — Audit exact integrated candidate for all organizer/player/TV/challenge/voting/REST/socket identities, event compatibility, and secret exposure; implement a dedicated least-privilege TV capability and fix evidenced U1 blockers — S8 — inline — done; focused authorization/disclosure suites pass, and the isolated HTTP/Socket.IO/Mongo sequence validates role boundaries and secret redaction. Commit: pending.
- T7 — Build/run the full HTTP + Socket.IO + isolated Mongo flow and teardown test resources — S9 — inline — done; `u1IsolatedIntegration.test.js` passes 1/1 against a unique MongoMemoryServer database on local mongod v8.2.1 and covers all 14 requested flows plus TV tie-break compatibility. Commit: pending.
- T8 — Rerun all focused/full tests, lint, build, and diff checks after audit/integration fixes — S7-S9 — inline — done; backend 13 suites/153 tests, frontend 8 files/18 tests, ESLint, Vite build, tracked and untracked whitespace checks pass. Commit: pending.
- T9 — Inspect native review documentation and execute a fresh review of the entire integrated candidate — S10 — inline — dropped; native START preflight returned `lens_context_budget_exceeded`, and the user authorized chained smaller candidates instead. Commit: none.
- T10 — Run the normal GGA hook before each fresh-approved local slice commit on the requested branch — S10-S14 — inline — pending. Commit: pending.
- T12 — Create and hash-verify a local backup of the exact staged, unstaged, and untracked candidate, then partition it into bounded path-disjoint review slices — S13-S14 — inline — done; backup and slice map recorded in L28-L29. Commit: none.
- T13 — Verify the final local commit chain, branch, staged/working-tree state, and unchanged main/origin/main — S10-S14 — inline — pending. Commit: pending.
- T14 — Freshly review, verify, hook, and commit the original staged host-capability candidate (20 paths) — S10-S14 — inline — blocked; two identical fresh INSPECT attempts failed pre-native with `unrelated target status is inconsistent`, with no mutation or authority. The provider marked one retry safe; that retry repeated the failure. Stop all further retries pending a repaired native status path or explicit authorization for a specific safe diagnostic. Commit: pending.
- T21 — Restore and verify the exact original staged/unstaged candidate from the local verified backup after the native status failure — S14 — inline — done; restored all 35 tracked worktree snapshots and verified their bytes, modes, and symlinks. The 19 untracked paths remain (18 snapshots unchanged; the task document contains the intentional log updates). Staged/unstaged/combined patch hashes match the saved evidence. Current raw `.git/index` SHA is `96bb4391be2980d2872bf7c3872271e762e76645f859d5cc853c75ce7cf866b3`; its 194 logical entries and all extensions match the saved index, with 35 stat metadata entries different under the user's L37 choice. Branch and HEAD unchanged; both diff checks pass. Commit: none.
- T15 — Freshly review, verify, hook, and commit guest/player capability issuance, room REST authorization, capability hashing, and public-data filtering — S2-S3,S10-S14 — inline — pending. Commit: pending.
- T16 — Freshly review, verify, hook, and commit socket ownership/reconnect checks plus frontend capability propagation and TV handoff/display — S3,S8,S10-S14 — inline — pending. Commit: pending.
- T17 — Freshly review, verify, hook, and commit game/challenge/voting authorization, trivia redaction/scoring, and music-control boundaries — S3-S6,S10-S14 — inline — pending. Commit: pending.
- T18 — Freshly review, verify, hook, and commit recording upload/deletion authorization with frontend credentials and tests — S12-S14 — inline — pending. Commit: pending.
- T19 — Freshly review, verify, hook, and commit the isolated end-to-end regression and final closeout evidence — S7-S14 — inline — pending. Commit: pending.
- T11 — Require a room-bound host capability or active-performer player capability before recording upload; derive room/game/player attribution from persisted state; require owner capability or room-host authority before deletion; preserve player and organizer recording flows with functional tests — S12 — inline — done; focused backend 3 suites/34 tests and frontend 1 file/2 tests pass. Commit: pending.

## Log
- **L1 (latest user request, verbatim):** MISIÓN PM AUTORIZADA — BINGO U1 SECURITY CLOSEOUT, MISMA sesión tmux 'bingo', MISMA rama fix/local-stabilization-20261022. Ejecuta trabajo, no solo plan. Situación: 20 archivos del candidato U1 aprobados por RDD siguen STAGED, HEAD=main=origin/main=05505ec; hook GGA rechazó commit con findings reales preexistentes y Codex STATUS FAILED; OpenCode tuvo UnknownError. NO repetir commit ni saltar GGA; no push/merge/deploy/U2, no tocar Mongo real bingo-navidad ni .env ni music, no abrir otra sesión Pi. Prioridad S1: resolver a fondo (no solo checks aparentes) dos fallos graves: 1) claim-bingo backend/socket/handlers/bingoHandlers.js acepta playerId arbitrario, puede pausar/cantar por otros, 2) POST /:code/select-card backend/routes/roomRoutes.js acepta playerId de otra sala y, dentro de sala, permite usurpar identidad. Debes asegurar identidad real del jugador: actualmente /join devuelve solo ID y join-room acepta playerId; propón e implementa credencial opaca por jugador invitado (random 32 bytes, solo hash persistente con roomId/playerId; nunca exponer hash/secreto en consultas públicas, broadcasts, logs, room.populate players ni URL). Usa hostCapability ya existente para host en lugar de una nueva vía privilegiada. Emitir player capability únicamente al crear/join para ese jugador y conservarla en sesión local cliente; exigir en join-room invitados no-host, select-card HTTP y operaciones que deben verificar propietario (claim-bingo debe comparar socket.roomCode/socket.playerId/socket.id con propietario actual atómico en BD), y revisar /:code/reconnect y otros caminos equivalentes para que no permitan bypass. Diseñar fail closed para legacy sin credencial, explicar compatibilidad sin mutar BD real. Añadir tests RED->GREEN que prueben jugador de sala B no cambia sala A; otro invitado de la misma sala no cambia tarjeta, no reclama BINGO, no secuestra socket; credencial errónea y replay de socket viejo rechazados; host y TV legítimos preservados; ningún secreto se divulga. Revisar también bugs del hook: guard de scheduleRoomInterval (ya existe en main, arreglar acotado), error.message HTTP (respuestas genéricas registrando causa servidor), inputs críticos y WaitingRoom flujo host/secret, sin refactor masiva. No asumir que problemas preexistentes son inocuos; priorizar vulnerabilidades reales con pruebas. Mantén el candidato U1 staged INTACTO durante el diagnóstico y crea tus correcciones como diff UNSTAGED hasta tener pruebas y una propuesta de review nativo; si Git requiere staged exact set en nueva revisión, detén y reporta plan. Control de alcance: primero documenta estrategia breve y riesgos, luego implementa y ejecuta tests focalizados, backend total, frontend total, lint, build, diff checks, smoke de Mongo efímero si es posible; si hay cambio de esquema, sin migrar datos reales. No ejecutar RDD de nuevo ni hacer commit hasta que revisemos el nuevo candidato; guarda evidencia de hallazgos del hook con clasificación preexistente vs nuevo, y no desactives controles. Al terminar, resumen técnico, pruebas, archivos, riesgos restantes y estado Git. Tú ejecutas; consulta solo si necesitas una decisión realmente bloqueante de seguridad.
- **L2 — Hook findings and baseline classification:** GGA log inspection confirmed Codex emitted `STATUS: FAILED` twice with findings, followed by OpenCode `UnknownError` twice. Diff against `main=05505ec` shows claim-bingo, select-card, broad payload validation, scheduleRoomInterval null dereference, raw error.message, permissive manual-card parsing, GET-game 404, unused-import, and challenge event-name findings predate U1. WaitingRoom omits capability in old join code, but `App.jsx` routes the active host path to OrganizerDashboard and no import of WaitingRoom was found. No repo/native review/commit change was made during triage.
- **L3 — RED before implementation:** `cd backend && npm test -- --runInBand tests/playerCapabilitySecurity.test.js` failed 7/8 cases before production edits: join issued no capability, cross-room and same-room non-owner card selection returned 200, public room JSON leaked a synthetic player hash, forged claim-bingo did not reject, and stale/current socket owner predicate was absent. The valid-owner card selection case passed against the baseline. One initial run had an incorrect test-only getCard mock causing 500s; after removing that mock, the 7/8 RED is the observed baseline. No production source changed during the RED run.
- **L4 — Slice boundary:** Backend capability issuance, schema/hash redaction, public serialization, and `select-card` enforcement are one T2 slice. T3 covers client session propagation plus socket ownership, reconnect, synchronization, and equivalent player-ID mutations.
- **L5 — T2 GREEN:** `cd backend && npm test -- --runInBand tests/playerCapabilitySecurity.test.js -t 'guest player capability HTTP boundary'` passed all 5 HTTP boundary tests (3 claim-bingo tests intentionally skipped for T3). This verifies issuance/hash binding, cross-room and same-room rejection, matching-owner selection, and public hash non-disclosure. No real database used.
- **L6 — Expanded identity surface:** Read-only review found challenge-answer/complete/trivia events and ordinary/tie-break voting trust client `playerId`/`voterId`; karaoke-video-end is an intentional TV flow. Add owner-binding to digital player actions and preserve TV/manual-player authorization behavior, without broad challenge redesign.
- **L7 — Challenge/voting GREEN:** `cd backend && npm test -- --runInBand tests/challengeVotingOwnership.test.js` passed 5/5 after 4/4 RED. It verifies spoofed challenge/trivia/voter IDs and unbound TV actions are rejected, while legitimate TV manual-player trivia and karaoke completion remain functional. Mocked/isolated state only.
- **L8 — T3 GREEN:** Capability/socket regression suites passed: `roomIdentitySecurity`, `roomHostCapability`, and `roomHostCapabilityRoutes` 50/50; claim/join 6/6; reconnect/REST 5/5; core socket ownership 4/4; challenge/voting/TV 5/5. Frontend capability handoff/context suites passed 8/8. Legacy tests were updated for chainable room query mocks and the required exactly-43-character base64url capability format. No real database used.
- **L9 — T4 GREEN:** Added missing-room timer cleanup, generic logged internal-error responses across room/game/Deezer/recording routes, strict 24-hex game ObjectId validation and missing-game 404, digit-only integer manual-card validation, and capability forwarding in the legacy WaitingRoom. RED→GREEN evidence: `gameHandlersSecurity` 1/1, `httpErrorSecurity` 13/13, `WaitingRoom.test.jsx` 2/2. No real database used.
- **L10 — Combined focused verification:** Backend identity/security and T4 suites passed 8 suites/89 tests; frontend session/forms/legacy WaitingRoom suites passed 5 files/10 tests.
- **L11 — Full closeout verification:** Backend `npm test -- --runInBand` passed 10 suites/130 tests; frontend `npm test` passed 6 files/12 tests; `npm run lint` passed clean; `npm run build` passed with existing browser-data/chunk-size warnings; staged and unstaged `git diff --check` passed. Branch remains `fix/local-stabilization-20261022`, HEAD remains `05505ec092e56f12cb76430495043b1403f7454f`, exactly 20 staged paths remain with digest `2ebc96cdef44335b59d4db2d3feee14ee2e5ef770e6198fb3ad66faa277b5a71`. No commit/RDD/Mongo smoke; no real DB touched.
- **L13 — TV authorization decision (verbatim):** “Dedicated TV capability (Recommended)”
- **L20 — Recording scope decision (verbatim):** “Include recordings in U1” — “Extend scope to secure recording upload and destructive operations, with tests and frontend compatibility.”
- **L21 — Recording authorization design:** Uploads must prove either the active challenge performer's room/player-bound capability or the room host capability before file storage; persisted room/game/player state, not multipart identity fields, determines attribution. Deletion requires the recording owner's player capability or the owning room's host authority. Public read/list/stream and like behavior remain unchanged; the UI gains only the existing capability handoff required for legitimate uploads.
- **L22 — Recording RED/GREEN:** `cd backend && npm test -- --runInBand tests/recordingAuthorizationSecurity.test.js` first failed as expected: forged unauthenticated upload returned 201 and unauthenticated delete returned 200. `cd backend && npm test -- --runInBand tests/recordingAuthorizationSecurity.test.js -t 'malformed player IDs'` also observed the expected 500 before ID validation. After the fix, `cd backend && npm test -- --runInBand tests/recordingAuthorizationSecurity.test.js tests/httpErrorSecurity.test.js tests/challengeVotingOwnership.test.js` passes 3 suites/34 tests; `cd bingo-react && npm test -- --reporter=dot src/utils/recordingAuthorization.test.js` passes 1 file/2 tests. Coverage proves unauthorized requests stop before file/database effects, player/host uploads use persisted attribution, non-performers cannot upload, owner/host deletes work, malformed IDs are rejected before room lookup, and the frontend sends role-specific capabilities in headers only. Existing duplicate Mongoose index and stale baseline browser-data warnings remain.
- **L23 — Isolated integration GREEN:** `cd backend && npm test -- --runInBand tests/u1IsolatedIntegration.test.js` passes 1 suite/1 test in 1.59 seconds. The test uses MongoMemoryServer with local mongod v8.2.1, a unique in-repository temporary data path and database name, direct HTTP+Socket.IO app construction, and test-owned cleanup. It verifies the full 14-step sequence: host room creation; two guests and distinct cards; TV capability join; game start/pause/resume; host overlap reclaim and guest disconnect/reconnect; cross-owner card, forged bingo, and cross-room denials; guest state sync and trivia answer redaction; no host/player/TV capabilities or hashes in public responses/broadcasts; host authority after reconnect; authorized TV tie-break action and rejected TV host-control; and zero remaining sockets. No `.env`, default Mongo port, or real `bingo-navidad`/production database was accessed. Only the existing duplicate email-index warning appeared.
- **L24 — Final functional verification:** After integration, `cd backend && npm test -- --runInBand` passes 13 suites/153 tests; `cd bingo-react && npm test -- --reporter=dot` passes 8 files/18 tests; `cd bingo-react && npm run lint` exits 0; `cd bingo-react && npm run build` exits 0; staged/unstaged `git diff --check` and an explicit trailing-whitespace scan of untracked files pass. Existing warnings: duplicate Mongoose email index, stale browser datasets, and oversized Vite chunks. `git diff --stat HEAD` shows 35 tracked changed paths, 2,516 additions/472 deletions, plus 19 untracked files; the integrated candidate is a substantial reviewer workload. Branch remains `fix/local-stabilization-20261022`, HEAD/main/origin/main remain `05505ec092e56f12cb76430495043b1403f7454f`, and the original 20-path staged digest remains `2ebc96cdef44335b59d4db2d3feee14ee2e5ef770e6198fb3ad66faa277b5a71`. No temporary Mongo paths, commit, push, merge, or production data access.
- **L25 — Native review preflight blocker:** Fresh ordinary START for the exact selected candidate returned `lens_context_budget_exceeded` during preflight; `mutation_performed:false`, `mutation_outcome:none`, and no review authority was created. The provider states this exact candidate cannot fit its complete reviewer context and requires smaller reviewable candidates in a chained sequence. No retry, reset, bypass, or delivery occurred; the user's one-local-commit constraint now conflicts with the only offered safe review path.
- **L26 — Split authorization (verbatim):** “Authorize chained local commits” — “Split into smaller reviewable candidate slices, run fresh native review and normal GGA hook for each, and use multiple local commits.” The user authorized changing delivery to multiple local commits after the provider budget refusal; all commits remain local and on the requested branch.
- **L27 — Isolation authorization (verbatim):** “Authorize reversible isolation” — “Back up and verify the exact current candidate locally, then isolate/review/commit bounded slices on the requested branch and restore/verify remaining changes between slices.” The user authorized an exact local backup and temporary non-slice restoration to enable path-bounded native review; no hard reset or hook bypass is authorized.
- **L28 — Exact candidate backup and slice map:** Verified backup at `.git/u1-slice-backup-20261022`: 35 changed tracked files, all 19 untracked files copied byte-for-byte, staged/unstaged/combined binary patches, index snapshot, branch/HEAD and status metadata. Staged patch SHA-256 remains `2ebc96cdef44335b59d4db2d3feee14ee2e5ef770e6198fb3ad66faa277b5a71`; unstaged patch SHA-256 `02392750fc26da0045ccc4dc58bba148fc3306fb3b683b386018132c912c94ee`; combined candidate patch SHA-256 `b7105274b7b2acad39758bc345cef7c0f05d4c0793c436e0b259488da8e6aaf4`. Backup verification left the worktree/index status byte-identical. Proposed ordered slices: T14 original 20-path host capability index; T15 guest/player REST and capability/public-data utilities; T16 socket ownership, client capability propagation, and TV handoff/display; T17 game/challenge/voting/trivia/music authorization; T18 recording authorization; T19 isolated integration and closeout documentation. Each slice gets a fresh exact native review and normal GGA hook before its local commit; split further if native context budget requires.
- **L29 — Backup and partition GREEN:** `git diff --check --cached` and `git diff --check` pass; backup contains 54 byte-verified files (35 tracked snapshots and 19 untracked files), and staged/unstaged/combined patch checks matched live Git views. Branch `fix/local-stabilization-20261022`, HEAD `05505ec092e56f12cb76430495043b1403f7454f`, staged path count 20 and staged hash `2ebc96cdef44335b59d4db2d3feee14ee2e5ef770e6198fb3ad66faa277b5a71` remain unchanged. No source/index/worktree isolation has started yet.
- **L30 — Native inspect blocker:** The host-only candidate was isolated by `git checkout-index --force --all`; verification showed the staged 20-path hash unchanged, zero unstaged tracked paths, and 19 untracked files. Native INSPECT then failed before native mutation with `unrelated target status is inconsistent` on three calls (the provider-marked retry and one explicit same-root attempt); all reported `mutation_outcome:not_started`, no review authority, and next action `retry`. Stopped further retries under the no-blind-retry constraint. No GGA hook or commit ran.
- **L31 — Original candidate restored:** Restored all 35 tracked paths from the verified snapshots. `git diff --cached`, `git diff`, and combined `git diff HEAD` each byte-match their saved patches; `git write-tree` matches the original index tree; porcelain status matches the original saved status; branch and HEAD are unchanged. The original candidate remains intact, no slice was committed, and no hook ran.
- **L12 (latest user request, verbatim):**

# MISIÓN BINGO BAILABLE — CIERRE DEFINITIVO DE U1

## ROL Y OBJETIVO

Actúa como ingeniero principal, responsable de seguridad, QA y cierre técnico de **Bingo Bailable**.

**Misión: completar U1 de principio a fin, sin dejar tareas parcialmente terminadas ni trasladar defectos conocidos a U2.**

Tienes autorización para investigar, corregir código, crear pruebas, documentar, ejecutar validaciones RDD y realizar el commit LOCAL final cuando se cumplan todas las condiciones de calidad.

Trabaja con autonomía. Toma las decisiones técnicas rutinarias sin consultarme. Solo detente ante riesgos importantes, operaciones destructivas o bloqueos que no puedas resolver de forma segura.

No confundas pruebas aprobadas con cierre formal: U1 solo terminará cuando sus cambios estén validados, registrados mediante Git y con el repositorio en estado consistente.

## 1. CONTEXTO ACTUAL CONFIRMADO

- Repositorio: `/Users/yoryiabreu/proyectos/bingo-bailable`
- Sesión Gentle Pi existente: `bingo`
- Rama: `fix/local-stabilization-20261022`
- `HEAD`, `main` y `origin/main`: `05505ec`
- Candidato U1 anterior: 20 archivos staged y aprobados por RDD
- Cambios adicionales de seguridad: 26 archivos modificados unstaged y 11 archivos nuevos, según última revisión
- Backend: **130/130 tests PASS**
- Frontend: **12/12 tests PASS**
- ESLint: PASS
- Vite build: PASS
- `git diff --check`: PASS
- Integración real del candidato actualizado: PENDIENTE
- Revisión RDD del candidato actualizado: PENDIENTE
- Commit de U1: PENDIENTE

Documentación:

- `odd/tasks/guest-host-room-capability.md`
- `odd/tasks/bingo-u1-security-closeout.md`

No asumas que estos datos siguen iguales: verifica primero el estado actual.

## 2. REGLAS DE OPERACIÓN

1. Trabaja en esta misma sesión y rama. No abras otra instancia de Pi ni crees worktrees innecesarios.
2. No modifiques `main`, `origin/main` ni producción durante esta misión.
3. No toques la base MongoDB real `bingo-navidad`, sus datos, archivos `.env`, activos musicales ni secretos.
4. No desactives RDD, GGA, hooks, controles de seguridad ni verificaciones.
5. No utilices `--no-verify`, cambios de configuración para saltar revisiones ni eliminaciones de evidencias de autoridad.
6. No ejecutes `git reset --hard`, `git clean -fd`, force push ni comandos destructivos.
7. No incorpores U2, rediseño visual ni funcionalidades nuevas ajenas a U1.
8. No detengas el desarrollo por errores de Engram. Si falla la resolución del proyecto, documenta el error y continúa usando la ruta Git confirmada.
9. No reportes como aprobada ninguna prueba que no se haya ejecutado.
10. Evita reintentos indefinidos y revisiones repetidas sin cambios verificables.

## 3. PRESERVAR EL TRABAJO EXISTENTE

Antes de modificar:

- Confirma rama, commits, archivos staged, unstaged y untracked.
- Comprueba que los 20 archivos del candidato anterior siguen intactos.
- Calcula y registra el hash del diff staged.
- Revisa las diferencias completas y busca archivos sensibles, credenciales accidentales o cambios fuera de alcance.
- Identifica el conjunto exacto de archivos que formará U1.

El objetivo es **integrar los cambios aprobados anteriormente con las correcciones nuevas en un único candidato coherente**, sin perder historial ni evidencia.

Si para preparar el nuevo candidato RDD necesitas modificar el índice de Git, hazlo únicamente mediante el procedimiento seguro y documentado del proveedor. Conserva antes el inventario y los hashes. No elimines cambios.

## 4. AUDITORÍA FUNCIONAL Y DE SEGURIDAD

Revisa todo el flujo, no solamente los tests existentes.

### A. Organizador

Verifica:

- Crear sala.
- Recibir y conservar `hostCapability`.
- Entrar como organizador.
- Actualizar página y recuperar el control.
- Reconexión con conexiones anteriores todavía activas.
- Controlar, pausar y reanudar partida.
- Impedir que un jugador común se haga pasar por organizador.
- No divulgar credenciales mediante respuestas públicas, Socket.IO, logs o pantalla de TV.

### B. Jugadores

Verifica:

- Ingresar como invitado.
- Obtener credencial individual segura.
- Seleccionar cartón propio.
- Reconectarse sin perder identidad.
- Recuperar cartón y estado de la partida.
- Marcar números.
- Reclamar bingo legítimamente.
- Impedir reclamar bingo por otro jugador.
- Impedir modificar el cartón de otro jugador de la misma sala.
- Impedir acceder o modificar participantes de otras salas.
- Bloquear credenciales inválidas, ausentes o correspondientes a otro jugador.
- Impedir que un socket antiguo actúe como propietario después de ser sustituido.

Las credenciales deben ser aleatorias, estar vinculadas al jugador y la sala, y guardarse en la base solamente mediante un hash seguro. Las respuestas públicas nunca deben mostrar esos hashes.

Las sesiones antiguas sin credencial deben fallar de forma segura, ofreciendo al participante una vía clara para volver a ingresar.

### C. Operaciones relacionadas

Revisa las operaciones que todavía puedan aceptar identidades proporcionadas por el cliente:

- Retos y respuestas.
- Votaciones y desempates.
- Trivia.
- Actualizaciones de puntos o estadísticas.
- Acciones sobre jugadores.
- Eventos de Socket.IO.
- Endpoints HTTP que modifican información.

No basta verificar que un `playerId` exista: comprueba pertenencia, identidad, credencial y autoridad para la operación.

Preserva expresamente los flujos legítimos de jugadores manuales, organizador y TV.

### D. Hallazgos anteriores del hook

Comprueba que estén resueltos, o identifica con precisión cualquier riesgo residual:

- `claim-bingo` y suplantación de jugadores.
- `select-card` y modificaciones entre salas.
- Validación de entradas críticas.
- Referencias nulas en `scheduleRoomInterval`.
- Exposición de mensajes internos de error.
- Validación estricta de cartones manuales.
- Respuesta HTTP 404 para recursos inexistentes.
- Propagación de credenciales en `WaitingRoom`.
- Coherencia de eventos `challenge-complete` y `challenge-completed`.
- Advertencia `R3-002` sobre autorización de desempates desde la TV.

**No dejes una vulnerabilidad de autorización conocida simplemente porque ya existía en `main`.**

Si un hallazgo no es aplicable, demuéstralo con código y pruebas; no lo declares falso positivo sin evidencia.

## 5. PRUEBAS AUTOMATIZADAS

Sigue metodología RED → GREEN para los defectos que requieran cambios nuevos.

Ejecuta:

- Tests focalizados de credenciales, autorización e identidad.
- Tests de reconexión y concurrencia de sockets.
- Tests de selección de cartones y reclamación de bingo.
- Tests de retos, votaciones y TV.
- Suite completa backend.
- Suite completa frontend.
- ESLint.
- Build de producción de React.
- `git diff --check`, tanto staged como unstaged.

Corrige los errores encontrados y vuelve a ejecutar las pruebas afectadas.

No reduzcas pruebas, elimines aserciones ni alteres mocks únicamente para obtener resultados verdes.

## 6. PRUEBA REAL DE INTEGRACIÓN — OBLIGATORIA

Las pruebas con mocks no sustituyen una prueba real.

Prepara una prueba de integración **HTTP + Socket.IO + MongoDB completamente aislado**.

Puedes utilizar un MongoDB temporal en contenedor o un servidor Mongo en memoria si las dependencias ya están disponibles. No reutilices ninguna base existente ni realices instalaciones o cambios de infraestructura riesgosos.

Verifica como mínimo esta secuencia:

1. Crear sala con organizador.
2. Incorporar dos jugadores.
3. Asignar cartones diferentes.
4. Conectar la TV.
5. Iniciar y pausar partida.
6. Desconectar y reconectar al organizador.
7. Desconectar y reconectar a un jugador.
8. Intentar modificar el cartón de otro jugador.
9. Intentar reclamar bingo con una identidad ajena.
10. Intentar acceso entre salas.
11. Comprobar sincronización de estado.
12. Comprobar que las credenciales privadas no aparecen en emisiones públicas.
13. Verificar que el organizador legítimo mantiene el control.
14. Verificar que no quedan sockets ni procesos de prueba abiertos.

Incluye una prueba de compatibilidad para las acciones permitidas de TV y desempate.

Usa una base efímera identificable y asegúrate de que la limpieza afecte exclusivamente a los recursos creados por esta prueba.

Si existe un impedimento real del entorno, investígalo y documenta el motivo verificable. No inventes un PASS y no borres recursos ajenos.

## 7. REVISIÓN NATIVA RDD

Cuando las pruebas estén aprobadas:

1. Consulta la documentación instalada de Gentle Pi sobre native review.
2. Comprueba el candidato exacto y la identidad de revisión.
3. Inicia una nueva revisión válida para el conjunto actualizado, sin reutilizar la aprobación anterior como si cubriera los cambios nuevos.
4. Sigue las transiciones oficiales: STATUS, reviewers, refuter, correction y validator cuando corresponda.
5. Conserva exactamente los bindings de cada STATUS; no reconstruyas ni modifiques tokens manualmente.
6. Atiende los hallazgos reales con correcciones y tests.
7. Repite solo las transiciones que la autoridad del proveedor admita.
8. Obtén el dictamen final verificable y su acknowledgement oficial.

Una aprobación del candidato anterior **no autoriza automáticamente el nuevo candidato**.

Si RDD exige correcciones, complétalas dentro de U1 mientras respetes el alcance. Si la autoridad se bloquea, no la desactives: entrega el diagnóstico exacto.

## 8. GGA, HOOK Y COMMIT

Cuando RDD apruebe el candidato final:

- Comprueba el conjunto exacto de archivos.
- Asegúrate de que no hay secretos ni datos temporales preparados.
- Ejecuta de nuevo las pruebas necesarias sobre el estado final.
- Prepara los archivos con Git siguiendo la política del repositorio.
- Ejecuta el commit mediante los hooks normales.

Mensaje propuesto:

`fix(bingo): secure host and player identity flows`

Si el hook Codex/GGA encuentra problemas reales, corrígelos. Si OpenCode falla por proveedor, diagnostica el fallo y utiliza exclusivamente mecanismos de recuperación documentados, sin bypass/reintentos indefinidos.

No repitas el mismo commit una y otra vez sin resolver el motivo de rechazo.

Puedes efectuar el **commit local** una vez satisfechos todos los controles. No hagas push, merge ni deploy; esas operaciones quedan para una autorización posterior.

## 9. LIMPIEZA Y CIERRE

Al terminar:

- Verifica el SHA del commit.
- Comprueba que la rama contiene exactamente los cambios de U1.
- Verifica que el working tree esté limpio.
- Confirma que `main` y `origin/main` no cambiaron.
- No dejes archivos temporales, procesos o bases de prueba abiertos.
- Actualiza la documentación de cierre sin invalidar innecesariamente la autoridad de revisión.
- Separa los riesgos aceptados, advertencias no bloqueantes y defectos pendientes.
- No declares U1 finalizada si falta una validación obligatoria.

No inicies U2.

## 10. INFORME FINAL OBLIGATORIO

Entrega un resumen claro en español con:

1. Qué vulnerabilidades se corrigieron y cómo.
2. Qué funciones de organizador, jugador y TV se verificaron.
3. Número exacto de pruebas aprobadas.
4. Resultado de la integración real con Mongo aislado.
5. Resultado y referencia de la revisión RDD.
6. Resultado del hook GGA.
7. Commit SHA, rama y estado de Git.
8. Confirmación de que Mongo real y producción no fueron afectados.
9. Hallazgos residuales, si existen.
10. Declaración inequívoca: **U1 CERRADA LOCALMENTE** o **U1 BLOQUEADA**, indicando exactamente por qué.

## CRITERIO FINAL

Prefiero una entrega correcta y comprobable antes que una entrega rápida con defectos escondidos.

Tienes autonomía para completar todas las acciones técnicas seguras dentro de esta misión. No solicites autorización por cada prueba, modificación o corrección ordinaria.

**Tu objetivo no es volver a informarme que hay trabajo pendiente. Tu objetivo es resolverlo y dejar U1 cerrada localmente, si los controles de seguridad lo permiten.**

Empieza ahora con la verificación del repositorio y ejecuta toda la secuencia hasta el resultado final.

- **L14 — TV join RED:** Added a regression requiring a dedicated TV capability while preserving host join. `cd backend && npm test -- --runInBand tests/playerCapabilitySecurity.test.js -t 'requires a dedicated TV capability'` failed as expected: the unauthenticated `tv-display` join returned `{ success: true }`. This proves the current public TV join is exploitable; the test was added before production changes. The only warning was the existing duplicate Mongoose `email` index warning.
- **L15 — Residual audit RED:** The focused backend command `cd backend && npm test -- --runInBand tests/playerCapabilitySecurity.test.js tests/roomHostCapabilityRoutes.test.js tests/challengeVotingOwnership.test.js tests/connectionDisclosureSecurity.test.js tests/roomIdentitySecurity.test.js` observed 6 failing regressions (44 passing): TV join, absent TV capability issuance/hash, unauthenticated voting start/end, missing `challenge-completed` compatibility event, trivia correct-answer disclosure in state sync, and raw database exception leakage. Fixed a test-only undefined `io` fixture and reran voting test, confirming unauthenticated requests reach game/voting logic. Frontend `cd bingo-react && npm test -- src/components/Room/RoomSetup.test.jsx` observed 1 failure/1 pass because RoomSetup did not carry `tvCapability` into host session. Existing Mongoose duplicate-index and stale browser-data warnings were non-blocking. No production source was changed before these RED observations.
- **L16 — T6 implementation strategy:** Create a distinct 32-byte TV capability, persist only its room-bound hash, and return its plaintext only to the room creator. Send it to the opened same-origin TV tab through a source/origin/room-checked `postMessage` handshake, never in a URL or room broadcast. Bind TV-only socket actions to the server-authenticated socket role; restrict ordinary voting start/end to room hosts. Redact trivia answers from player sync, emit the dashboard's legacy `challenge-completed` alias alongside the existing event, and replace raw socket exception messages with generic client errors while retaining server logs. These fixes are limited to confirmed U1 authorization/disclosure/compatibility findings; tests accompany each behavior.
- **L17 — Trivia/vote ownership RED:** `cd backend && npm test -- --runInBand tests/challengeVotingOwnership.test.js -t 'non-performer|stored trivia|host ending'` produced 3 expected failures. It confirms (1) a joined non-performer can trigger another player's trivia completion, (2) the server trusts the client's `correct` field instead of the stored active challenge answer, and (3) a host authorized for ROOMA1 can complete a ROOMB2 vote because `endVoting` never reads/binds the vote record. Tests added before these production fixes; no source fix for these defects yet.
- **L18 — HTTP trivia disclosure RED:** `cd backend && npm test -- --runInBand tests/playerCapabilitySecurity.test.js -t 'trivia answer HTTP'` produced 3 expected failures. The `PRIVATE_TRIVIA_ANSWER_CANARY` was present in public `/api/rooms/:code`, public `/api/games/:id`, and a valid guest `/api/rooms/:code/reconnect` response. Applied the shared `stripTriviaAnswers` projection afterward; the test is to be rerun for GREEN.
- **L19 — Challenge result actor RED:** `cd backend && npm test -- --runInBand tests/challengeVotingOwnership.test.js -t 'challenge answer and completion'` produced the expected non-performer failure while the active-performer compatibility case passed. The unauthorized player could broadcast challenge-result for another player's active challenge. Added active-challenge ownership checks afterward; focused post-fix verification remains pending.
- **L32 — Slice decision (verbatim selection):** “Dividir en slices reviewables” — “Reanudar la partición planificada; fresh RDD review y GGA por slice, commit local solo tras receipt aprobado.” The full 54-path candidate remains preserved; reviews and commits will use separately bounded candidates.
- **L33 — Full-candidate START gate:** Fresh START for the exact 54-path candidate was refused at preflight with `lens_context_budget_exceeded`, `mutation_performed:false`, and `mutation_outcome:none`; no authority or consent prompt was created. Provider says retrying that exact candidate cannot succeed and requires smaller candidates.
- **L34 — Backup boundary reverified:** Staged, unstaged, and combined patch hashes match the verified backup; the 20-entry logical index matches its saved index entries; all 35 tracked and 19 untracked file snapshots match byte-for-byte. The raw index-file hashes differ, so only logical index equality is claimed; no index restoration or overwrite occurred. Branch and HEAD remain unchanged, and no isolation has begun.
- **L35 — T14 resumed:** The 20-path staged host-capability unit is the first slice under the authorized chain plan. The previous 54-path selection will not be reused; obtain a fresh inspect for the isolated T14 candidate. No authority, GGA hook, or commit exists for this slice yet.
- **L36 — T14 isolation checkpoint and pause:** Ran `git checkout-index --force --all` under the previously authorized reversible worktree isolation. The staged diff remains SHA-256 `2ebc96cdef44335b59d4db2d3feee14ee2e5ef770e6198fb3ad66faa277b5a71`; current worktree shows 20 staged paths, zero unstaged tracked paths, and the original 19 untracked paths. Afterward, raw `.git/index` SHA-256 was `0293d2c56ad4fd32c3cabeb69e5a6d2a4ccb9481f4e59f336a8bf182f8a0be1d` (pre-isolation `a3727fc7bcb515e81aca631fbfbb39fee1be27476bbe9fa78159aa7e10226990`; saved raw snapshot `2311f72aef5bcc1169a26b8ba0a83c57ab8413417e6801ae9b37f5acfc0998ff`). Parsed index entries have no path/mode/object/flag differences and the TREE extension is identical, but 35 entries' stat fields differ. Eighteen untracked files still match their snapshots; the task document is the one intentional log update. No native inspect/START, GGA, or commit has occurred after isolation. Paused for the user's decision on whether this raw index metadata difference is acceptable or the saved index bytes should be restored.
- **L37 — Index metadata decision (verbatim selection):** “Continuar con el índice semánticamente intacto” — “Aceptar la diferencia de metadatos stat y hacer INSPECT fresco del slice T14 sin restaurar `.git/index`.” The user accepted the raw stat-metadata difference, declined index restoration, and authorized a fresh INSPECT for T14 only.
- **L38 — Native ASSESS result:** Read-only ASSESS returned `risk=medium`, `nativeRisk=unassessable`, `changedPaths=0`, `changedLines=0`, and no candidate because it refused while 19 untracked files lacked an explicit declaration; ASSESS exposes no untracked-scope selector. Writer profile was `large` from runtime; plan was `writerSelfVerification=true`, `structuralReadbackOnly=false`, `independentVerifier=false`, with native outcome unknown. No authority or candidate was created. Since the user explicitly requested native review, proceed to a fresh INSPECT using `untrackedScope=exclude` for the verified 20-path T14 slice.
- **L39 — T14 fresh INSPECT failure:** The exact 20-path inspect with `untrackedScope=exclude` failed before native mutation: `phase=pre_native`, `code=operation_failed`, cause `validate negotiated review status: unrelated target status is inconsistent`, `mutation_performed=false`, `mutation_outcome=none`, `authority_applicability=not_evaluated`, `retry_safe=true`, and `next_action=retry`. No lineage or authority exists. The provider explicitly marks one retry safe; perform at most one identical INSPECT retry, then stop if it fails again.
- **L40 — T14 retry repeated the native status failure:** The single provider-authorized identical INSPECT retry returned the same pre-native `operation_failed` / `unrelated target status is inconsistent` result with `mutation_performed=false`, `mutation_outcome=none`, `authority_applicability=not_evaluated`, `retry_safe=true`, and `next_action=retry`. No lineage, authority, START, consent, GGA, or commit was created. Stopped further retries; restore the original 54-path worktree candidate from the verified backup without replacing the user-approved current index bytes.
- **L41 — Full candidate restoration GREEN:** Restored and byte/mode-verified the 35 tracked worktree snapshots from `.git/u1-slice-backup-20261022`, preserved all 19 untracked paths (18 still match backup; only the task log has intentional appended evidence), and retained the raw index hash observed immediately before restoration. Staged, unstaged, and combined patch hashes equal the saved values; 35 tracked and 19 untracked candidate paths remain; branch/HEAD unchanged and `git diff --check --cached` plus `git diff --check` pass. No native review authority, hook, commit, or deployment.
- **L42 — Post-log restoration and index verification:** The final check confirmed the original staged/unstaged/combined patch hashes, 35 tracked and 19 untracked path inventory, snapshot bytes/modes, branch/HEAD, and diff checks. Its only failed assertion was the raw `.git/index` SHA: current `96bb4391be2980d2872bf7c3872271e762e76645f859d5cc853c75ce7cf866b3` differed from the prior `0293d2c56ad4fd32c3cabeb69e5a6d2a4ccb9481f4e59f336a8bf182f8a0be1d`. Direct parsing confirms all 194 path/mode/object/flag entries and all extensions (including TREE) match the saved `index.before`; 35 stat metadata entries differ. No restore of index bytes or staged-tree change occurred; continue treating the index as semantically intact under the user's L37 choice.
