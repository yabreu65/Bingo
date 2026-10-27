# Phase 4 security inventory

This inventory is generated from the current Express route declarations and Socket.IO handler registrations. The repository currently contains **52 Express route declarations** and **260 Socket.IO event references** (listeners plus emissions). The counts are structural checks; the table below records the authorization contract for the security-sensitive families.

## Express route families

| Surface | Allowed emitter | Authentication / authorization | Ownership boundary | Returned-data rule | Regression evidence |
| --- | --- | --- | --- | --- | --- |
| `/api/auth/*` | Browser session | JWT for protected routes; auth version; hashed rotating refresh token | User identity | User profile excludes password/token hashes | `authTokenSecurity.test.js` |
| `/api/rooms/create`, `/join` | Organizer/player browser | Schema validation, rate limits, generated capability | New room or requested room only | Public room redacts cards, marks, socket IDs and capability hashes | `playerCapabilitySecurity.test.js`, integration E2E |
| `/api/rooms/:code` | Room participants / organizer | Room capability for mutations; validation and rate limits | Room code and player membership | Public room has no private card matrix or marks; trivia answers redacted | `playerCapabilitySecurity.test.js`, `u1IsolatedIntegration.test.js` |
| `/api/players/:id` | Player or organizer | Player capability; host capability for host-owned operations | Player ID, room membership and capability binding | Capability hashes excluded | `playerCapabilitySecurity.test.js` |
| `/api/games/*` | Organizer or room viewers | Host capability for start; validated IDs | Game is bound to its room | Public game redacts active/pool trivia and riddle answers | `playerCapabilitySecurity.test.js`, E2E |
| `/api/admin/rooms/:code/*` | Organizer | Room host capability, optional JWT context | Every content, playlist and prize query includes `req.adminRoom._id` | Administrative answers only returned to authorized host | `adminRoutesSecurity.test.js`, browser E2E |
| `/api/recordings/*` | Room host, room player, room TV | Room-bound host/player/TV capability before file access | Recording room and owner player | Unauthenticated listing/detail/stream/like/stats rejected | `recordingAuthorizationSecurity.test.js` |
| `/api/deezer/*` | Public client | Input validation and bounded limits | External provider IDs only | Provider response, no local credentials | `httpErrorSecurity.test.js` |
| `/api/spotify/login` | Public client | Placeholder only | None | No credentials returned | Manual route inspection |

## Socket.IO event families

| Family | Allowed emitter | Authorization check | Persistence / replay protection | Evidence |
| --- | --- | --- | --- | --- |
| Room join, leave, reconnect, sync | Host, player, TV as applicable | Capability bound to room and socket identity | Atomic socket ownership update; reconnect restores persisted state | `roomIdentitySecurity.test.js`, `u1IsolatedIntegration.test.js` |
| Start, pause, resume, reset, call number, launch challenge | Organizer | Room host capability and active-room state | Game/room state persisted before broadcasts | `roomHostCapabilityRoutes.test.js`, Phase 1 engine E2E |
| Mark cell and claim bingo | Current player socket | Socket player ID, room, socket ownership and server card/called numbers | Atomic mark/claim filters; winner persisted once | `playerSocketOwnership.test.js`, Phase 1 E2E |
| Trivia, riddle, dance, sing, group, karaoke | Authorized performer/participants/TV | Active challenge participant and room binding | Responses deduplicated; completion clears active challenge and awards points once | Browser E2E and Phase 4 minigame smoke |
| Voting and tie-breaks | Eligible room players / TV | Voter socket identity, active voting state and room | Atomic vote uniqueness and persisted result | Voting/tie-break browser E2E |
| Room broadcasts and dashboard sync | Server | Payload filtered by audience | No client authority in emitted state | `connectionDisclosureSecurity.test.js`, Phase 1–3 E2E |

## Validated negative cases

- Player capability cannot mutate another player, prize, playlist, configuration or points.
- TV capability cannot execute organizer-only operations.
- Cross-room capabilities fail authorization.
- Duplicate challenge responses, votes and prize deliveries are rejected or deduplicated.
- Public recording stream and listing access require room authorization.
- Public room/game responses do not disclose capability hashes, card matrices, marks, trivia answers or riddle answers.
- Invalid IDs, payloads, ranges and out-of-state operations are rejected.

## Residual coverage

The inventory is explicit but not a claim that every one of the 52 routes and 260 event references has an independent adversarial test. Provider integrations, placeholder Spotify OAuth, backend process restart under every timer type, and production-scale multimedia decoding remain outside the local automated coverage. The CI workflow runs backend/frontend/browser regression plus two isolated Phase 4 smoke jobs.
