# WebSocket Message Protocol

> **Status**: In Design
> **Author**: user + agents
> **Last Updated**: 2026-09-29
> **Last Verified**: 2026-09-29
> **Implements Pillar**: Pillar 2 (The Server Is the Only Referee)

## Summary

WebSocket Message Protocol is the typed contract for every message that flows between client and server — the set of named events, their payload shapes, and the rules for who may send which message when. It is the wire format every other networked system (Room/Lobby, Networking/State Sync, Reconnection, all three Rules Engines) builds on, and it exists to make "the server is the only referee" enforceable in code: every client action arrives as an explicit, typed intent the server validates, never a command the server blindly executes.

> **Quick reference** — Layer: `Foundation` · Priority: `MVP` · Key deps: `None`

## Overview

This system defines the complete set of WebSocket message types exchanged between client and server, split into two directions: client→server **intents** (e.g. `PLAY_CARD`, `DRAW_CARD`, `JOIN_ROOM`) which the server may accept or reject, and server→client **broadcasts** (e.g. `STATE_SYNC`, `ERROR_MSG`, `GAME_OVER`) which the server uses to push authoritative truth to every connected client. Each message type has a fixed, versioned payload shape (defined in the shared TypeScript package so both server and client get compile-time type safety) and an explicit description of who can send it and under what room/turn conditions it's valid. This system defines *only the shape and naming of messages* — it does not implement room logic, turn logic, or game rules; those live in Room/Lobby, the Rules Engines, and Networking/State Sync respectively, all of which communicate exclusively through the contract this system defines. The concept prototype (`prototypes/multiplayer-turn-loop-concept/`) validated an early, ad-hoc version of this pattern (`JOIN_ROOM`, `PLAY_CARD`, `DRAW_CARD`, `STATE_SYNC`, `ERROR_MSG`, `GAME_OVER`) with a PROCEED verdict — this GDD formalizes and completes that pattern for production use.

## Player Fantasy

This system has no player-facing fantasy of its own, for the same reason as Card/Deck Primitives: players never see a "message" or an event name — they see a card appear on an opponent's play, a turn indicator move, or an error toast telling them why their last click didn't work. What players *do* feel — instant, trustworthy synchronization, and clear feedback when they try something illegal — depends entirely on this contract being complete and unambiguous. A gap in this protocol (a client action with no corresponding intent message, or a state change with no corresponding broadcast) becomes, one layer up, a moment where the game feels broken, laggy, or unfair. This system's job is to make Pillar 1 ("Zero Friction") and Pillar 2 ("Server Is the Only Referee") possible in code; the emotional payoff is delivered by the systems built on top of it.

## Detailed Design

### Core Rules

