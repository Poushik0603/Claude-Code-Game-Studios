# Room Settings/Config

> **Status**: In Design
> **Author**: user + agents
> **Last Updated**: 2026-09-29
> **Last Verified**: 2026-09-29
> **Implements Pillar**: Pillar 1 (Zero Friction to the Table)

## Summary

Room Settings/Config defines the configurable state of a room before and during setup — max player count, selected game mode, and house-rule toggles like Normal UNO's optional "0-7 Rule" and the turn timer duration. It is the data model behind the brief's room-creation screen and the host's in-lobby settings controls, and it exists to give every other system (Room/Lobby, the Rules Engines, Turn Timer) one authoritative, host-editable source of truth for "how is this room configured" — so a setting is never read differently by two systems.

> **Quick reference** — Layer: `Core` · Priority: `MVP` · Key deps: `Player Identity/Session`

## Overview

This system defines the `RoomSettings` data shape and the rules for who can change it and when. A room's settings are set once at creation (`maxPlayers`, `mode`) and remain host-editable while the room is in lobby state via the `UPDATE_ROOM_SETTINGS` intent (already named in the WebSocket Message Protocol GDD). The settings schema includes fields for features not yet buildable — `mode` accepts all four modes named in the brief (`"normal"`, `"no_mercy"`, `"flip"`, `"dos"`) even though only Normal UNO's Rules Engine exists yet, and `turnTimerSeconds` exists even though Turn Timer's own logic is Vertical-Slice-tier — so the room-creation UI, host settings panel, and underlying schema are all built once and don't need reshaping later as more modes/features come online. This system does not implement the room itself (that's Room/Lobby), does not implement any mode's rules (Rules Engines), and does not implement the timer's countdown behavior (Turn Timer) — it only owns the configuration values those systems read.

## Player Fantasy

This is the brief moment of "setting up the table" before the game begins — picking how many people can join and which flavor of UNO you're about to play. It's small but it matters: seeing all four mode cards (including "DOS — coming soon") signals the game's full ambition even before you've played a single hand, and the max-player stepper going up to 12 signals "bring the whole group, not just a couple friends." The 0-7 Rule toggle is a quieter fantasy beat for returning players — the moment a host who knows the house rule variant realizes "oh, they thought of that too." None of this should feel like configuration in the enterprise-software sense — it's closer to picking house rules before dealing a physical deck.

## Detailed Design

### Core Rules

1. A `RoomSettings` object is created at room creation time with these fields:

   | Field | Type | Default | Notes |
   |---|---|---|---|
   | `maxPlayers` | int | 4 | Valid range 2–12 (brief's stated room-size range) |
   | `mode` | `"normal" \| "no_mercy" \| "flip" \| "dos"` | `"normal"` | Only `"normal"` is startable in MVP (Core Rule 6) |
   | `zeroSevenRule` | boolean | `false` | Meaning depends on `mode` — see Core Rule 3 |
   | `turnTimerSeconds` | `0 \| 15 \| 30 \| 60` | `0` (off) | `0` means no timer; unused until Turn Timer's own GDD implements countdown behavior |

2. `RoomSettings` is created once, at the same moment the room itself is created (a flow Room/Lobby owns) — this system defines the shape and validation rules, not the room-creation trigger itself.
3. `zeroSevenRule`'s effective meaning is derived, not just stored, based on `mode`:
   - `mode: "normal"` → `zeroSevenRule` is host-togglable; effective value is whatever is stored (default `false`).
   - `mode: "no_mercy"` → effective value is always `true`, regardless of what's stored — No Mercy's 0/7 mechanic is mandatory per the brief. The settings UI does not show this toggle for No Mercy rooms (it's not a meaningful choice to present).
   - `mode: "flip"` or `"dos"` → effective value is always `false` / not applicable — neither mode has a 0/7 mechanic. The settings UI does not show this toggle for these modes.
4. Only the host (identified by `playerId`, per Player Identity/Session) may send `UPDATE_ROOM_SETTINGS`. The server validates this on every request — this is not a client-side-only restriction.
5. `UPDATE_ROOM_SETTINGS` is only valid while the room is in lobby state (before `START_GAME` succeeds). Once a game is active, settings are locked for that round/match — mid-game rule changes are out of scope entirely (not deferred, not planned).
6. `START_GAME` validates `mode` against the set of modes with an implemented Rules Engine. In MVP, only `"normal"` passes this check; `"no_mercy"`, `"flip"`, `"dos"` are valid *settings* values (so the room-creation UI can show all four mode cards) but cause `START_GAME` to fail with a clear error (e.g. `"MODE_NOT_YET_AVAILABLE"`) until each mode's Rules Engine is built.
7. `maxPlayers` can be lowered by the host at any point during lobby state, but never below the current number of players already in the room (validated server-side) — this prevents a host from accidentally locking out players who already joined.
8. `UPDATE_ROOM_SETTINGS` accepts a **partial** payload — any subset of `maxPlayers`, `mode`, `zeroSevenRule`, `turnTimerSeconds` may be included; omitted fields are left unchanged. Each included field is validated independently; if any included field fails validation, the entire request is rejected atomically (no partial application) — the settings object is either fully updated with all included, valid fields, or not changed at all.
9. `UPDATE_ROOM_SETTINGS` requests are processed by the server one at a time per room (the same single-threaded, in-order room-processing guarantee established for card/pile operations in the Card/Deck Primitives GDD) — if two requests arrive close together (e.g. a double-click, or two devices both authenticated as host), they are applied in the order the server receives them, and the second simply overwrites whatever the first changed (last-write-wins); no explicit locking or versioning is needed at this system's scale.

### States and Transitions

Not applicable — `RoomSettings` itself is a plain data object with no internal state machine of its own; its *editability* is gated by Room/Lobby's room-level state (lobby vs. active-game vs. results), which that GDD owns.

### Interactions with Other Systems

| System | Data In | Data Out | Notes |
|---|---|---|---|
| Player Identity/Session | Consumes `playerId` to validate host identity | — | Host-only checks (Core Rule 4) compare the sender's `playerId` against the room's recorded host `playerId` |
| WebSocket Message Protocol | Consumes `UPDATE_ROOM_SETTINGS { maxPlayers?, mode? }` | — | This GDD extends that payload's implied shape to the full `RoomSettings` fields (`zeroSevenRule`, `turnTimerSeconds` also settable, not just the two originally named) |
| Room/Lobby | — | `RoomSettings` object, host `playerId`, lobby-state gating | Room/Lobby owns the room's lifecycle state and enforces when settings edits are allowed |
| Rules Engine — Normal UNO | — | Effective `zeroSevenRule` value | Engine reads this to know whether to enable the 0/7 mechanic for that room |
| Rules Engine — No Mercy (future) | — | Effective `zeroSevenRule` value (always `true`) | Engine doesn't need to re-derive this — it's always on for No Mercy per Core Rule 3 |
| Turn Timer (future, Vertical Slice) | — | `turnTimerSeconds` | Turn Timer's own GDD will implement the countdown/auto-draw behavior this value configures |

## Formulas

Not applicable — this system is a settings/validation data model, not a calculation system. Its only candidate rule (the `maxPlayers` floor check against current player count) is a boolean validation gate with no computed numeric output or tunable constant, and is documented in Edge Cases instead. Settings-object memory footprint is trivial at this schema's size and out of scope (a Room/Lobby lifecycle or infra concern, not this document's).

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Host attempts to set `maxPlayers` below the current number of players already in the room | `UPDATE_ROOM_SETTINGS` is rejected with `ERROR_MSG` (e.g. `code: "MAX_PLAYERS_BELOW_CURRENT"`); settings remain unchanged | Prevents a host from accidentally locking out players already in the room (Core Rule 7) |
| A non-host player sends `UPDATE_ROOM_SETTINGS` | Rejected with `ERROR_MSG` (`code: "NOT_HOST"`); settings remain unchanged | Only the host may change settings (Core Rule 4) — enforced server-side, never trusted from client |
| `UPDATE_ROOM_SETTINGS` is sent while the room is in active-game or results state | Rejected with `ERROR_MSG` (e.g. `code: "SETTINGS_LOCKED"`); settings remain unchanged | Settings are only editable during lobby state (Core Rule 5) |
| A `mode` value outside the defined enum (`"normal" \| "no_mercy" \| "flip" \| "dos"`) is submitted | Rejected with `ERROR_MSG` (`code: "INVALID_PAYLOAD"`, consistent with the WebSocket Message Protocol GDD's schema-validation edge case); settings remain unchanged | Never silently coerce or ignore invalid input — fail loudly and explicitly |
| Host attempts `START_GAME` while `mode` is `"no_mercy"`, `"flip"`, or `"dos"` (not yet implemented) | Rejected with `ERROR_MSG` (`code: "MODE_NOT_YET_AVAILABLE"`); room remains in lobby state | Core Rule 6 — these are valid settings values but not yet startable |
| `turnTimerSeconds` is submitted with a value outside `{0, 15, 30, 60}` | Rejected with `ERROR_MSG` (`code: "INVALID_PAYLOAD"`) | Same fail-loud principle as the `mode` enum case |
| Host toggles `zeroSevenRule` while `mode` is `"no_mercy"`, `"flip"`, or `"dos"` | The stored value may still update (harmless — no UI surfaces the toggle for these modes per Core Rule 3), but the *effective* value used by any Rules Engine is always the mode-derived one, never the stored one | Keeps the derivation rule (Core Rule 3) the single source of truth, so a stray/legacy stored value can never accidentally leak into gameplay for a mode where it shouldn't apply |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Player Identity/Session | This depends on | Needs `playerId` to validate host identity on every `UPDATE_ROOM_SETTINGS` request |
| WebSocket Message Protocol | Soft — extends its catalog | Fills out the full shape of `UPDATE_ROOM_SETTINGS`'s payload |
| Room/Lobby | Depended on by | Room/Lobby creates the `RoomSettings` object at room creation and enforces lobby-state gating on edits |
| Rules Engine — Normal UNO | Depended on by | Reads effective `zeroSevenRule` to enable/disable the 0/7 mechanic |
| Rules Engine — No Mercy (future) | Depended on by | Reads effective `zeroSevenRule` (always `true`) |
| Turn Timer (future, Vertical Slice) | Depended on by | Reads `turnTimerSeconds` to configure countdown behavior |
| DOS Placeholder | Depended on by | Reads `mode` to know when to show "coming soon" vs. a real DOS option |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `maxPlayers` default | 4 | 2–12 | Larger default rooms feel more "party-ready" out of the box | Smaller default may undersell the game's party-scale ambition |
| `maxPlayers` absolute ceiling | 12 | Fixed by brief — not designer-adjustable without a new decision | A higher ceiling risks UI/table-layout and sync-performance problems at scale (flagged as a High-Risk item in systems-index.md) | N/A |
| `turnTimerSeconds` allowed values | `{0, 15, 30, 60}` | Any small closed set is safe; more granularity adds UI complexity for little player benefit | More options = more choice, marginal value | Fewer options = simpler UI, less flexibility |
| `zeroSevenRule` default (Normal UNO) | `false` (off) | N/A — a boolean, "off by default" is a deliberate product decision (Normal UNO stays close to official rules unless the host opts in) | N/A | N/A |

## Visual/Audio Requirements

Not applicable — this system defines the settings data schema and validation rules, not the room-creation screen or settings panel UI. See the **Room/Lobby** GDD (not yet written) for the visual spec of the mode-selection cards, `maxPlayers` stepper, and toggle controls that read/write this system's data.

## UI Requirements

Not applicable — no direct UI owned by this system. See the **Room/Lobby** GDD for the room-creation and settings-panel screens.

## Cross-References

| This Document References | Target GDD | Specific Element Referenced | Nature |
|---------------------------|-----------|------------------------------|--------|
| "host identity validated via `playerId`" | `design/gdd/player-identity-session.md` | `playerId` (public-safe reference) | Data dependency |
| "`UPDATE_ROOM_SETTINGS` intent extended with full RoomSettings shape" | `design/gdd/websocket-message-protocol.md` | `UPDATE_ROOM_SETTINGS { maxPlayers?, mode? }` payload | Rule dependency |
| "Rules Engine — Normal UNO reads effective `zeroSevenRule`" | `design/gdd/rules-engine-normal-uno.md` (not yet written) | 0/7 mechanic toggle | Data dependency |
| "No Mercy's 0/7 is mandatory, always `true`" | `design/gdd/rules-engine-no-mercy.md` (not yet written) | Mandatory 0/7 mechanic | Rule dependency |
| "Room/Lobby creates RoomSettings and enforces lobby-state gating" | `design/gdd/room-lobby.md` (not yet written) | Room lifecycle state machine | Ownership handoff |
| "Turn Timer reads `turnTimerSeconds`" | `design/gdd/turn-timer.md` (not yet written) | Countdown/auto-draw behavior | Data dependency |

> Note: Most target GDDs are not yet written — provisional, flagged in Open Questions, same caveat as prior GDDs.

## Acceptance Criteria

### Schema, Defaults, and Ranges (Core Rule 1)
- [ ] GIVEN a new room is created with no explicit settings payload, WHEN `RoomSettings` is initialized, THEN `maxPlayers` is `4`, `mode` is `"normal"`, `zeroSevenRule` is `false`, and `turnTimerSeconds` is `0`.
- [ ] GIVEN a room-creation or `UPDATE_ROOM_SETTINGS` request sets `maxPlayers` to any integer in `2–12` inclusive, WHEN the request is validated, THEN it is accepted.
- [ ] GIVEN a room-creation or `UPDATE_ROOM_SETTINGS` request sets `maxPlayers` to `1` or `13`, WHEN the request is validated, THEN it is rejected with `ERROR_MSG code: "INVALID_PAYLOAD"` and `maxPlayers` remains unchanged.
- [ ] GIVEN a request sets `mode` to one of `"normal"`, `"no_mercy"`, `"flip"`, `"dos"`, WHEN the request is validated, THEN it is accepted as a stored value regardless of whether that mode's Rules Engine exists yet.
- [ ] GIVEN a request sets `turnTimerSeconds` to one of `0`, `15`, `30`, `60`, WHEN the request is validated, THEN it is accepted.

### zeroSevenRule Derivation — Core Rule 3 (per-mode effective value)
- [ ] GIVEN `mode` is `"normal"` and stored `zeroSevenRule` is `false` (default), WHEN any Rules Engine reads the effective value, THEN the effective value is `false`.
- [ ] GIVEN `mode` is `"normal"` and the host sets stored `zeroSevenRule` to `true`, WHEN any Rules Engine reads the effective value, THEN the effective value is `true`.
- [ ] GIVEN `mode` is `"normal"`, WHEN the settings UI is rendered, THEN the `zeroSevenRule` toggle is shown and is host-editable.
- [ ] GIVEN `mode` is `"no_mercy"` and stored `zeroSevenRule` is `false`, WHEN any Rules Engine reads the effective value, THEN the effective value is `true` (mandatory), overriding the stored value.
- [ ] GIVEN `mode` is `"no_mercy"` and stored `zeroSevenRule` is `true`, WHEN any Rules Engine reads the effective value, THEN the effective value is `true`.
- [ ] GIVEN `mode` is `"no_mercy"`, WHEN the settings UI is rendered, THEN the `zeroSevenRule` toggle is not shown.
- [ ] GIVEN `mode` is `"flip"` and stored `zeroSevenRule` is `true`, WHEN any Rules Engine reads the effective value, THEN the effective value is `false` (not applicable), overriding the stored value.
- [ ] GIVEN `mode` is `"flip"` and stored `zeroSevenRule` is `false`, WHEN any Rules Engine reads the effective value, THEN the effective value is `false`.
- [ ] GIVEN `mode` is `"flip"`, WHEN the settings UI is rendered, THEN the `zeroSevenRule` toggle is not shown.
- [ ] GIVEN `mode` is `"dos"` and stored `zeroSevenRule` is `true`, WHEN any Rules Engine or consumer reads the effective value, THEN the effective value is `false` (not applicable), overriding the stored value.
- [ ] GIVEN `mode` is `"dos"` and stored `zeroSevenRule` is `false`, WHEN any Rules Engine or consumer reads the effective value, THEN the effective value is `false`.
- [ ] GIVEN `mode` is `"dos"`, WHEN the settings UI is rendered, THEN the `zeroSevenRule` toggle is not shown.
- [ ] GIVEN a room with `mode: "normal"` and stored `zeroSevenRule: true`, WHEN the host changes `mode` to `"no_mercy"` via `UPDATE_ROOM_SETTINGS` (without touching `zeroSevenRule`), THEN the stored `zeroSevenRule` value is left as `true` in the data object, but the effective value used by any engine is always recomputed from current `mode`, never cached from a prior mode.
- [ ] GIVEN a room with `mode: "no_mercy"` (effective `zeroSevenRule` forced `true`) and stored `zeroSevenRule: false`, WHEN the host changes `mode` to `"flip"`, THEN the effective value immediately becomes `false` per the `"flip"` rule, independent of the stored boolean.

### Host-Only Enforcement (Core Rule 4)
- [ ] GIVEN a player who is the recorded room host sends `UPDATE_ROOM_SETTINGS` with a valid payload, WHEN the server validates the request, THEN the settings update is accepted and applied.
- [ ] GIVEN a player who is NOT the recorded room host sends `UPDATE_ROOM_SETTINGS`, WHEN the server validates the request, THEN it is rejected with `ERROR_MSG code: "NOT_HOST"` and settings remain unchanged.
- [ ] GIVEN a non-host client bypasses UI restrictions and sends `UPDATE_ROOM_SETTINGS` directly over the WebSocket connection, WHEN the server receives the request, THEN it is rejected server-side with `code: "NOT_HOST"` (enforcement is not solely a client-side UI restriction).

### Lobby-State-Only Editability (Core Rule 5)
- [ ] GIVEN the room is in lobby state, WHEN the host sends a valid `UPDATE_ROOM_SETTINGS` request, THEN the update is accepted.
- [ ] GIVEN the room is in active-game state (after `START_GAME` has succeeded), WHEN the host sends `UPDATE_ROOM_SETTINGS`, THEN it is rejected with `ERROR_MSG code: "SETTINGS_LOCKED"` and settings remain unchanged.
- [ ] GIVEN the room is in results state, WHEN the host sends `UPDATE_ROOM_SETTINGS`, THEN it is rejected with `ERROR_MSG code: "SETTINGS_LOCKED"` and settings remain unchanged.

### START_GAME Mode Availability Gate (Core Rule 6)
- [ ] GIVEN `mode` is `"normal"`, WHEN the host sends `START_GAME`, THEN the mode-availability check passes (game may proceed, subject to any other Room/Lobby preconditions).
- [ ] GIVEN `mode` is `"no_mercy"`, WHEN the host sends `START_GAME`, THEN it is rejected with `ERROR_MSG code: "MODE_NOT_YET_AVAILABLE"` and the room remains in lobby state.
- [ ] GIVEN `mode` is `"flip"`, WHEN the host sends `START_GAME`, THEN it is rejected with `ERROR_MSG code: "MODE_NOT_YET_AVAILABLE"` and the room remains in lobby state.
- [ ] GIVEN `mode` is `"dos"`, WHEN the host sends `START_GAME`, THEN it is rejected with `ERROR_MSG code: "MODE_NOT_YET_AVAILABLE"` and the room remains in lobby state.

### maxPlayers Floor Rule (Core Rule 7)
- [ ] GIVEN a room currently has N players joined, WHEN the host sends `UPDATE_ROOM_SETTINGS` with `maxPlayers >= N`, THEN the update is accepted.
- [ ] GIVEN a room currently has N players joined, WHEN the host sends `UPDATE_ROOM_SETTINGS` with `maxPlayers < N`, THEN it is rejected with `ERROR_MSG code: "MAX_PLAYERS_BELOW_CURRENT"` and `maxPlayers` remains unchanged.
- [ ] GIVEN a room has exactly `maxPlayers` players joined (at capacity), WHEN the host sends `UPDATE_ROOM_SETTINGS` with `maxPlayers` set to the same current value, THEN the update is accepted (no floor violation at equality).

### Partial Updates and Atomicity (Core Rule 8)
- [ ] GIVEN a valid `UPDATE_ROOM_SETTINGS` payload containing only `{ maxPlayers }`, WHEN the server processes it, THEN only `maxPlayers` changes and `mode`, `zeroSevenRule`, `turnTimerSeconds` remain at their prior values.
- [ ] GIVEN a payload containing both a valid `maxPlayers` and an invalid `turnTimerSeconds` (e.g. `45`), WHEN the server processes it, THEN the entire request is rejected — `maxPlayers` is NOT updated, consistent with atomic all-or-nothing application.

### Concurrent Requests (Core Rule 9)
- [ ] GIVEN two `UPDATE_ROOM_SETTINGS` requests from the host arrive in quick succession (e.g. double-click), WHEN the server processes them, THEN they are applied in the order received, and the final state reflects the second request's changes (last-write-wins), with no corruption or merged/partial state.

### Edge Cases
- [ ] GIVEN a room with 5 players joined, WHEN the host sends `UPDATE_ROOM_SETTINGS` with `maxPlayers: 3`, THEN it is rejected with `code: "MAX_PLAYERS_BELOW_CURRENT"` and settings remain unchanged.
- [ ] GIVEN a non-host player, WHEN they send `UPDATE_ROOM_SETTINGS` with any payload, THEN it is rejected with `code: "NOT_HOST"` and settings remain unchanged.
- [ ] GIVEN the room is in active-game or results state, WHEN `UPDATE_ROOM_SETTINGS` is sent by the host, THEN it is rejected with `code: "SETTINGS_LOCKED"` and settings remain unchanged.
- [ ] GIVEN a request sets `mode` to a value outside `"normal" | "no_mercy" | "flip" | "dos"` (e.g. `"classic"` or `null`), WHEN the request is validated, THEN it is rejected with `code: "INVALID_PAYLOAD"` and settings remain unchanged.
- [ ] GIVEN `mode` is `"no_mercy"`, `"flip"`, or `"dos"` at `START_GAME` time, WHEN the host sends `START_GAME`, THEN it is rejected with `code: "MODE_NOT_YET_AVAILABLE"` and the room remains in lobby state.
- [ ] GIVEN a request sets `turnTimerSeconds` to a value outside `{0, 15, 30, 60}` (e.g. `45`), WHEN the request is validated, THEN it is rejected with `code: "INVALID_PAYLOAD"` and settings remain unchanged.
- [ ] GIVEN `mode` is `"no_mercy"`, `"flip"`, or `"dos"`, WHEN the host toggles `zeroSevenRule` via a direct `UPDATE_ROOM_SETTINGS` call (bypassing the UI, which doesn't surface the control), THEN the stored `zeroSevenRule` value updates successfully, but the effective value read by any Rules Engine or consumer remains the mode-derived value from Core Rule 3, never the newly stored value.

## Open Questions

| Question | Owner | Deadline | Resolution |
|----------|-------|----------|-----------|
| When the host successfully updates settings, what do OTHER lobby members receive (a `ROOM_STATE_SYNC` broadcast presumably) — this GDD defines the data change but not the resulting sync/broadcast contract | design-system author (when Room/Lobby GDD is written) | When Room/Lobby GDD is authored | Open |
| Does the settings UI silently revert/hide a stored `zeroSevenRule` value when `mode` changes away from and back to `"normal"`, or does the host see a stale toggle state? | design-system author (when Room/Lobby GDD is written) | When Room/Lobby GDD is authored | Open — data-layer behavior (stored value persists) is fully specified and tested here; UI-facing consequence is Room/Lobby's scope |
| Is there a separate MINIMUM player-count check at `START_GAME` time (e.g. "need at least 2 players to start"), distinct from the `maxPlayers` capacity floor this GDD owns? | design-system author (when Room/Lobby GDD is written) | When Room/Lobby GDD is authored | Open — likely Room/Lobby's scope, flagged so it isn't mistaken for already covered here |
| Cross-References point to 4 GDDs that don't exist yet (Rules Engine — Normal UNO / No Mercy, Room/Lobby, Turn Timer) | design-system author (next GDDs in order) | When each is authored | Open — must be verified, not assumed |
