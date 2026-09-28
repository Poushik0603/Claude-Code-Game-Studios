# Systems Index: UNO Online

> **Status**: Draft
> **Created**: 2026-09-28
> **Last Updated**: 2026-09-28
> **Source Concept**: design/gdd/game-concept.md

---

## Overview

UNO Online is a real-time multiplayer web app, not a single-player action game, so its
mechanical scope splits into two halves: a **shared multiplayer/room backbone**
(networking, session identity, reconnection, room/lobby) that every game mode sits on
top of, and **three independent, rules-accurate game-mode engines** (Normal, No Mercy,
Flip — DOS reserved but deferred) that must never share rule logic beyond truly
identical primitives, per Pillar 4 ("Each Mode Is Its Own Game"). The backbone is built
and proven once against Normal UNO before No Mercy and Flip are layered on, because
Pillar 2 ("The Server Is the Only Referee") and Pillar 3 ("Never Lose Your Seat") are
both backbone-level guarantees that must hold before any second mode adds complexity.
All four milestone tiers below build toward the same complete application described in
the brief — tiers are build **order**, not permanently cut scope.

---

## Systems Enumeration

| # | System Name | Category | Priority | Status | Design Doc | Depends On |
|---|---|---|---|---|---|---|
| 1 | Card/Deck Primitives (inferred) | Core | MVP | Designed (pending review) | design/gdd/card-deck-primitives.md | — |
| 2 | WebSocket Message Protocol (inferred) | Core | MVP | Designed (pending review) | design/gdd/websocket-message-protocol.md | — |
| 3 | Player Identity/Session (inferred) | Core | MVP | Designed (pending review) | design/gdd/player-identity-session.md | — |
| 4 | Room Settings/Config (inferred) | Core | MVP | Designed (pending review) | design/gdd/room-settings-config.md | Player Identity/Session |
| 5 | Room/Lobby | Core | MVP | Not Started | — | Player Identity/Session, Room Settings/Config, WebSocket Message Protocol |
| 6 | Networking/State Sync | Core | MVP | Not Started | — | WebSocket Message Protocol, Player Identity/Session |
| 7 | Reconnection & Session Identity | Core | MVP | Not Started | — | Player Identity/Session, Networking/State Sync |
| 8 | Rules Engine — Normal UNO | Gameplay | MVP | Not Started | — | Card/Deck Primitives, Networking/State Sync |
| 9 | UNO-Call/Catch Penalty | Gameplay | MVP | Not Started | — | Rules Engine — Normal UNO (initially; re-attached per mode later) |
| 10 | Landing/Name Entry | UI | MVP | Not Started | — | Player Identity/Session |
| 11 | Game Table UI | UI | MVP | Not Started | — | Rules Engine — Normal UNO, Networking/State Sync |
| 12 | Error/Feedback Messaging | UI | MVP | Not Started | — | Networking/State Sync |
| 13 | Results/Scoreboard (basic) | UI | MVP | Not Started | — | Rules Engine — Normal UNO |
| 14 | Turn Timer | Gameplay | Vertical Slice | Not Started | — | Room Settings/Config, Networking/State Sync |
| 15 | Rules Engine — No Mercy | Gameplay | Alpha | Not Started | — | Card/Deck Primitives, Networking/State Sync |
| 16 | Rules Engine — Flip | Gameplay | Alpha | Not Started | — | Card/Deck Primitives, Networking/State Sync |
| 17 | DOS Placeholder | UI | Alpha | Not Started | — | Room Settings/Config |

---

## Categories

| Category | Description | Typical Systems |
|---|---|---|
| **Core** | Foundation systems everything depends on | Card/deck primitives, protocol, session identity, room config, room/lobby, networking, reconnection |
| **Gameplay** | The systems that make the game fun | The three mode rule engines, UNO-call penalty, turn timer |
| **UI** | Player-facing information displays | Landing/name entry, game table, error messaging, results/scoreboard, DOS placeholder |

Persistence, Economy, Progression, Narrative, Audio, and Meta categories from the
template are intentionally omitted — this game has no save data, no economy, no
progression, no story, and minimal audio/meta needs per the concept doc's Anti-Pillars.

---

## Priority Tiers

| Tier | Definition | Target Milestone | Design Urgency |
|---|---|---|---|
| **MVP** | The shared backbone + one fully rules-accurate mode (Normal UNO). Proves the architecture end-to-end: room → play → reconnect → win. | First playable | Design FIRST |
| **Vertical Slice** | MVP polished with the optional turn timer and full UX per brief Section 6. | Vertical slice / demo | Design SECOND |
| **Alpha** | No Mercy and Flip engines added on the proven backbone, plus the DOS placeholder UI. | Alpha milestone | Design THIRD |
| **Full Vision** | UNO DOS's real ruleset (once provided) integrated cleanly as a fourth mode. | Beta / Release | Design when rules are provided |

---

## Dependency Map

### Foundation Layer (no dependencies)

1. Card/Deck Primitives — every rules engine needs a shared card/deck/shuffle representation; nothing else can be built without it
2. WebSocket Message Protocol — the typed event contract every client-server interaction rides on
3. Player Identity/Session — the base concept of "a player" (name, socket, seat) that room membership and reconnection both attach to

