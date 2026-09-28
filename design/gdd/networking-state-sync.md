# Networking/State Sync

> **Status**: In Design
> **Author**: user + agents
> **Last Updated**: 2026-09-29
> **Last Verified**: 2026-09-29
> **Implements Pillar**: Pillar 2 (The Server Is the Only Referee)

## Summary

Networking/State Sync owns the mechanics of turning one canonical, server-side game/room state into what each connected client actually receives — redacting opponents' hands into counts, and broadcasting a fresh, full, per-player-redacted state after every state-changing action. It is the system that makes Pillar 2 ("The Server Is the Only Referee") structurally true rather than just policy: no client ever receives data it isn't entitled to, because redaction happens before the message ever leaves the server.

> **Quick reference** — Layer: `Core` · Priority: `MVP` · Key deps: `WebSocket Message Protocol, Player Identity/Session`

## Overview

This system defines how the server converts its one canonical `GameState`/`RoomState` object into the per-player payloads sent as `GAME_STATE_SYNC`/`ROOM_STATE_SYNC` (message shapes defined by WebSocket Message Protocol). On any state-changing action — a card played, a player joining, a setting changed — the server computes a redacted view for each connected client individually (their own hand in full, every other player's hand as a count only) and broadcasts it immediately; there is no delta/diff optimization at this game's scale, matching the concept prototype's validated approach (`prototypes/multiplayer-turn-loop-concept/`, PROCEED verdict). This system owns exactly one job: correct, timely, privacy-safe state delivery. It does not decide *what* the state contains (Rules Engines, Room/Lobby own that) and does not define message *shape* (WebSocket Message Protocol owns that) — it is the layer between "state changed" and "clients know about it," and the sole place where hand-privacy is enforced.

## Player Fantasy

Same as Card/Deck Primitives and WebSocket Message Protocol: pure infrastructure, no fantasy of its own. But its *failure mode* is unusually visible and damaging to player trust — if redaction ever leaked an opponent's hand contents, or if state ever went stale/desynced between clients, the entire premise of "the server is fair and everyone sees the truth" would break instantly and be hard to un-notice. This system's success is total invisibility: players should never think about "syncing," they should just always trust what's on their screen.

## Detailed Design

### Core Rules

1. The server maintains exactly one canonical state object per room: `RoomState` (membership, settings, lifecycle — owned by Room/Lobby) composed with `GameState` (hands, piles, turn, active color/side, pending stack — owned by whichever Rules Engine is active) once a game starts. This system never owns *what's in* that state — only how it's delivered.
2. `redact(canonicalState, forPlayerId)` is a pure function: given the canonical state and a target player's `playerId`, it returns a view containing: the target player's own `hand` (full `Card[]`, per Card/Deck Primitives' schema), every other player's `handCount` (integer only, never their `Card[]`), the discard pile's `topCard` only (never its full contents or order), the draw pile's `count` only (never its contents), and all non-hand/non-pile state unchanged (turn indicator, active color/side, pending stack, player list, settings).
3. `redact()` is called once per connected player, every time. There is no shared "redacted state" cached across players — each player's view is computed fresh from the canonical state at broadcast time, eliminating any risk of one player's redacted copy drifting inconsistent with another's.
4. **Broadcast trigger**: any server-side mutation to canonical `RoomState` or `GameState` (a card played, a card drawn, a player joining/leaving, a setting changed, a turn advancing, a stack changing) triggers an immediate full-state broadcast: `redact()` runs once per connected player in the room, and each receives their own `GAME_STATE_SYNC` (or `ROOM_STATE_SYNC` during lobby state) via their own socket.
5. No delta/diff updates — every broadcast carries the full redacted state, not just changed fields. This is a deliberate simplicity choice, validated by the concept prototype at this game's scale (≤12 players, small payloads).
6. This system is the **only** place a `Card`'s full contents are ever serialized to a client other than its owner (the owner's own hand) or via the discard pile's single `topCard`. No other system may bypass `redact()` to send raw canonical state.
7. Broadcasts to a disconnected socket are a silent no-op (Socket.IO handles this natively) — this system doesn't implement retry/queueing for offline players; reconnection's "catch-up" sync is Reconnection & Session Identity's concern, though it will call this same `redact()` function when a player reconnects.
8. This system runs entirely server-side. It has no client-side logic of its own — clients only ever render what `redact()` already decided they're entitled to see.
9. **Mutation-broadcast atomicity**: The broadcast triggered by a mutation (Core Rule 4) always reflects the exact canonical state immediately after that mutation completes — no second mutation may interleave between "mutation committed" and "broadcast computed" for the same room. This relies on the same single-threaded, in-order per-room processing guarantee established in Card/Deck Primitives and Room/Lobby: since all mutations to a given room's state are processed synchronously in sequence, and this system's broadcast call happens synchronously as part of that same processing step, no interleaving is possible by construction.
10. **Cross-room isolation**: A broadcast triggered by a mutation in Room A is only ever sent to sockets that are members of Room A. `redact()` and the broadcast mechanism operate on exactly one room's canonical state at a time and have no cross-room state access — a bug that leaked Room A's data into Room B's clients would be a violation of this rule, not an accepted edge case.
11. **`redact()` invalid-input behavior**: If `redact()` is called with a `forPlayerId` not present in the room's current player list, or with a malformed/null canonical state, it throws an error rather than returning a partial, empty, or best-guess view. This system never silently degrades on invalid input — a caller passing bad arguments is a programming error to surface immediately, not a runtime condition to paper over.

### States and Transitions

Not applicable — this system is a stateless transformation function plus a broadcast trigger; it holds no state of its own (it reads Room/Lobby's and the active Rules Engine's state, transforms it, and sends it).

### Interactions with Other Systems

| System | Data In | Data Out | Notes |
|---|---|---|---|
| Card/Deck Primitives | `Card`, `Deck`, `Pile`, `Hand` schemas | — | `redact()` operates on these exact shapes; never redefines them |
| Player Identity/Session | `playerId` (target for redaction) | — | Redaction is always computed "for `playerId` X"; `sessionId` never appears in any broadcast (Player Identity/Session's Core Rule 7/9) |
| WebSocket Message Protocol | — | `GAME_STATE_SYNC`, `ROOM_STATE_SYNC` payloads | This system decides *when* and *with what redacted content*; that GDD defines the payload's outer shape |
| Room/Lobby | Consumes `RoomState` (membership, settings, lifecycle) | — | Triggers a broadcast on every `RoomState` mutation Room/Lobby makes |
| Rules Engine — Normal UNO (and future modes) | Consumes `GameState` (hands, piles, turn, etc.) | — | Triggers a broadcast on every `GameState` mutation the active engine makes |
| Reconnection & Session Identity (future) | — | Will reuse `redact()` to build a rejoining player's catch-up state | This system's redaction logic is directly reusable, not reinvented, for reconnection |

## Formulas

> Note: broadcast cost per state change is O(N) — one `redact()` call and one message per connected player in the room. This is a bare linear fact, not a curve with a tunable shape, so it's stated here in prose rather than as a formula (consistent with Room Settings/Config's precedent for not force-fitting non-quantitative rules into this section).

### Redacted Payload Size (Sanity Check)

The redactedPayloadSize formula is defined as:

`redactedPayloadSize ≈ (ownHandSize × cardBytes) + (otherPlayers × handCountFieldBytes) + topCardBytes + drawCountBytes + baseStateBytes`

**Variables:**

| Variable | Symbol | Type | Range | Description |
|----------|--------|------|-------|-------------|
| Own hand size | ownHandSize | int | 0–~20+ (uncapped pending Rules Engine GDDs) | Card count in the redacted-for player's own hand |
| Bytes per serialized card | cardBytes | int | ~20–40 (JSON, color+value+id) | Estimated size of one `Card` object in the wire format |
| Other players | otherPlayers | int | 1–11 (room cap 12 per Room Settings/Config) | Opponents whose hand is reduced to a count |
| Hand-count field bytes | handCountFieldBytes | int | ~10–15 | Bytes for one `{playerId, handCount}` pair |
| Base state bytes | baseStateBytes | int | ~200–500 (est.) | Turn indicator, color/side, pending stack, player list, settings |
| Result | redactedPayloadSize | int (bytes) | unbounded upward, must stay < 16KB (WebSocket Message Protocol's cap) | Estimated size of one player's `GAME_STATE_SYNC` message |

**Expected output range**: Not clamped — this is a sanity-check estimate, not a runtime-enforced formula. If a worked example approaches the 16KB cap, that's a signal to revisit either the cap or hand-size assumptions once a Rules Engine GDD defines an actual hand-size cap (currently undefined — flagged in Open Questions).
**Example**: ownHandSize=20 (pathological large-hand case), cardBytes=30, otherPlayers=11, handCountFieldBytes=12, topCardBytes=30, drawCountBytes=10, baseStateBytes=400 → (20×30)+(11×12)+30+10+400 = 1,172 bytes. Comfortably under 16KB even in a worst-case room — confirms the existing 16KB knob has generous headroom and doesn't need tightening because of redaction specifically.

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Multiple state-changing actions occur in rapid succession within the same room (e.g. a card play immediately followed by a settings change, already resolved in-order per Room/Lobby's processing guarantee) | Each mutation triggers its own independent full broadcast — broadcasts are not batched or coalesced; clients may receive several `GAME_STATE_SYNC`/`ROOM_STATE_SYNC` messages in quick succession, each fully self-consistent | Simpler than batching logic; at this game's scale the bandwidth cost of un-batched broadcasts is negligible per the payload-size formula |
| `redact()` is called for a `playerId` that has disconnected (still a member per Room/Lobby, but `connected: false`) | `redact()` still computes their view normally (they're still "a player" in the room's data model) and the send attempt is a no-op per Core Rule 7 — no special-casing needed in `redact()` itself | Keeps `redact()` a pure function with no awareness of connection status; connection-awareness lives entirely at the send layer |
| A room has no active game yet (still in `lobby` state) | `redact()`/broadcast still applies, but operates on `RoomState` only — there is no `GameState` to redact yet, so the redacted view is simply the room's membership/settings, unchanged from canonical | `ROOM_STATE_SYNC` and `GAME_STATE_SYNC` are structurally similar but redaction only does meaningful work once hands exist |
| A hand size exceeds what the payload-size formula assumed (e.g. a future mode's hand grown very large from stacked draws) | Not a failure — the formula's worked example already covers a pathological 20-card hand with generous headroom under the 16KB cap; if a future mode's hand sizes could realistically exceed that, it's a signal to re-run the formula with that mode's actual numbers, not a runtime error condition | Formula is a design-time sanity check, not a runtime enforcement mechanism — no clamping/truncation logic is implied |
| Two players are redacted for in the same broadcast cycle and something about their views could accidentally leak into each other (e.g. a shared mutable object bug) | Not applicable by construction — Core Rule 3 requires `redact()` to be a pure function computing a fresh, independent view per call; an implementation sharing mutable references between two players' redacted views would violate this rule and must be caught in code review/testing | This is a correctness requirement on the implementation, stated here so it's testable, not a scenario the design needs a special-case rule for |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Card/Deck Primitives | This depends on | Redaction operates on `Card`/`Deck`/`Pile`/`Hand` schemas defined there |
| Player Identity/Session | This depends on | Redaction is keyed by `playerId`; `sessionId` must never appear in any broadcast |
| WebSocket Message Protocol | This depends on | Defines the outer shape of `GAME_STATE_SYNC`/`ROOM_STATE_SYNC`; this system fills in the (redacted) content |
| Room/Lobby | This depends on | Consumes `RoomState`; every mutation Room/Lobby makes triggers a broadcast |
| Rules Engine — Normal UNO (and future modes) | This depends on | Consumes `GameState`; every mutation an active engine makes triggers a broadcast |
| Reconnection & Session Identity (future) | Depended on by | Will reuse `redact()` for a rejoining player's catch-up sync rather than reinventing redaction |
| Game Table UI (future) | Depended on by | Renders exactly what `redact()` sends — the UI never has access to unredacted state |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| Broadcast strategy | Full state, every mutation, no batching | N/A — could later move to delta updates if scale demands it | N/A | N/A |
| `cardBytes` estimate (payload formula input) | ~20-40 bytes | Revisit if actual serialized `Card` size differs meaningfully once implemented | Larger estimate = more conservative (safer) payload-size sanity check | Smaller estimate = less conservative, risk of underestimating real payload size |

> Note: `maxPlayers`, message payload size cap, and rate-limit values are NOT tuning knobs here — they are owned by Room Settings/Config and WebSocket Message Protocol respectively, and referenced, not duplicated.

## Visual/Audio Requirements

Not applicable — this system is a pure data-transformation and broadcast layer with no rendering or sound. See **Game Table UI** and **Room/Lobby** GDDs for how the redacted state this system delivers is actually displayed.

## UI Requirements

Not applicable — no direct UI. See **Game Table UI** and **Room/Lobby** GDDs.

## Cross-References

| This Document References | Target GDD | Specific Element Referenced | Nature |
|---------------------------|-----------|------------------------------|--------|
| "redact() operates on Card/Deck/Pile/Hand schemas" | `design/gdd/card-deck-primitives.md` | Card/Deck/Pile/Hand schemas | Data dependency |
| "sessionId never appears in any broadcast" | `design/gdd/player-identity-session.md` | Core Rule 7/9 (sessionId/playerId separation) | Rule dependency |
| "fills the content of GAME_STATE_SYNC/ROOM_STATE_SYNC" | `design/gdd/websocket-message-protocol.md` | Message payload shapes | Data dependency |
| "16KB payload cap confirmed to have headroom" | `design/gdd/websocket-message-protocol.md` | Tuning Knobs — max payload size | Rule dependency |
| "12-player room cap used in payload formula" | `design/gdd/room-settings-config.md` | `maxPlayers` range | Data dependency |
| "triggers broadcast on every RoomState mutation" | `design/gdd/room-lobby.md` | Room lifecycle/membership mutations | Rule dependency |
| "will reuse redact() for reconnection catch-up" | `design/gdd/reconnection-session-identity.md` (not yet written) | Reconnect catch-up sync | Ownership handoff |

> Note: One target GDD is not yet written — provisional, flagged in Open Questions.

## Acceptance Criteria

### Core Rule 1 — Canonical State Composition
- [ ] GIVEN a room with an active game, WHEN the server's canonical state is inspected, THEN it consists of exactly one `RoomState` object (membership, settings, lifecycle) composed with exactly one `GameState` object (hands, piles, turn, active color/side, pending stack) — no second/duplicate canonical copy exists anywhere in server memory for that room.
- [ ] GIVEN a room still in lobby (no game started), WHEN the canonical state is inspected, THEN only `RoomState` exists — there is no `GameState` object yet.
- [ ] GIVEN this system's code, WHEN reviewed, THEN it contains no logic that determines *what* belongs in `RoomState`/`GameState` (that ownership stays with Room/Lobby and the active Rules Engine) — only logic that reads and transforms the existing canonical object.

### Core Rule 2 — `redact()` Function Behavior (hand-leak-critical)
- [ ] GIVEN a canonical state with player A holding a 7-card hand, WHEN `redact(canonicalState, 'A')` is called, THEN the returned view's `players['A'].hand` is a full `Card[]` array containing exactly those 7 `Card` objects.
- [ ] GIVEN a canonical state with players A, B, C in the room, WHEN `redact(canonicalState, 'A')` is called, THEN the returned view contains **no `Card[]` array and no individual `Card` object** anywhere under `players['B']` or `players['C']` — only an integer `handCount` field for each.
- [ ] GIVEN a canonical state with player B holding cards `[Red-5, Blue-Skip, Wild]`, WHEN `redact(canonicalState, 'A')` is called and the resulting JSON payload is searched for those card identifiers anywhere outside `players['A'].hand`, THEN zero matches are found.
- [ ] GIVEN a canonical state with a draw pile of N cards, WHEN `redact(canonicalState, forPlayerId)` is called for any `forPlayerId`, THEN the returned view's draw pile field is an integer `count` only — no array of draw-pile `Card` objects, no way to reconstruct order or contents.
- [ ] GIVEN a canonical state with a discard pile of M cards (M > 1), WHEN `redact()` is called, THEN the returned view's discard pile contains exactly one `Card` object (`topCard`) and no array or reference to the M-1 non-top cards.
- [ ] GIVEN a canonical state, WHEN `redact()` is called twice in succession for the same `forPlayerId` with no mutation between calls, THEN both calls return deep-equal results (pure function, deterministic).
- [ ] GIVEN `redact()` is called for a `forPlayerId` not present in the room, WHEN this occurs, THEN it throws per Core Rule 11 rather than returning a partial or empty view.
- [ ] GIVEN a canonical state, WHEN `redact()` is invoked, THEN it does not mutate the canonical `RoomState`/`GameState` object passed to it (verified by deep-equality check before vs. after).
- [ ] GIVEN the returned view for `forPlayerId`, WHEN non-hand/non-pile fields (turn indicator, active color/side, pending stack, player list, settings) are compared to canonical state, THEN they are unchanged — redaction only touches hand and pile fields.

### Core Rule 3 — Per-Player-Fresh Redaction, No Caching
- [ ] GIVEN a room with 3 connected players, WHEN a single broadcast cycle fires, THEN `redact()` is called exactly 3 times, each with a different `forPlayerId`.
- [ ] GIVEN two players A and B redacted for within the same broadcast cycle, WHEN their two returned view objects are inspected, THEN no mutable object (hand array, card object, pile object) is reference-shared between A's view and B's view.
- [ ] GIVEN player A's redacted view was computed at time T, WHEN the canonical state mutates at T+1 and a new broadcast fires, THEN player A's new view reflects the T+1 state — no stale cached copy is reused.

### Core Rule 4 — Broadcast Trigger on Any Mutation
- [ ] GIVEN an active game, WHEN a player plays a card, THEN a broadcast fires immediately after the mutation completes and every connected player receives an updated `GAME_STATE_SYNC`.
- [ ] GIVEN an active game, WHEN a player draws a card, THEN a broadcast fires reflecting the new draw pile count and the drawing player's new hand.
- [ ] GIVEN a room in lobby state, WHEN a player joins or leaves, THEN a broadcast fires and all connected players receive an updated `ROOM_STATE_SYNC`.
- [ ] GIVEN a room in lobby state, WHEN a setting changes, THEN a broadcast fires reflecting the new setting.
- [ ] GIVEN an active game, WHEN the turn advances or the pending stack changes, THEN a broadcast fires reflecting the change.
- [ ] GIVEN any server code path that mutates canonical state, WHEN inspected, THEN it is followed by (or guaranteed to trigger) a broadcast — no mutation path silently skips broadcasting.

### Core Rule 5 — No-Delta, Full-State Broadcasts
- [ ] GIVEN any single broadcast, WHEN the resulting payload is inspected, THEN it contains the complete redacted state, not a partial/diff.
- [ ] GIVEN a client that missed a previous broadcast, WHEN it receives the next one, THEN it can fully reconstruct correct current state from that single message alone.

### Core Rule 6 — "Only Place Card Contents Serialize to Non-Owners" Boundary Rule (hand-leak-critical)
- [ ] GIVEN the full server codebase, WHEN searched for outbound broadcast calls serializing `GameState`/`RoomState` (or any subset containing `Card[]`/`Hand`/pile contents), THEN the only such call sites are within this system's broadcast/redact code path.
- [ ] GIVEN a hypothetical code change adding a new outbound message emitting raw (non-redacted) `GameState` from outside this system, WHEN code review or an automated boundary test runs, THEN it is flagged/fails.
- [ ] GIVEN any broadcast payload, WHEN inspected, THEN the only full `Card` object present for players other than the target is the discard pile's single `topCard` (public information) — never any opponent's hand contents.
- [ ] GIVEN Player Identity/Session's rule that `sessionId` never appears in any broadcast, WHEN any payload is inspected, THEN it contains `playerId` references only.
- [ ] GIVEN a malicious or buggy client aggregating all received messages over an entire game session, WHEN analyzed, THEN it is impossible to reconstruct any opponent's hand or the draw pile's contents.

### Core Rule 7 — Disconnected-Socket No-Op
- [ ] GIVEN a player whose socket is disconnected but who remains a room member, WHEN a broadcast cycle fires, THEN `redact()` is still called for their `playerId`, but the send to their socket is a silent no-op — no error, no retry, no queueing.
- [ ] GIVEN a disconnected player's redact-and-send no-op, WHEN the broadcast cycle continues, THEN all other connected players still receive their broadcasts normally.

### Core Rule 8 — Server-Only, No Client Logic
- [ ] GIVEN the client-side codebase, WHEN searched for any implementation of `redact()` or hand/pile-filtering logic, THEN none exists client-side.
- [ ] GIVEN a client rendering opponents' hands, WHEN inspected, THEN it renders based solely on `handCount` integers in the payload.

### Core Rule 9 — Mutation-Broadcast Atomicity
- [ ] GIVEN a mutation to a room's canonical state, WHEN the resulting broadcast is computed, THEN it reflects exactly the state immediately after that mutation, with no interleaving second mutation reflected or missed.

### Core Rule 10 — Cross-Room Isolation
- [ ] GIVEN a mutation in Room A, WHEN the resulting broadcast is sent, THEN it is delivered only to sockets that are members of Room A — no client in any other room receives it.

### Core Rule 11 — `redact()` Invalid-Input Behavior
- [ ] GIVEN `redact()` is called with a `forPlayerId` not in the room's player list, WHEN this occurs, THEN it throws rather than returning a partial/empty/best-guess view.
- [ ] GIVEN `redact()` is called with a null or malformed canonical state, WHEN this occurs, THEN it throws rather than silently degrading.

### Payload-Size Formula
- [ ] GIVEN the worked example (ownHandSize=20, cardBytes=30, otherPlayers=11, handCountFieldBytes=12, topCardBytes=30, drawCountBytes=10, baseStateBytes=400), WHEN computed, THEN the result is 1,172 bytes, matching the documented example.
- [ ] GIVEN a room at the 12-player cap with a pathological 20-card hand, WHEN the actual implemented `redact()` output is serialized and measured, THEN its byte size stays under the 16KB cap.

### Edge Cases
- [ ] GIVEN a card play immediately followed by a settings change, WHEN both are processed in order, THEN two independent full broadcasts fire, each self-consistent with the state at generation time.
- [ ] GIVEN a `playerId` that is a room member but currently disconnected, WHEN `redact()` is called for them, THEN it computes and returns a normal, valid view with no special-casing.
- [ ] GIVEN a room with no active game (lobby state only), WHEN a broadcast fires, THEN the redacted view contains `RoomState` data unchanged from canonical, with no `GameState`/hand/pile fields.
- [ ] GIVEN a hand size exceeding the formula's worked example, WHEN discovered, THEN it is treated as a signal to re-run the formula with real numbers, not a runtime error or clamp.
- [ ] GIVEN two players redacted for within the same broadcast cycle, WHEN their view objects are inspected via automated reference-identity checks, THEN no shared mutable reference exists between them.

### Cross-Cutting / Non-Functional
- [ ] GIVEN this system implements Pillar 2, WHEN a full game session is played end-to-end with browser dev tools inspecting all inbound WebSocket frames, THEN at no point does any frame received by a non-owning client contain another player's hand card, draw pile contents, or more than the single discard `topCard`.

## Open Questions

| Question | Owner | Deadline | Resolution |
|----------|-------|----------|-----------|
| Is there a defined upper-bound latency budget for "immediate" broadcast (Core Rule 4), e.g. "within X ms of mutation"? Currently undefined, making performance regressions untestable | network-programmer | Before/during implementation, informed by real measurement | Open — not solved here; flagged so it isn't assumed to be an unbounded/unspecified SLA forever |
| Reconnection & Session Identity will reuse `redact()` for catch-up sync (per Dependencies/Cross-References), but this can't be tested until that GDD exists | design-system author (when that GDD is written) | When Reconnection & Session Identity is authored | Open — tracked explicitly so the reuse isn't lost |
| Does a disconnected-socket send failure (Core Rule 7's no-op) risk throwing an unhandled exception that could interrupt the broadcast loop for OTHER connected players in the same cycle? | gameplay-programmer / network-programmer | Before implementation | Open — the no-op is specified as silent, but the underlying send-failure handling mechanism (try/catch per-socket vs. one big loop) isn't specified at the design level |
| Cross-References point to 1 GDD not yet written (Reconnection & Session Identity) | design-system author (next GDDs in order) | When authored | Open — must be verified, not assumed |
