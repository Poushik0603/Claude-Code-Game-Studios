# Reconnection & Session Identity

> **Status**: In Design
> **Author**: user + agents
> **Last Updated**: 2026-09-29
> **Last Verified**: 2026-09-29
> **Implements Pillar**: Pillar 3 (Never Lose Your Seat)

## Summary

Reconnection & Session Identity is the system that makes Pillar 3 concretely real: when a player disconnects — WiFi drop, phone lock, browser crash — their seat, hand, and turn position are held for a grace period and restored exactly on reconnect, using the same `sessionId` mechanism Player Identity/Session established. It reuses Networking/State Sync's `redact()` function to build the reconnecting player's catch-up view, and works entirely within the state model Room/Lobby already defined (the `disconnected` player state, host migration) — this GDD's job is specifically the timing (how long to wait) and the catch-up mechanics (how to make a returning player whole again).

> **Quick reference** — Layer: `Core` · Priority: `MVP` · Key deps: `Player Identity/Session, Networking/State Sync`

## Overview

This system defines what happens in the window between a player's socket disconnecting and either their reconnecting or being evicted. On disconnect, a 60-second grace period begins during which their `Player` record (per Room/Lobby) is retained exactly as-is — hand, seat position, host status if applicable — and if it was their turn when they dropped, the game simply pauses on their turn rather than auto-skipping or auto-drawing for them. If they reconnect (same `sessionId`, submitted via the resume mechanism Player Identity/Session's Core Rule 4 already defined) within the grace period, this system builds their catch-up state by calling Networking/State Sync's `redact()` for their `playerId` against the current canonical state and sends it as a fresh `GAME_STATE_SYNC`/`ROOM_STATE_SYNC` — they see exactly where the game is now, with no gaps or stale data. If the grace period expires with no reconnect, this system hands off to Room/Lobby's existing removal/host-migration logic (Core Rules 6-7 of that GDD) — this system does not reimplement eviction, only decides *when* it's triggered. This system does not implement the underlying `sessionId` resume handshake (Player Identity/Session owns that) or the redaction logic itself (Networking/State Sync owns that) — it is the timing and orchestration layer that sits between disconnect and either recovery or removal.

## Player Fantasy

The brief says it directly: "losing your cards because your phone died for ten seconds would ruin the game — this matters a lot to me." This system exists entirely to prevent that specific fear. The player fantasy here is relief, not delight — the moment a dropped connection comes back and the game is just... still there, exactly as you left it, nobody having taken advantage of your absence, your hand untouched, your turn still waiting if it was yours. It's the anti-anxiety system: players shouldn't have to think "I hope my connection holds" during a tense moment (a big Wild Draw 4 decision, a No Mercy stack about to blow up). If this system fails even once — a lost hand, a skipped turn that shouldn't have been skipped, a seat given away too fast — it validates the exact fear the brief called out, and that's a harder trust to rebuild than almost any other failure in this game.

## Detailed Design

### Core Rules

