# Session State

## Current Task
Room/Lobby GDD (Systems Design stage)

## Status
4 of 17 GDDs complete: Card/Deck Primitives, WebSocket Message Protocol, Player Identity/Session, Room Settings/Config.
Room/Lobby: skeleton created at design/gdd/room-lobby.md, sections not yet written.

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
Design remaining MVP system GDDs in order:
5. Room/Lobby
6. Networking/State Sync
7. Reconnection & Session Identity
... (see systems-index.md Recommended Design Order for full list)

Use `/design-system [system-name]` for each, in order.
Run `/design-review` on all 4 completed GDDs in fresh sessions when convenient:
- design/gdd/card-deck-primitives.md
- design/gdd/websocket-message-protocol.md
- design/gdd/player-identity-session.md
- design/gdd/room-settings-config.md

## Open Questions
None blocking. UNO DOS's real ruleset still awaiting user input (not needed until Alpha tier).
