# Session State

## Current Task
Reconnection & Session Identity GDD — IN PROGRESS, paused mid-session

## Status
6 of 17 GDDs fully complete: Card/Deck Primitives, WebSocket Message Protocol, Player Identity/Session, Room Settings/Config, Room/Lobby, Networking/State Sync.

Reconnection & Session Identity (7th, last MVP Core-layer system) is PARTIALLY WRITTEN at
design/gdd/reconnection-session-identity.md:
- DONE: Summary, Overview, Player Fantasy, Detailed Design (9 Core Rules + 2-state lifecycle + Interactions), Formulas (marked N/A with rationale)
- STILL "[To be designed]": Edge Cases, Dependencies, Tuning Knobs, Visual/Audio Requirements, UI Requirements, Cross-References, Acceptance Criteria, Open Questions

Key decisions already locked for this GDD (do not re-ask):
- Grace period = 60 seconds, uniform across lobby/active-game/results states (this is the Tuning Knob value — put it there)
- If disconnected player held the turn, game pauses (no auto-skip/auto-draw) — independent of the separate, not-yet-built Turn Timer feature
- Reconnect within grace period: flips connected=true, cancels timer, calls Networking/State Sync's redact() for catch-up GAME_STATE_SYNC/ROOM_STATE_SYNC, broadcasts PLAYER_RECONNECTED to others
- Grace period expiry: hands off to Room/Lobby's existing Core Rule 7 removal logic (not reimplemented here)
- Late reconnect after eviction: no special handling, falls through to Player Identity/Session's "unrecognized sessionId" path + normal JOIN_ROOM
- Host disconnect: Room/Lobby host migration triggers IMMEDIATELY (not after grace period); original host can still reconnect within their own grace period but rejoins as regular member, doesn't reclaim host
- Reconnect-vs-timer-expiry race: resolves via Node's single-threaded event loop (resume wins if processed first) — this goes in Edge Cases, not Formulas (already decided, not yet written)
- Formulas section: correctly concluded N/A (pure timing/state-machine, no quantitative curve) — already written to file

Git: forked to github.com/Poushik0603/Claude-Code-Game-Studios (origin repo access denied), pushed as of commit a54e789. User requested: no Claude co-author line on commits, commit after each completed GDD/milestone without asking each time going forward.

## Files
- `design/gdd/systems-index.md` — systems index (just written)
- `design/gdd/game-concept.md` — approved concept, informed this decomposition
- `src/master_prompt.md` — original brief, source of truth for rules detail
- `prototypes/multiplayer-turn-loop-concept/` — concept prototype, PROCEED verdict, confirmed networking/state-sync approach

## Key Decisions Made This Session
- Stacking is now a core rule in Normal UNO, No Mercy, and Flip (was previously Normal/Flip = no stacking)
- Normal UNO gets an optional host-toggled "0-7 Rule" house rule (off by default); No Mercy's 0/7 stays mandatory
- Build order confirmed: MVP (backbone + Normal UNO, incl. basic Results/Scoreboard) → Vertical Slice (turn timer + polish) → Alpha (No Mercy + Flip + DOS placeholder) → Full Vision (real DOS once rules provided) — all tiers ship in the same project, nothing permanently cut
- Concept prototype (real Node/Socket.IO build) confirmed server-authoritative state sync works with no lag/desync

## Next
IMMEDIATE: Resume `/design-system Reconnection & Session Identity` (or `/design-system retrofit design/gdd/reconnection-session-identity.md`) to fill Edge Cases onward — see the locked decisions above so no re-asking is needed.

After that GDD is complete, continue the design order:
8. Rules Engine — Normal UNO
9. UNO-Call/Catch Penalty
... (see systems-index.md Recommended Design Order for full list)

Use `/design-system [system-name]` for each, in order.
Run `/design-review` on all 6 fully-completed GDDs in fresh sessions when convenient:
- design/gdd/card-deck-primitives.md
- design/gdd/websocket-message-protocol.md
- design/gdd/player-identity-session.md
- design/gdd/room-settings-config.md
- design/gdd/room-lobby.md
- design/gdd/networking-state-sync.md

## Git / Commit Policy (standing instruction from user)
- Commits must be attributed SOLELY to the user (Poushik0603) — NEVER add a Co-Authored-By: Claude line
- Commit after each completed GDD/milestone without asking each time
- origin remote = user's fork at github.com/Poushik0603/Claude-Code-Game-Studios (original Donchitos/Claude-Code-Game-Studios repo access was denied — this fork is now the working remote)
- If a push is ever rejected due to upstream template drift again, do NOT force-push without explicit fresh confirmation each time — force-push is gated by the permission system regardless of prior approval

## Open Questions
None blocking. UNO DOS's real ruleset still awaiting user input (not needed until Alpha tier).