1. **Grace period trigger**: When a player's socket disconnects while they hold room membership (any room state: `lobby`, `active_game`, `results`), a 60-second grace period timer starts immediately for that `Player` record. Their `connected` field flips to `false` (per Room/Lobby's `disconnected` state) but their `Player` record — hand, seat/join order, host status — is retained unchanged.
2. **Uniform timing**: The 60-second grace period applies identically regardless of which room state the disconnect occurs in. There is no separate lobby-vs-active-game timer.
3. **Paused turn on disconnect**: If the disconnected player held the current turn in an active game, the turn does not advance, auto-skip, or auto-draw during the grace period — the game simply waits. (This is independent of and unrelated to the optional Turn Timer feature, which governs normal per-turn pacing, not disconnection.)
4. **Reconnect within grace period**: If a client submits the disconnected session's `sessionId` (via the resume mechanism defined in Player Identity/Session's Core Rule 4) before the grace period expires, this system: (a) flips `connected` back to `true` for that `Player` record, (b) cancels the grace-period timer, (c) calls Networking/State Sync's `redact(canonicalState, playerId)` for the reconnecting player to build their catch-up view, and (d) sends that view as a fresh `GAME_STATE_SYNC` or `ROOM_STATE_SYNC` (depending on current room state) directly to the reconnecting client — no waiting for the next natural broadcast trigger.
5. **Reconnect broadcast to others**: On successful reconnection, all other connected clients in the room receive `PLAYER_RECONNECTED { playerId }` (per WebSocket Message Protocol's catalog) so their connection-status UI updates.
6. **Grace period expiry**: If no reconnect occurs within 60 seconds, this system hands off to Room/Lobby's existing removal logic (that GDD's Core Rule 7, "Leaving") — the `Player` record is removed from membership entirely, triggering host migration (Room/Lobby Core Rule 6) if the disconnected player was host. This system does not reimplement that removal/migration logic, only triggers it at the correct time.
7. **Late reconnect after eviction**: If a client submits a `sessionId` whose grace period has already expired (the `Player` record was already removed), this system has no special handling — the client falls through to Player Identity/Session's Core Rule 4 "unrecognized `sessionId`" path (issued a fresh session) and, if they want back in, must go through Room/Lobby's normal `JOIN_ROOM` flow like any new joiner, subject to that room's current state (rejected if `active_game`/`results`, per Room/Lobby Core Rule 8).
8. **Multiple simultaneous disconnects**: Each disconnected player gets their own independent 60-second timer, tracked per `playerId` — one player's grace period expiring has no effect on another's.
9. **Host disconnect during grace period**: If the disconnecting player is host, Room/Lobby's host migration (Core Rule 6 of that GDD) triggers *immediately* on disconnect, not after the grace period — the room is never left without a host for 60 seconds. The original host's `Player` record still starts its own grace period independently and can still reconnect within it (rejoining as a regular member, not automatically reclaiming host status — migration is one-directional per Room/Lobby's design).

### States and Transitions

| State | Entry Condition | Exit Condition | Behavior |
|-------|----------------|----------------|----------|
| `connected` | Player joins or successfully reconnects | Socket disconnects | Normal participation; no grace timer running |
| `grace_period` | Socket disconnects while a member | Reconnect (→ `connected`) or 60s elapse (→ evicted, handled by Room/Lobby) | `Player` record retained unchanged; if their turn, game pauses; timer running |

### Interactions with Other Systems

| System | Data In | Data Out | Notes |
|---|---|---|---|
| Player Identity/Session | Consumes the `sessionId` resume mechanism (that GDD's Core Rule 4) | — | This system's reconnect trigger *is* that resume mechanism firing while room membership exists |
| Networking/State Sync | Consumes `redact(canonicalState, playerId)` | — | Reused verbatim for catch-up sync, not reimplemented (per that GDD's Dependencies/Cross-References) |
| Room/Lobby | Consumes `Player` record model, host migration (Core Rule 6), removal (Core Rule 7) | Triggers host migration immediately on host disconnect; triggers removal at grace-period expiry | This system decides *when*; Room/Lobby's existing logic decides *what happens* |
| WebSocket Message Protocol | — | `PLAYER_DISCONNECTED` (already defined), `PLAYER_RECONNECTED` (already defined) | This system is what actually fires these at the correct moments |
| Rules Engine — Normal UNO (and future modes) | — | Turn-pause signal when the disconnected player held the turn | The active engine must respect this system's "don't advance the turn" signal during grace period |

## Formulas

Not applicable — this system is a timing/state-machine layer, not a quantitative one. Its single numeric parameter (the 60-second grace period) is a fixed constant applied uniformly per Core Rule 2, not a function of any variable — it belongs in Tuning Knobs, not here. No other aspect of this system (turn-pause, host migration timing, race resolution) varies continuously or produces a calculated output; each is a discrete rule already fully specified in Detailed Design. See Edge Cases for the reconnect/expiry race resolution and Tuning Knobs for the grace-period constant and its safe range.

## Edge Cases

[To be designed]

## Dependencies

[To be designed]

## Tuning Knobs

[To be designed]

## Visual/Audio Requirements

[To be designed]

## UI Requirements

[To be designed]

## Cross-References

[To be designed]

## Acceptance Criteria

[To be designed]

## Open Questions

[To be designed]