1. Every message is a JSON-serializable object with two required top-level fields: `type` (a `SCREAMING_SNAKE_CASE` string constant, per this project's naming convention) and `payload` (a type-specific object, or `undefined` for payload-less messages).
2. Messages are strictly one-directional per type — a given `type` string is either always client→server or always server→client, never both. This keeps the contract unambiguous and lets the shared package export two disjoint type unions: `ClientIntent` and `ServerBroadcast`.
3. **Client→Server intents** represent a *request*, never a command. The server independently validates every intent against current room/game state before acting — an intent message never causes a state change by merely being received; it causes the server to *attempt* a state change, which may be rejected (Pillar 2).
4. **Server→Client broadcasts** represent *facts* — once sent, they describe what has already happened/what is currently true. Clients never need to validate a broadcast; they render it as-is.
5. Every intent message must include enough information for the server to identify the sender's room and identity from the existing socket connection (Socket.IO's per-socket room membership) — intents never need to carry a room code or player ID in their payload once joined, preventing spoofing.
6. MVP message catalog:

   **Client → Server (Intents):**

   | Type | Payload | Valid When |
   |---|---|---|
   | `JOIN_ROOM` | `{ roomCode: string, displayName: string }` | Any time (pre-game or reconnect) |
   | `LEAVE_ROOM` | `undefined` | Any time while in a room |
   | `START_GAME` | `undefined` | Sender is host, room is in lobby state, ≥2 players present |
   | `KICK_PLAYER` | `{ targetPlayerId: string }` | Sender is host, room is in lobby state |
   | `UPDATE_ROOM_SETTINGS` | `{ maxPlayers?: number, mode?: string }` | Sender is host, room is in lobby state |
   | `PLAY_CARD` | `{ cardId: string, chosenColor?: string }` | Sender is the current turn player, room is in active-game state |
   | `DRAW_CARD` | `undefined` | Sender is the current turn player, room is in active-game state |
   | `CALL_UNO` | `undefined` | Sender has exactly 1 card in hand |
   | `CATCH_UNO` | `{ targetPlayerId: string }` | Target has exactly 1 card and has not declared UNO |
   | `PLAY_AGAIN` | `undefined` | Room is in results state, sender is host |

   **Server → Client (Broadcasts):**

   | Type | Payload | Sent When |
   |---|---|---|
   | `ROOM_STATE_SYNC` | Full redacted lobby state (players, host, settings) | Any lobby state change |
   | `GAME_STATE_SYNC` | Full redacted game state (own hand, opponents' hand counts, top card, turn, active color) | Any in-game state change |
   | `ERROR_MSG` | `{ code: string, message: string }` | An intent is rejected |
   | `GAME_OVER` | `{ winnerId: string, standings: Array<{playerId, score}> }` | A round/match ends |
   | `PLAYER_DISCONNECTED` / `PLAYER_RECONNECTED` | `{ playerId: string }` | Connection state changes (feeds the lobby/table's connection-status dot) |

7. `ERROR_MSG.code` is a stable machine-readable identifier (e.g. `"NOT_YOUR_TURN"`, `"ILLEGAL_CARD"`, `"ROOM_FULL"`); `ERROR_MSG.message` is the human-readable string the brief requires ("that's not your turn," not a stack trace).

> **Note**: This catalog covers Room/Lobby and Normal UNO (MVP tier) only. No Mercy and Flip will add mode-specific intents (e.g. a future `SWAP_HAND` for No Mercy's 7-card, `FLIP_SIDE` trigger for Flip's Flip card) when those Rules Engine GDDs are authored — this system's naming convention and envelope structure (Rule 1) apply to them without modification.

### States and Transitions

Not applicable at this layer — this GDD defines message *shapes*, not the room/game state machine those messages trigger transitions in. The state machine itself belongs to the Room/Lobby GDD (lobby ↔ active-game ↔ results states) and each Rules Engine GDD (turn state, stack state, etc.). See Cross-References.

### Interactions with Other Systems

| System | Data In | Data Out | Notes |
|---|---|---|---|
| Card/Deck Primitives | `Card` objects (via `GAME_STATE_SYNC`'s hand/table fields) | — | This protocol serializes `Card` objects verbatim; it doesn't redefine their shape |
| Room/Lobby | Consumes `JOIN_ROOM`, `LEAVE_ROOM`, `START_GAME`, `KICK_PLAYER`, `UPDATE_ROOM_SETTINGS` | Produces `ROOM_STATE_SYNC` | Room/Lobby owns the actual state machine; this protocol just names the wire messages |
| Networking/State Sync | — | Owns *when* and *to whom* `GAME_STATE_SYNC`/`ROOM_STATE_SYNC` are sent, including per-player redaction | This protocol defines payload shape; Networking/State Sync defines the broadcast/redaction logic |
| Rules Engine — Normal UNO | Consumes `PLAY_CARD`, `DRAW_CARD`, `CALL_UNO`, `CATCH_UNO` | Triggers `GAME_STATE_SYNC`, `ERROR_MSG`, `GAME_OVER` | Engine validates the intent; this protocol just carries it |

## Formulas

> Note: message ordering/sequencing guarantees belong to the Networking/State Sync GDD (a property of how state is broadcast and reconciled, not of the envelope/naming contract this GDD owns), and reconnection backoff timing belongs to the not-yet-written Reconnection & Session Identity GDD. Both are intentionally out of scope here.

### Intent Rate Limit

The `intent_rate_limit` formula is defined as:

`is_rejected = (intents_received_in_window > max_intents_per_window)`

**Variables:**

| Variable | Symbol | Type | Range | Description |
|----------|--------|------|-------|-------------|
| Intents received in window | `intents_received_in_window` | int | 0–∞ | Count of client→server intent messages received from one socket within the current window |
| Max intents per window | `max_intents_per_window` | int | tuning knob, e.g. 10–30 | Ceiling on intents per socket per window before rejection |
| Window duration | `window_ms` | int | tuning knob, e.g. 1000ms | Length of the rate-limit window |
| Is rejected | `is_rejected` | bool | {true, false} | Whether the server drops the intent and emits `ERROR_MSG` (code `RATE_LIMITED`) instead of processing it |

**Output Range:** Boolean gate — intent either proceeds to Room/Lobby or a Rules Engine, or is short-circuited with `ERROR_MSG.code = "RATE_LIMITED"`.
**Example:** `max_intents_per_window = 20`, `window_ms = 1000`. A client sending 25 `PLAY_CARD`/`DRAW_CARD` intents in one second gets `is_rejected = true` on intents 21–25; normal play (well under 20/sec) is unaffected.

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Client sends an intent with a `type` string not in the known catalog (e.g. malformed/future/malicious payload) | Server ignores it silently at the transport layer or responds with `ERROR_MSG.code = "UNKNOWN_MESSAGE_TYPE"` — never crashes, never attempts to interpret unknown payload shapes | Server must stay stable and authoritative even against malformed or adversarial input (Pillar 2) |
| Client sends a well-formed intent but with a payload that fails schema validation (e.g. `PLAY_CARD` with `cardId` missing) | Server rejects with `ERROR_MSG.code = "INVALID_PAYLOAD"` before the intent ever reaches Room/Lobby or a Rules Engine — schema validation happens at this protocol layer, not deferred to each consumer | Keeps every downstream system safe from malformed input by construction; consumers can trust payload shape once validation passes |
| A client is rate-limited (Formulas) mid-game, during their own turn | The rejected intent has no effect (their turn does not advance, they are not penalized beyond the immediate rejection) — `ERROR_MSG.code = "RATE_LIMITED"` is sent, player can simply try again | Rate limiting exists to stop abuse, not to punish normal play; a false-positive rejection should be cheap to recover from |
| Server needs to send a broadcast to a socket that has disconnected between state-change and send | Send is a no-op for that socket (Socket.IO handles this natively — no error surfaces); the disconnected player receives full current state via `GAME_STATE_SYNC`/`ROOM_STATE_SYNC` on reconnect instead | Reconnection (a separate GDD) is responsible for "catching up" a rejoining client — this protocol doesn't need special-case delivery guarantees for offline sockets |
| A message payload exceeds a reasonable size ceiling (e.g. some pathological oversized string) | Server drops the message and may disconnect the offending socket, rather than attempting to process an oversized payload | Prevents a trivial resource-exhaustion vector; ties to the payload-size Tuning Knob |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Card/Deck Primitives | Soft — this protocol serializes `Card` objects | `GAME_STATE_SYNC` payloads carry `Card`/`Deck`/`Hand`-shaped data defined by that GDD |
| Room/Lobby | Depended on by | Consumes `JOIN_ROOM`, `LEAVE_ROOM`, `START_GAME`, `KICK_PLAYER`, `UPDATE_ROOM_SETTINGS`; produces `ROOM_STATE_SYNC` |
| Networking/State Sync | Depended on by | Owns broadcast timing and redaction logic for `GAME_STATE_SYNC`/`ROOM_STATE_SYNC` |
| Rules Engine — Normal UNO | Depended on by | Consumes `PLAY_CARD`, `DRAW_CARD`, `CALL_UNO`, `CATCH_UNO`; triggers `GAME_STATE_SYNC`, `ERROR_MSG`, `GAME_OVER` |
| Rules Engine — No Mercy / Flip (future) | Will depend on this | Will extend the message catalog with mode-specific intents/broadcasts, using this GDD's envelope convention (Rule 1) |
| Reconnection & Session Identity (not yet designed) | Will depend on this | Reconnect flow will reuse `JOIN_ROOM` and `PLAYER_DISCONNECTED`/`PLAYER_RECONNECTED` |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `max_intents_per_window` | 20 | 10–50 | More tolerant of rapid legitimate play (e.g. fast double-clicks); weaker abuse protection | Stricter abuse protection; risk of false-positive rejections during fast legitimate play |
| `window_ms` | 1000 | 500–5000 | Coarser-grained limiting, smooths out bursts | Finer-grained limiting, more sensitive to short bursts |
| Max payload size (bytes) | 16 KB | 4–64 KB | More headroom for large payloads (e.g. big `GAME_STATE_SYNC` at 12 players); slightly higher resource-exhaustion risk | Tighter resource protection; risk of legitimately large state payloads being rejected at high player counts |

## Visual/Audio Requirements

Not applicable — this system is a wire-format contract with no rendering or sound. `ERROR_MSG` display, connection-status dots, and all visual feedback belong to the Game Table UI and Room/Lobby GDDs, which consume the message types this system defines.

## UI Requirements

Not applicable — no direct UI. See **Game Table UI** and **Room/Lobby** GDDs for how these messages surface to players.

## Cross-References

| This Document References | Target GDD | Specific Element Referenced | Nature |
|---------------------------|-----------|------------------------------|--------|
| "`GAME_STATE_SYNC` carries `Card` objects" | `design/gdd/card-deck-primitives.md` | `Card`/`Deck`/`Hand` schemas | Data dependency |
| "Room/Lobby consumes JOIN_ROOM etc., produces ROOM_STATE_SYNC" | `design/gdd/room-lobby.md` (not yet written) | Lobby state machine | Ownership handoff |
| "Networking/State Sync owns broadcast timing and redaction" | `design/gdd/networking-state-sync.md` (not yet written) | Redaction/broadcast logic | Ownership handoff |
| "Rules Engine — Normal UNO consumes PLAY_CARD/DRAW_CARD/CALL_UNO/CATCH_UNO" | `design/gdd/rules-engine-normal-uno.md` (not yet written) | Intent validation and turn logic | Rule dependency |
| "sequencing/ordering guarantees are out of scope here" | `design/gdd/networking-state-sync.md` (not yet written) | Message ordering guarantee | Rule dependency |
| "reconnection backoff timing is out of scope here" | `design/gdd/reconnection-session-identity.md` (not yet written) | Reconnect flow | Rule dependency |

> Note: Most target GDDs are not yet written. These references are provisional, same caveat as Card/Deck Primitives — flagged in Open Questions.

## Acceptance Criteria

### Envelope Structure (Core Rule 1)
- [ ] GIVEN any message sent between client and server, WHEN its structure is inspected, THEN it has exactly a `type` field (string) and a `payload` field (object or `undefined`) at the top level.
- [ ] GIVEN a message's `type` field, WHEN its casing is inspected, THEN it matches `SCREAMING_SNAKE_CASE` (e.g. `PLAY_CARD`, not `playCard` or `play_card`).
- [ ] GIVEN a message type with no meaningful payload (e.g. `DRAW_CARD`), WHEN it is sent, THEN `payload` is `undefined`, not an empty object `{}` or `null`.

### Intent vs. Broadcast Directionality (Core Rule 2)
- [ ] GIVEN the full set of defined message types, WHEN each is checked against the shared TypeScript package's type unions, THEN it appears in exactly one of `ClientIntent` or `ServerBroadcast`, never both.
- [ ] GIVEN a server attempts to send a message whose `type` is defined as a `ClientIntent`, WHEN this is attempted in code, THEN it is a TypeScript compile-time error (the type union prevents it).

### Intent Is a Request, Not a Command (Core Rule 3)
- [ ] GIVEN a client sends `PLAY_CARD` for a card that is not legal to play, WHEN the server processes it, THEN no game state changes and `ERROR_MSG` is sent instead of a `GAME_STATE_SYNC` reflecting the play.
- [ ] GIVEN a client sends any intent, WHEN the server receives it, THEN the server independently re-validates the action against its own current state rather than trusting any state implied by the client's payload.
- [ ] GIVEN a client sends `START_GAME` while not being the host, WHEN the server processes it, THEN the game does not start and `ERROR_MSG` is returned.

### Broadcast Is a Fact (Core Rule 4)
- [ ] GIVEN a client receives `GAME_STATE_SYNC`, WHEN the client renders it, THEN the client performs no additional legality/validity checks before displaying it as current truth.
- [ ] GIVEN the server sends `GAME_OVER`, WHEN clients receive it, THEN all clients display the same `winnerId` and `standings` with no client-side recomputation of the result.

### Intents Never Carry Room/Player ID (Core Rule 5)
- [ ] GIVEN a client has already joined a room via `JOIN_ROOM`, WHEN it sends `PLAY_CARD`, THEN the payload contains no `roomCode` or `playerId` field — the server derives sender identity from the socket's room membership.
- [ ] GIVEN a malicious client crafts a `PLAY_CARD` payload with a spoofed player identifier (if such a field existed), WHEN this is attempted, THEN it has no effect, because no such field exists in the schema for the server to trust — identity comes only from the socket connection.
- [ ] GIVEN two different sockets both send `PLAY_CARD` at different times, WHEN the server processes each, THEN each is attributed to the correct sender based on socket identity, independent of payload contents.

### MVP Message Catalog — Intents
- [ ] GIVEN a client sends `JOIN_ROOM` with a valid `roomCode` and `displayName`, WHEN the server processes it, THEN the client is added to that room and receives `ROOM_STATE_SYNC` reflecting their membership.
- [ ] GIVEN a client sends `JOIN_ROOM` with a `roomCode` that does not exist, WHEN the server processes it, THEN `ERROR_MSG` is returned and no room membership occurs.
- [ ] GIVEN the sender is the current turn player and the card is legal, WHEN `PLAY_CARD` is sent, THEN the card moves from hand to discard pile and `GAME_STATE_SYNC` reflects the new turn/state.
- [ ] GIVEN the sender is NOT the current turn player, WHEN `PLAY_CARD` is sent, THEN `ERROR_MSG` with `code = "NOT_YOUR_TURN"` is returned and no state changes.
- [ ] GIVEN the sender is the host and the room is in lobby state, WHEN `KICK_PLAYER` is sent with a valid `targetPlayerId`, THEN that player is removed from the room and `ROOM_STATE_SYNC` reflects their removal.
- [ ] GIVEN the sender is NOT the host, WHEN `KICK_PLAYER` is sent, THEN `ERROR_MSG` is returned and the target remains in the room.
- [ ] GIVEN the sender is the host and the room is in lobby state, WHEN `UPDATE_ROOM_SETTINGS` is sent with a valid `maxPlayers` or `mode`, THEN the room's settings update and `ROOM_STATE_SYNC` reflects the change.
- [ ] GIVEN the sender is the host, the room is in lobby state, and ≥2 players are present, WHEN `START_GAME` is sent, THEN the room transitions to active-game state and clients receive an initial `GAME_STATE_SYNC`.
- [ ] GIVEN the sender is the host but fewer than 2 players are present, WHEN `START_GAME` is sent, THEN `ERROR_MSG` is returned and the room remains in lobby state.
- [ ] GIVEN the sender has exactly 1 card in hand, WHEN `CALL_UNO` is sent, THEN the sender's UNO-declared status is recorded and reflected in the next `GAME_STATE_SYNC`.
- [ ] GIVEN a target player has exactly 1 card and has not declared UNO, WHEN another player sends `CATCH_UNO` with that `targetPlayerId`, THEN the target receives the catch-UNO penalty per the Rules Engine and `GAME_STATE_SYNC` reflects it.
- [ ] GIVEN a target player HAS declared UNO, WHEN another player sends `CATCH_UNO` against them, THEN `ERROR_MSG` is returned and no penalty is applied.
- [ ] GIVEN the room is in results state and the sender is host, WHEN `PLAY_AGAIN` is sent, THEN the room transitions back to lobby or a fresh active-game state per the Room/Lobby GDD's state machine.
- [ ] GIVEN a client sends `LEAVE_ROOM` while in any room state, WHEN the server processes it, THEN the sender is removed from the room and remaining clients receive an updated `ROOM_STATE_SYNC` or `GAME_STATE_SYNC` (with the departure reflected in player list / hand count).

### MVP Message Catalog — Broadcasts
- [ ] GIVEN `ERROR_MSG` is sent, WHEN its payload is inspected, THEN it always contains a machine-readable `code` (e.g. `"NOT_YOUR_TURN"`) and a human-readable `message` string — never a stack trace or raw error object.
- [ ] GIVEN any lobby state change (join, leave, kick, settings update), WHEN it occurs, THEN `ROOM_STATE_SYNC` is broadcast to all clients currently in that room.
- [ ] GIVEN a round or match ends (a player empties their hand, or a mode-specific win condition is met), WHEN this occurs, THEN `GAME_OVER` is broadcast with a `winnerId` and a `standings` array covering every player in the room.
- [ ] GIVEN a connected client's socket disconnects, WHEN this is detected, THEN `PLAYER_DISCONNECTED` is broadcast to the remaining clients in that room with the correct `playerId`.
- [ ] GIVEN a previously-disconnected player's socket reconnects and rejoins the same room, WHEN this occurs, THEN `PLAYER_RECONNECTED` is broadcast to the remaining clients with the correct `playerId`.

### Rate Limit Formula
- [ ] GIVEN a socket sends `max_intents_per_window` or fewer intents within `window_ms`, WHEN each is processed, THEN none are rejected for rate-limiting reasons.
- [ ] GIVEN a socket sends more than `max_intents_per_window` intents within `window_ms`, WHEN the excess intents are processed, THEN each excess intent receives `ERROR_MSG` with `code = "RATE_LIMITED"` and has no game/room effect.
- [ ] GIVEN a socket was rate-limited in one window, WHEN a new window begins, THEN the socket's intent count resets and subsequent intents (up to the limit) are processed normally.

### Edge Cases
- [ ] GIVEN a client sends a message with a `type` not in the known catalog, WHEN the server receives it, THEN the server does not crash, and either ignores it or responds with `ERROR_MSG.code = "UNKNOWN_MESSAGE_TYPE"`.
- [ ] GIVEN a client sends a known `type` with a payload that fails schema validation (e.g. `PLAY_CARD` missing `cardId`), WHEN the server receives it, THEN `ERROR_MSG.code = "INVALID_PAYLOAD"` is returned before the intent reaches Room/Lobby or any Rules Engine.
- [ ] GIVEN a client is rate-limited during their own turn, WHEN the rejected intent is inspected, THEN their turn does not advance and no penalty beyond the `RATE_LIMITED` error is applied.
- [ ] GIVEN a broadcast is sent to a socket that disconnected moments earlier, WHEN this occurs, THEN the send is a no-op with no server-side error, and the player receives full current state via `GAME_STATE_SYNC`/`ROOM_STATE_SYNC` upon reconnecting.
- [ ] GIVEN a client sends a message payload exceeding the configured size ceiling, WHEN the server receives it, THEN the message is dropped (and the socket may be disconnected) rather than processed.

## Open Questions

| Question | Owner | Deadline | Resolution |
|----------|-------|----------|-----------|
| No Mercy/Flip mode-specific message types (e.g. `SWAP_HAND`, `FLIP_SIDE`) are deferred to their own Rules Engine GDDs — will they need any changes to this GDD's envelope/naming convention (Rule 1), or can they be added purely additively? | design-system author (when those GDDs are written) | When Rules Engine — No Mercy / Flip GDDs are authored | Open — expected to be purely additive, but must be verified |
| Exact rate-limit values (`max_intents_per_window = 20`, `window_ms = 1000`) are estimates, not empirically tested | network-programmer | Before/during implementation, adjust based on real play testing | Open |
| Cross-References point to 4 GDDs that don't exist yet (Room/Lobby, Networking/State Sync, Rules Engine — Normal UNO, Reconnection & Session Identity) | design-system author (next GDDs in order) | When each is authored | Open — must be verified, not assumed |