### Core Layer (depends on foundation)

1. Room Settings/Config — depends on: Player Identity/Session
2. Room/Lobby — depends on: Player Identity/Session, Room Settings/Config, WebSocket Message Protocol
3. Networking/State Sync — depends on: WebSocket Message Protocol, Player Identity/Session
4. Reconnection & Session Identity — depends on: Player Identity/Session, Networking/State Sync

### Feature Layer (depends on core)

1. Rules Engine — Normal UNO — depends on: Card/Deck Primitives, Networking/State Sync
2. Rules Engine — No Mercy — depends on: Card/Deck Primitives, Networking/State Sync
3. Rules Engine — Flip — depends on: Card/Deck Primitives, Networking/State Sync
4. UNO-Call/Catch Penalty — depends on: whichever Rules Engine it's wired into (shared trigger logic, per-mode integration)
5. Turn Timer — depends on: Room Settings/Config, Networking/State Sync

### Presentation Layer (depends on features)

1. Landing/Name Entry — depends on: Player Identity/Session
2. Game Table UI — depends on: Rules Engine — Normal UNO (first), Networking/State Sync
3. Error/Feedback Messaging — depends on: Networking/State Sync
4. Results/Scoreboard — depends on: Rules Engine — Normal UNO
5. DOS Placeholder — depends on: Room Settings/Config

### Polish Layer (depends on everything)

None yet — animations and polish pass are scoped later (Vertical Slice UX pass, Alpha content).

---

## Recommended Design Order

| Order | System | Priority | Layer | Agent(s) | Est. Effort |
|---|---|---|---|---|---|
| 1 | Card/Deck Primitives | MVP | Foundation | gameplay-programmer | S |
| 2 | WebSocket Message Protocol | MVP | Foundation | network-programmer | S |
| 3 | Player Identity/Session | MVP | Foundation | network-programmer | S |
| 4 | Room Settings/Config | MVP | Core | network-programmer | S |
| 5 | Room/Lobby | MVP | Core | network-programmer, ui-programmer | M |
| 6 | Networking/State Sync | MVP | Core | network-programmer | M (confirmed low-risk by prototype PROCEED verdict) |
| 7 | Reconnection & Session Identity | MVP | Core | network-programmer, security-engineer | M |
| 8 | Rules Engine — Normal UNO | MVP | Feature | gameplay-programmer | L |
| 9 | UNO-Call/Catch Penalty | MVP | Feature | gameplay-programmer | S |
| 10 | Landing/Name Entry | MVP | Presentation | ui-programmer | S |
| 11 | Game Table UI | MVP | Presentation | ui-programmer | M |
| 12 | Error/Feedback Messaging | MVP | Presentation | ui-programmer, network-programmer | S |
| 13 | Results/Scoreboard (basic) | MVP | Presentation | ui-programmer | S |
| 14 | Turn Timer | Vertical Slice | Feature | network-programmer | S |
| 15 | Rules Engine — No Mercy | Alpha | Feature | gameplay-programmer | L |
| 16 | Rules Engine — Flip | Alpha | Feature | gameplay-programmer | L |
| 17 | DOS Placeholder | Alpha | Presentation | ui-programmer | S |

---

## Circular Dependencies

- None found.

---

## High-Risk Systems

| System | Risk Type | Risk Description | Mitigation |
|---|---|---|---|
| Networking/State Sync | Technical | Real-time sync across N clients could desync or lag under load | Already de-risked — concept prototype (`prototypes/multiplayer-turn-loop-concept/`) confirmed no lag/desync at small scale with PROCEED verdict. Full room size (up to 12 players) and reconnection scenarios still untested. |
| Reconnection & Session Identity | Technical | Two-tabs-as-two-players vs. same-name-resumes-seat requires a real session scheme, not name matching; concurrent reconnect race conditions must resolve deterministically | Explicitly flagged as a top technical risk in the concept doc; design this GDD carefully with concrete edge cases before implementation |
| Rules Engine — Normal UNO (stacking) | Design | Stacking interacts with Wild Draw 4's "no matching color" legality restriction — needs an explicit rule for whether Wild Draw 4 can extend a stack even when the player holds a matching-color card | Resolve explicitly in the GDD's Edge Cases section before implementation; don't leave it ambiguous like the codebase's current design docs briefly did |
| Rules Engine — Flip (stacking across sides) | Design | Master prompt now specifies a pending stack must resolve before a Flip card can switch sides — this interaction needs formal Edge Cases coverage | Already resolved at the design-doc level (src/master_prompt.md); carry the rule into the Flip GDD verbatim |

---

## Progress Tracker

| Metric | Count |
|---|---|
| Total systems identified | 17 |
| Design docs started | 4 |
| Design docs reviewed | 0 |
| Design docs approved | 0 |
| MVP systems designed | 4/13 |
| Vertical Slice systems designed | 0/1 |

---

## Next Steps

- [ ] Review and approve this systems enumeration
- [ ] Design MVP-tier systems first, in the order above (`/design-system [system-name]`)
- [ ] Run `/design-review` on each completed GDD
- [ ] Run `/gate-check pre-production` when MVP systems are designed
- [ ] Validate the highest-risk systems with `/vertical-slice` before committing to Production
