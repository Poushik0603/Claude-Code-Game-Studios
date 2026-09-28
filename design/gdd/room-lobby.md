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

### States and Transitions

| State | Entry Condition | Exit Condition | Behavior |
|-------|----------------|----------------|----------|
| `lobby` | Room created | `START_GAME` succeeds | Members can join/leave, host can edit settings/kick, `ROOM_STATE_SYNC` broadcasts on every membership/settings change |
| `active_game` | `START_GAME` succeeds | The active Rules Engine signals game end (round/match complete) | Membership is frozen (no new joins; only reconnection to existing seats); a Rules Engine owns all turn-by-turn logic |
| `results` | Rules Engine signals game end | `PLAY_AGAIN` (→ back to `lobby` or a fresh `active_game`, host's choice/Room/Lobby's flow) or all players leave (→ room cleanup) | Standings shown; "Play Again" available to host |

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
| Room code generation collides on its first attempt (extremely unlikely per the formula, but must be handled) | The server regenerates a new code and retries; this can repeat until a unique code is found — no arbitrary retry limit is needed given the probabilities involved, but implementation should still cap retries defensively (e.g. 10 attempts) to avoid an infinite loop in a theoretical pathological case | Defensive coding practice — the formula shows this should never actually happen at realistic scale, but the code must not hang if it somehow did |

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

[To be designed]

## Open Questions

[To be designed]
