# Room/Lobby

> **Status**: In Design
> **Author**: user + agents
> **Last Updated**: 2026-09-29
> **Last Verified**: 2026-09-29
> **Implements Pillar**: Pillar 1 (Zero Friction to the Table), Pillar 3 (Never Lose Your Seat)

## Summary

Room/Lobby is the system that turns a room code into an actual live room: it owns room creation, membership (who's in, who's out, who's host), the lobby↔active-game↔results state machine, and instant host migration when the host disconnects. It's the system every other Core-layer GDD (Player Identity/Session, Room Settings/Config, WebSocket Message Protocol) deferred its remaining open questions to, because this is where "a session becomes a seat in a specific room" actually happens.

> **Quick reference** — Layer: `Core` · Priority: `MVP` · Key deps: `Player Identity/Session, Room Settings/Config, WebSocket Message Protocol`

## Overview

This system implements the actual room the brief describes: a host creates it (generating a room code and a `RoomSettings` object per that GDD), players join by code (turning their `sessionId`/`playerId` per Player Identity/Session into room membership with a `displayName`), and the room progresses through three states — `lobby` (waiting, host can edit settings and kick players), `active_game` (a Rules Engine owns turn-by-turn play; this system just tracks that a game is running), and `results` (round/match over, "Play Again" available). This system enforces the brief's hard requirements: a room is entered only by code (no public listing), a session may belong to only one room at a time, at least 2 players are required to start, and if the host disconnects — at any point, even mid-game — host powers instantly pass to the next-longest-tenured still-connected player, with no gap where the room has no host. Every membership or settings change is broadcast to the room via `ROOM_STATE_SYNC` (defined structurally by the WebSocket Message Protocol GDD; this system defines exactly when it fires and what it contains). This system does not implement any mode's turn/rules logic (Rules Engines own that) and does not implement reconnection's exact grace-period/eviction timing (Reconnection & Session Identity owns that) — it only owns the room's own membership and lifecycle state.

## Player Fantasy

This is the moment the brief describes as "everyone updates instantly" — you share a room code, and then you watch it happen: names populate live, a crown appears next to whoever's hosting, green dots confirm everyone's actually there. It's the digital equivalent of watching people pull up chairs to a real table. The quieter, higher-stakes fantasy is host migration: if the host's connection drops mid-game, nobody should feel the room falter — someone else just quietly becomes host and the game keeps going, the way a physical game doesn't stop just because one person stepped away. The failure mode to avoid at all costs is a visible "no host" gap, or a lobby that looks frozen while membership silently changes underneath.

## Detailed Design

### Core Rules

1. **Room creation**: When a session (already `identified` per Player Identity/Session) creates a new room, the server generates: a 6-character room code drawn from an unambiguous alphanumeric alphabet (uppercase letters and digits, excluding `0/O` and `1/I/L`), regenerated on collision with any currently-active room code; a fresh `RoomSettings` object (per that GDD, all defaults unless overridden at creation); and the creating session's `playerId` recorded as `hostPlayerId`.
2. **Joining**: A session joins an existing room by sending `JOIN_ROOM { roomCode, displayName }`. The server validates: the room code exists, the room is in `lobby` state (Core Rule 8 — no joining mid-game), the room is not at `maxPlayers` capacity, and the session is not already a member of any room (Core Rule 9). On success, a `Player` record is created: `{ playerId, displayName, sessionId (server-internal only), joinedAt (timestamp, used for host migration order), connected: true }`.
3. **Membership list**: A room maintains an ordered list of `Player` records. Order is join order and is preserved even as players disconnect/reconnect or leave — it is never re-sorted, since it's the basis for host migration (Core Rule 6).
4. **Host designation**: Exactly one `Player` in the room is host at all times (`hostPlayerId` on the room). The host is whoever created the room, until host migration (Core Rule 6) reassigns it.
5. **Host-only actions**: `KICK_PLAYER`, `UPDATE_ROOM_SETTINGS`, `START_GAME`, and future host-only actions are validated by comparing the sender's `playerId` to the room's `hostPlayerId` — server-side, every time, never trusted from the client (consistent with Room Settings/Config's Core Rule 4, generalized here to all host actions this system gates).
6. **Host migration**: If the `Player` matching `hostPlayerId` disconnects (`connected` becomes `false`), the server immediately reassigns `hostPlayerId` to the earliest-`joinedAt` `Player` still `connected: true`. If no connected players remain, the room is marked for cleanup (see Edge Cases). This happens instantly and atomically with the disconnect event — there is never a tick where the room has zero or two hosts.
7. **Leaving**: `LEAVE_ROOM` (or a disconnect with no reconnect within Reconnection & Session Identity's grace period — that GDD owns the exact timing) removes the `Player` from the room's membership list entirely. If the leaving player was host, Core Rule 6 applies first.
8. **Lobby-only joining**: `JOIN_ROOM` for an *existing* room only succeeds while that room is in `lobby` state. A room in `active_game` or `results` state rejects new joins (a disconnected player's *reconnect* is different — Reconnection & Session Identity handles re-entry to an in-progress game; this is about brand-new membership).
9. **One room per session**: A session already holding membership in a room cannot `JOIN_ROOM` into a *different* room without first `LEAVE_ROOM`-ing the current one. Re-sending `JOIN_ROOM` for the *same* room the session is already in is idempotent (returns success, no duplicate membership) — this specifically supports a client retry after a dropped acknowledgment without erroring.
10. **Starting the game**: `START_GAME` succeeds only if: sender is host, room is in `lobby` state, room has ≥2 members (brief's minimum), and `RoomSettings.mode` is a mode with an implemented Rules Engine (Room Settings/Config's Core Rule 6). On success, room state transitions to `active_game` and this system hands off control to the appropriate Rules Engine.
11. **Kicking**: `KICK_PLAYER { targetPlayerId }` (host-only, lobby-state-only) removes the target from membership immediately and disconnects their socket's room association — they receive a clear notification (not silently dropped) before removal.
12. **Room code retry exhaustion**: If room code generation (Core Rule 1) fails to find a unique code after 10 attempts, room creation fails outright with `ERROR_MSG code: "ROOM_CREATION_FAILED"` — the client may simply retry the entire creation request. Per the collision-probability formula, this should never occur in practice at this game's realistic scale; the cap exists purely as a defensive bound against a pathological failure mode, not as an expected code path.
13. **PLAY_AGAIN transition**: `PLAY_AGAIN` (host-only, `results`-state-only) always transitions the room back to `lobby` state, with membership and `RoomSettings` preserved unchanged. It does not start a new game directly — the host must send `START_GAME` again when ready, reusing the existing Core Rule 10 validation (allowing settings to be adjusted between rounds if desired).

### States and Transitions

| State | Entry Condition | Exit Condition | Behavior |
|-------|----------------|----------------|----------|
| `lobby` | Room created | `START_GAME` succeeds | Members can join/leave, host can edit settings/kick, `ROOM_STATE_SYNC` broadcasts on every membership/settings change |
| `active_game` | `START_GAME` succeeds | The active Rules Engine signals game end (round/match complete) | Membership is frozen (no new joins; only reconnection to existing seats); a Rules Engine owns all turn-by-turn logic |
| `results` | Rules Engine signals game end | `PLAY_AGAIN` (→ `lobby`, settings/membership preserved, per Core Rule 13) or all players leave (→ room cleanup) | Standings shown; "Play Again" available to host |

### Interactions with Other Systems

| System | Data In | Data Out | Notes |
|---|---|---|---|
| Player Identity/Session | Consumes `sessionId`→`playerId` resolution, `displayName` | — | This system is where a session's `playerId` gains room-membership meaning |
| Room Settings/Config | Consumes `RoomSettings` object, host validation pattern | Provides lobby-state gating that Room Settings/Config's Core Rule 5 depends on | This system creates the `RoomSettings` object at room-creation time |
| WebSocket Message Protocol | Consumes `JOIN_ROOM`, `LEAVE_ROOM`, `START_GAME`, `KICK_PLAYER` | Produces `ROOM_STATE_SYNC`, `PLAYER_DISCONNECTED`, `PLAYER_RECONNECTED` | This system defines exactly when/what these fire, extending that GDD's shape definitions |
| Reconnection & Session Identity (future) | — | Room membership model this system defines (a `Player` record persists through disconnect until Reconnection's grace period expires) | This system doesn't implement reconnection timing, but its membership model is what reconnection reattaches to |
| Rules Engine — Normal UNO (and future modes) | — | Room membership list, `RoomSettings`, control handoff on `active_game` entry | This system starts the game; the Rules Engine takes over turn logic |

## Formulas

### Room Code Collision Probability

The room_code_collision_probability formula is defined as:

`P_collision ≈ 1 − e^(−n(n−1) / (2 × 32^6))`

**Variables:**

| Variable | Symbol | Type | Range | Description |
|----------|--------|------|-------|-------------|
| Concurrently active rooms | n | int | 0–10,000+ | Number of live room codes in use at once (birthday-problem style collision check) |
| Room code alphabet size | 32 | constant | fixed | 36 alphanumeric chars minus excluded ambiguous chars (0/O, 1/I/L) |
| Code length | 6 | constant | fixed | Per Core Rule 1 |
| Collision probability | P_collision | float | 0–1 | Probability that a newly generated code matches an already-active room's code |

**Expected output range**: 0–1, unbounded input but the formula saturates toward 1 only as n approaches ~10^4.5; at this game's realistic scale it stays vanishingly small.
**Example**: At n = 1,000 concurrent active rooms (a very high estimate for a friend-group party game), P_collision ≈ 1 − e^(−1000×999 / (2×1.07×10^9)) ≈ 0.00047 (~1 in 2,140). At n = 10,000, P_collision ≈ 0.0456 (~1 in 22) — still low, and Core Rule 1's regenerate-on-collision handles it for free since it's a live check against active rooms, not a one-shot assumption. This confirms 6 chars / 32-character alphabet + regenerate-on-collision is sufficient without needing a longer code or reservation scheme at this game's scale.

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| The last connected player in a room leaves/disconnects (room becomes empty, or fully disconnected with no reconnect) | The room is marked for cleanup and its resources (settings, membership records, room code) are released; the room code becomes available for reuse | No persistence design (Anti-Pillars) — an abandoned room should not linger indefinitely in server memory |
| Concurrently active rooms approach ~1,000+ (per the collision-probability formula's worked example) | Not an automatic system behavior — this is a documented threshold to revisit the room-code scheme (longer code, or a reservation/sharding approach) if this game ever scales beyond its stated friend-group-party-game scope | Keeps the current design honest about its scale assumptions rather than silently degrading at higher load |
| Two sessions attempt to `JOIN_ROOM` into the last available slot (`maxPlayers` capacity) at the same instant | The server processes intents in the order received (single-threaded per-room processing, consistent with Card/Deck Primitives' and Room Settings/Config's established pattern); the first to be processed gets the slot, the second is rejected with `ERROR_MSG code: "ROOM_FULL"` | No race condition possible given the server's in-order processing guarantee |
| The host attempts to kick themselves via `KICK_PLAYER { targetPlayerId: <own playerId> }` | Rejected with `ERROR_MSG` (e.g. `code: "CANNOT_KICK_SELF"`) — if the host wants to leave, `LEAVE_ROOM` is the correct action (which then triggers host migration per Core Rule 6, or room cleanup if they were the only member) | Prevents a confusing state where a "kick" and a "leave" produce different, potentially inconsistent outcomes for the same actor |
| A room reaches `results` state, and every player disconnects/leaves before anyone sends `PLAY_AGAIN` | Same as the "last player leaves" case — the room is cleaned up | No special-casing needed; results-state rooms are cleaned up the same way as any other empty room |
| A `Player` who was kicked or left attempts to `JOIN_ROOM` back into the same room with the same `sessionId` | Treated as a brand-new join attempt (Core Rule 2) — if the room is still in `lobby` state and has capacity, it succeeds as a new `Player` record (new `joinedAt`, at the back of the join order); being kicked does not create a standing ban in this GDD's scope | No ban/blocklist mechanic is in the brief; a kicked player can simply rejoin if the host allows it (kicking is a lobby-management tool, not a permanent exclusion) |
| Room code generation collides on its first attempt (extremely unlikely per the formula, but must be handled) | The server regenerates a new code and retries, up to the 10-attempt cap (Core Rule 12); if the cap is exhausted, room creation fails with `ERROR_MSG code: "ROOM_CREATION_FAILED"` | Defensive coding practice — the formula shows this should never actually happen at realistic scale, but the code must not hang if it somehow did |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Player Identity/Session | This depends on | Needs `playerId`/`sessionId` resolution and `displayName` to form `Player` records |
| Room Settings/Config | This depends on | Creates the `RoomSettings` object at room creation; enforces its lobby-state-only editability |
| WebSocket Message Protocol | This depends on | Consumes `JOIN_ROOM`, `LEAVE_ROOM`, `START_GAME`, `KICK_PLAYER`; produces `ROOM_STATE_SYNC`, `PLAYER_DISCONNECTED`, `PLAYER_RECONNECTED` |
| Reconnection & Session Identity | Depended on by | Will build grace-period/eviction timing on top of this system's `Player` record persisting through disconnect |
| Rules Engine — Normal UNO (and future modes) | Depended on by | Receives control handoff when a room enters `active_game` state; reads membership list and `RoomSettings` |
| Landing/Name Entry | Depended on by | UI consumes this system's room-creation/join flow |
| Game Table UI | Depended on by | UI consumes membership list, host designation, and connection status for the table view |
| Turn Timer (future, Vertical Slice) | Depended on by | Will need to know when it's a given player's turn within the `active_game` state this system tracks |
| DOS Placeholder | Depended on by | Reads `RoomSettings.mode` (via Room Settings/Config) surfaced through this system's room-creation flow |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| Room code length | 6 characters | 4–8 (per the collision-probability formula's scaling) | Longer codes reduce collision probability further and support higher concurrent-room scale, but are more tedious to read/type aloud | Shorter codes are faster to communicate but raise collision probability sooner (revisit threshold drops) |
| Room code alphabet | 32 chars (36 alphanumeric minus 0/O, 1/I/L) | Any excludes-ambiguous-characters scheme | A larger alphabet (e.g. including lowercase) increases the code space but risks re-introducing ambiguity or case-sensitivity confusion | A smaller alphabet is safer/clearer to read aloud but shrinks the code space faster |
| Minimum players to start | 2 | Fixed by UNO's rules — not designer-adjustable | N/A | N/A |
| Room code collision retry cap | 10 attempts (defensive) | 5–50 | Higher cap is more resilient to pathological cases but delays failure detection if something is systemically wrong | Lower cap fails faster but risks false failures under (still extremely unlikely) genuine collision runs |

> Note: `maxPlayers`, `mode`, `zeroSevenRule`, and `turnTimerSeconds` are NOT tuning knobs here — they are owned by the Room Settings/Config GDD and referenced, not duplicated.

## Visual/Audio Requirements

**Event feedback (all low-complexity, CSS/Framer Motion transitions — no particle systems):**

- **Player joins**: New row slides/fades into the player list (200-250ms ease-out) with a brief highlight pulse (background flash to accent color, fading over ~600ms). A soft "pop" cue if audio is in scope. Player count badge (X/max) increments with a small scale-bounce (1.0→1.15→1.0) to draw the eye without being distracting.
- **Player leaves**: Row fades + collapses (height animates to 0) over ~200ms rather than an abrupt cut — abrupt removal reads as a bug, not a leave.
- **Host crown migration**: The crown icon doesn't just reappear elsewhere — it animates a visible transfer: fade out at the old host's row (~150ms) then fade/scale in at the new host's row (~150ms, slight delay so it never looks duplicated). This is the single most important animation on this screen per the Player Fantasy section ("nobody should feel the room falter") — it must read as continuous, not glitchy.
- **Kick**: Same visual language as leave (fade+collapse) but the kicked player's own client gets a distinct modal/toast ("You were removed from the room") — per Core Rule 11's "clear notification, not silently dropped." For everyone else in the lobby, a kick and a voluntary leave should look the same; the distinction is server-side messaging, not differentiated animation (avoids editorializing who left why).
- **Settings change**: The changed field briefly highlights (same pulse treatment as join) so non-host players notice what changed without a full-screen refresh feel. Mode change specifically should swap the selected mode card's visual state (border/glow) with a quick crossfade, not a jump-cut.

**Animation & Style Constraints:**

- All transitions 150-300ms, ease-out — consistent with skribbl.io's snappy-not-sluggish feel. Nothing should feel like it's "loading."
- **Host crown**: single simple icon (filled crown glyph), one accent color, no per-player color variation — it must be instantly scannable as "there is exactly one of these."
- **Connection dot**: small filled circle, green (connected) / grey (disconnected) — no red, since disconnection isn't an error state, it's an expected occurrence (Pillar 3). Grey reads as "temporarily away," not "failure."
- **Mobile vs desktop layout**: Desktop can show player list as a grid/table with room code and controls in a persistent header. Mobile should stack vertically — room code + mode + count pinned at top (scroll-independent), player list scrollable below, host controls (Start Game, kick buttons) anchored at the bottom within thumb reach. Kick buttons should not be hover-only (no hover state on touch) — always-visible small icon buttons or swipe-to-reveal, never a desktop-only interaction pattern smuggled onto mobile.

**Applicable Visual Design Principles:**

- **Common fate / continuity (Gestalt)**: the crown's fade-out/fade-in transfer and row slide animations exist specifically so state changes read as one continuous event, not a discontinuous jump — directly serves Pillar 3.
- **Visual hierarchy via size/color, not decoration**: room code and Start Game button (host) are the two highest-priority elements on this screen and should be the largest/highest-contrast; player list is secondary; settings recap is tertiary. Avoid competing accent colors — one accent color for "actionable/host," not one per feature.
- **Restraint over ornamentation**: "clean, playful" means bright, simple, high-contrast UI with a little motion — not skeuomorphic textures or heavy shadows. Every animation should have a functional read (something changed) not just decorative flourish, given low-medium art pipeline budget.
- **Status at a glance**: connection dot + host crown must be legible at a thumbnail-sized row height on a phone screen — test iconography at actual mobile row height, not just desktop mockup scale.

> **📌 Asset Spec** — Visual/Audio requirements are defined. After the art bible is approved, run `/asset-spec system:room-lobby` to produce per-asset visual descriptions, dimensions, and generation prompts from this section.

## UI Requirements

| Information | Display Location | Update Frequency | Condition |
|-------------|-----------------|-----------------|-----------|
| Room code | Persistent header, both mobile/desktop, with copy-to-clipboard button | Static (set at creation) | Always visible in lobby state |
| Mode (selected) | Header/settings summary area | On `ROOM_STATE_SYNC` (settings change) | Always visible; host sees it as editable, others read-only |
| Player count (X/max) | Adjacent to player list header | On every join/leave/kick | Always visible |
| Player list (name + host crown + connection dot) | Scrollable list, primary screen real estate | On every `ROOM_STATE_SYNC` (join/leave/kick/host migration/connection change) | Always visible |
| Host-only controls (kick buttons, settings edit, Start Game) | Inline per-row (kick) + bottom/header area (settings, Start Game) | Static visibility, but Start Game enabled/disabled state updates on player-count change (min 2) | Only rendered for the client whose `playerId` matches `hostPlayerId` |
| Leave room control | Persistent, low-emphasis (e.g. header or footer corner) | Static | Always visible to all players |

> **📌 UX Flag — Room/Lobby**: This system has UI requirements. In Phase 4 (Pre-Production), run `/ux-design` to create a UX spec for the lobby screen before writing epics. Stories that reference UI should cite `design/ux/lobby.md`, not this GDD directly.

## Cross-References

| This Document References | Target GDD | Specific Element Referenced | Nature |
|---------------------------|-----------|------------------------------|--------|
| "sessions resolve to `playerId`/`displayName` for membership" | `design/gdd/player-identity-session.md` | `sessionId`/`playerId` model | Data dependency |
| "`RoomSettings` object created at room creation, lobby-state gating enforced" | `design/gdd/room-settings-config.md` | `RoomSettings` schema, Core Rules 4-5 | Ownership handoff + Rule dependency |
| "consumes JOIN_ROOM/LEAVE_ROOM/START_GAME/KICK_PLAYER, produces ROOM_STATE_SYNC/PLAYER_DISCONNECTED/PLAYER_RECONNECTED" | `design/gdd/websocket-message-protocol.md` | Message catalog | Data dependency |
| "Player record persists through disconnect until Reconnection's grace period expires" | `design/gdd/reconnection-session-identity.md` (not yet written) | Grace-period/eviction timing | Ownership handoff |
| "control handoff to Rules Engine on active_game entry" | `design/gdd/rules-engine-normal-uno.md` (not yet written) | Turn/rules logic | Ownership handoff |
| "single-threaded per-room processing guarantee" | `design/gdd/card-deck-primitives.md` | Established pattern (Edge Cases) | Rule dependency |

> Note: Some target GDDs are not yet written — provisional, flagged in Open Questions.

## Acceptance Criteria

### Room Creation (Core Rule 1)
- [ ] GIVEN a session creates a new room, WHEN the room is created, THEN a 6-character room code is generated from the unambiguous alphabet (uppercase letters/digits excluding 0/O/1/I/L).
- [ ] GIVEN a new room code is generated, WHEN it matches an already-active room's code, THEN the server regenerates a new code rather than using the collision.
- [ ] GIVEN a room is created, WHEN its `RoomSettings` and `hostPlayerId` are inspected, THEN `RoomSettings` reflects defaults (or creation-time overrides) and `hostPlayerId` matches the creating session's `playerId`.

### Joining (Core Rule 2)
- [ ] GIVEN a valid `roomCode` for a `lobby`-state room under capacity, WHEN `JOIN_ROOM { roomCode, displayName }` is sent by a session not already in a room, THEN a new `Player` record is created and the join succeeds.
- [ ] GIVEN an invalid/nonexistent `roomCode`, WHEN `JOIN_ROOM` is sent, THEN it is rejected with `ERROR_MSG` and no `Player` record is created.
- [ ] GIVEN a successful join, WHEN the new `Player` record is inspected, THEN it contains `playerId`, `displayName`, `joinedAt`, and `connected: true` (and `sessionId` is retained server-internally only, never exposed to other clients per Player Identity/Session's Core Rule 7).

### Membership List Ordering (Core Rule 3)
- [ ] GIVEN a room with multiple players who joined in a specific order, WHEN the membership list is inspected at any later point (including after disconnects/reconnects), THEN it reflects the original join order, never re-sorted.

### Host Designation (Core Rule 4)
- [ ] GIVEN a newly created room, WHEN `hostPlayerId` is inspected, THEN it equals the creating session's `playerId`.
- [ ] GIVEN a room with any membership, WHEN `hostPlayerId` is inspected at any point, THEN exactly one `Player` in the room matches it.

### Host-Only Action Validation (Core Rule 5)
- [ ] GIVEN a non-host player sends `KICK_PLAYER`, `UPDATE_ROOM_SETTINGS`, or `START_GAME`, WHEN the server validates the sender's `playerId` against `hostPlayerId`, THEN the action is rejected with `ERROR_MSG` regardless of any client-side UI restriction.
- [ ] GIVEN the host sends any of these actions, WHEN validated, THEN the action proceeds (subject to its own additional rules).

### Host Migration (Core Rule 6) — highest priority
- [ ] GIVEN the host disconnects and exactly one other `connected: true` player remains, WHEN migration occurs, THEN `hostPlayerId` immediately reassigns to that remaining player.
- [ ] GIVEN the host disconnects and multiple `connected: true` players remain with different `joinedAt` timestamps, WHEN migration occurs, THEN `hostPlayerId` reassigns to the player with the EARLIEST `joinedAt` among those still connected — not the most recent, not random.
- [ ] GIVEN the host disconnects and a player who joined BEFORE the host (impossible in this system since the host is always the earliest by definition of Core Rule 1) — GIVEN instead the second-host (post-migration) disconnects with multiple remaining candidates, WHEN migration occurs again, THEN the same earliest-`joinedAt`-among-connected rule applies identically on subsequent migrations.
- [ ] GIVEN the host disconnects and NO other `connected: true` players remain, WHEN migration is attempted, THEN no new host is assigned and the room is marked for cleanup per the Edge Cases table (not left in a zero-host lobby state).
- [ ] GIVEN a host disconnect event, WHEN the room state is inspected at any point during or immediately after the migration, THEN there is never a moment with zero hosts or two simultaneous hosts — the reassignment is atomic with the disconnect event.
- [ ] GIVEN host migration occurs, WHEN `ROOM_STATE_SYNC` is broadcast afterward, THEN all remaining connected clients receive the updated `hostPlayerId` reflecting the new host.

### Leaving (Core Rule 7)
- [ ] GIVEN a non-host player sends `LEAVE_ROOM`, WHEN processed, THEN their `Player` record is removed from the membership list entirely (not just marked disconnected).
- [ ] GIVEN the host sends `LEAVE_ROOM` and other connected players remain, WHEN processed, THEN host migration (Core Rule 6) occurs first, then the leaving host's record is removed.

### Lobby-Only Joining (Core Rule 8)
- [ ] GIVEN a room in `active_game` or `results` state, WHEN a session not already in that room sends `JOIN_ROOM` with its code, THEN the join is rejected with `ERROR_MSG` — brand-new membership is not permitted outside `lobby` state.

### One Room Per Session (Core Rule 9)
- [ ] GIVEN a session already a member of Room A, WHEN it sends `JOIN_ROOM` for a different Room B, THEN the request is rejected with `ERROR_MSG` and membership in Room A is unaffected.
- [ ] GIVEN a session already a member of Room A, WHEN it re-sends `JOIN_ROOM` for Room A again (e.g. retry after a dropped ack), THEN the request succeeds idempotently — no duplicate `Player` record is created and the original record is unaffected.

### Starting the Game (Core Rule 10)
- [ ] GIVEN the sender is host, room is `lobby` state, room has ≥2 members, and `mode` has an implemented Rules Engine, WHEN `START_GAME` is sent, THEN the room transitions to `active_game` and control is handed to the appropriate Rules Engine.
- [ ] GIVEN the room has fewer than 2 members, WHEN the host sends `START_GAME`, THEN it is rejected with `ERROR_MSG` and the room remains in `lobby` state.
- [ ] GIVEN a non-host sends `START_GAME`, WHEN validated, THEN it is rejected (covered also under Host-Only Action Validation).

### Kicking (Core Rule 11)
- [ ] GIVEN the host sends `KICK_PLAYER { targetPlayerId }` for a valid, non-self target during `lobby` state, WHEN processed, THEN the target's `Player` record is removed and their client receives a clear kick notification before disconnection from the room.
- [ ] GIVEN `KICK_PLAYER` is sent while the room is in `active_game` or `results` state, WHEN validated, THEN it is rejected with `ERROR_MSG`.

### Room Code Retry Exhaustion (Core Rule 12)
- [ ] GIVEN room code generation fails to find a unique code after 10 attempts, WHEN this occurs, THEN room creation fails with `ERROR_MSG code: "ROOM_CREATION_FAILED"` rather than hanging or crashing, and the client may retry the whole request.

### PLAY_AGAIN Transition (Core Rule 13)
- [ ] GIVEN a room in `results` state, WHEN the host sends `PLAY_AGAIN`, THEN the room transitions to `lobby` state with membership and `RoomSettings` unchanged.
- [ ] GIVEN the room has just transitioned to `lobby` via `PLAY_AGAIN`, WHEN the host sends `START_GAME`, THEN normal Core Rule 10 validation applies (no special-cased fast path).
- [ ] GIVEN a non-host sends `PLAY_AGAIN`, WHEN validated, THEN it is rejected with `ERROR_MSG`.

### Formula — Room Code Collision Probability
- [ ] GIVEN n = 1,000 concurrent active rooms substituted into the formula, WHEN computed, THEN P_collision ≈ 0.00047, matching the documented worked example.
- [ ] GIVEN n = 10,000 concurrent active rooms substituted into the formula, WHEN computed, THEN P_collision ≈ 0.0456, matching the documented worked example.

### Edge Cases
- [ ] GIVEN the last connected player in a room leaves or disconnects with no reconnect, WHEN this occurs, THEN the room is marked for cleanup and its room code becomes available for reuse.
- [ ] GIVEN two sessions send `JOIN_ROOM` for the last available slot at effectively the same instant, WHEN the server processes both (in receipt order), THEN exactly one succeeds and the other is rejected with `ERROR_MSG code: "ROOM_FULL"` — no double-booking of the slot occurs.
- [ ] GIVEN the host sends `KICK_PLAYER` targeting their own `playerId`, WHEN validated, THEN it is rejected with `ERROR_MSG code: "CANNOT_KICK_SELF"`.
- [ ] GIVEN a room reaches `results` state and every player leaves/disconnects before `PLAY_AGAIN` is sent, WHEN this occurs, THEN the room is cleaned up identically to the empty-room case.
- [ ] GIVEN a player who was previously kicked from a room sends `JOIN_ROOM` for that same room while it is still in `lobby` state with capacity, WHEN processed, THEN the join succeeds as a new `Player` record (no standing ban).
- [ ] GIVEN room code generation collides on its first attempt, WHEN this occurs, THEN the server regenerates and retries (up to the 10-attempt cap in Core Rule 12) rather than failing immediately on the first collision.

## Gaps Found (from qa-lead review, resolved or deferred)

- **Retry-cap exhaustion (originally unhandled)**: Resolved — Core Rule 12 added, with matching acceptance criteria.
- **PLAY_AGAIN selection mechanism (originally undefined)**: Resolved — Core Rule 13 added (always returns to `lobby`), with matching acceptance criteria.
- **ROOM_STATE_SYNC exact payload shape**: Deferred — owned by WebSocket Message Protocol GDD; this document's criteria verify that sync fires and broadly what it reflects, not the exact wire format.
- **Disconnect-to-host-migration real-world latency/debounce**: Deferred — owned by the not-yet-written Reconnection & Session Identity GDD; this document's criteria test the logical `connected` flag transition, not socket-drop timing.
- **Host-is-also-last-player overlap (LEAVE_ROOM vs. migration-then-cleanup order)**: Not a functional gap — both paths produce the same outcome (room cleaned up), so no additional rule was needed.
- **3+-way simultaneous join races**: Not explicitly tested beyond the 2-way case in Edge Cases, but the same in-order, single-threaded processing guarantee (established in Card/Deck Primitives and reused here) generalizes without requiring separate rules.

## Open Questions

| Question | Owner | Deadline | Resolution |
|----------|-------|----------|-----------|
| Exact `ROOM_STATE_SYNC` payload shape when membership/settings change | design-system author (WebSocket Message Protocol is already written — this may need a follow-up edit to that GDD rather than a new one) | Before implementation | Open — this GDD defines when it fires and roughly what it reflects; exact wire shape should be finalized in WebSocket Message Protocol |
| Real-world disconnect-to-host-migration latency (debounce before declaring `connected: false`) | design-system author (when Reconnection & Session Identity GDD is written) | When that GDD is authored | Open — this GDD's migration logic is correct given a `connected` flag flip; the flip's timing is Reconnection's scope |
| Cross-References point to 2 GDDs that don't exist yet (Reconnection & Session Identity, Rules Engine — Normal UNO) | design-system author (next GDDs in order) | When each is authored | Open — must be verified, not assumed |
