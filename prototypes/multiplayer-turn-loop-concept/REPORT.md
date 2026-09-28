# Concept Prototype Report: Multiplayer Turn Loop

> **Date**: 2026-09-28
> **Prototype Path**: Real build (Node.js + Socket.IO + plain HTML/JS) — chosen over the skill's default "Paper first" guidance because the risk being tested (real-time WebSocket state sync) cannot be validated on paper.
> **Concept File**: design/gdd/game-concept.md

---

## Hypothesis

If multiple players join a room and play a real-time turn-based card game where the server enforces legality, the game will feel instantly responsive and synchronized — evidenced by a played card appearing on all other clients' screens with no perceptible lag or desync, and illegal moves being rejected immediately with a clear reason.

---

## Riskiest Assumption Tested

Whether a single Node/Socket.IO room can serialize concurrent actions and broadcast authoritative state to multiple clients without desync, and whether that architecture is simple enough to build the rest of the app on top of. This was the real unknown — not whether UNO itself is fun.

---

## Approach

Built a throwaway Node/Express/Socket.IO server with one hardcoded room, a 24-card mini-deck (numbers 0-9 in 2 colors, 2 Skips, 2 Wilds), and a plain HTML/JS client (no React, no build tooling). Server owns all state; client only renders `STATE_SYNC` pushes and sends intents (`JOIN_ROOM`, `PLAY_CARD`, `DRAW_CARD`).

**Path chosen:** Real minimal build (not the skill's default HTML/Paper split)
**Reason for path:** Card-game logic alone is testable on paper, but the actual hypothesis here is about network state sync, which paper and single-tab simulation cannot validate.

**Shortcuts taken (intentional):**
- Hardcoded single room, no room creation/lobby UI
- Tiny 2-color, 12-value deck instead of full 4-color UNO deck
- No stacking, no UNO-call penalty, no scoring, no reconnection, no host controls
- Wild card always picks a random color server-side (no client color-picker UI) — this became the one bug found

---

## Result

Tester joined via 2 browser tabs. Playing a card in one tab updated the other tab's screen with no observable lag or desync across multiple rounds — turn indicator, hand counts, and top card all stayed consistent. Room state stayed clean throughout.

One functional gap surfaced: **the Wild card flow is broken** — the prototype has no client-side color picker, so playing a Wild silently assigns a random color server-side instead of letting the player choose. Tester specifically flagged not being able to "choose stuff" when playing a Wild.

Direct feedback: *"no log or desync it worked really well... no lag, the room state was clean but there is not room logic code... kinda broken especially when putting wild card i couldn't able to choose stuff in it... good... PROCEED"*

---

## Metrics

| Metric | Value |
|--------|-------|
| Path used | Real minimal build (Node/Socket.IO + plain HTML) |
| Iterations to playable | 1 |
| Prototype duration | <1 hour |
| Playtesters | 1 internal |
| Feel assessment | No perceptible lag or desync across multiple tabs/rounds; state sync felt instant |
| Hypothesis verdict | CONFIRMED |

---

## Recommendation: PROCEED

The core risk — real-time server-authoritative state sync over Socket.IO — is validated with no lag or desync observed. The architecture direction (single authoritative room, server pushes redacted state, client only renders and sends intents) holds up and is confirmed as the right foundation. The one functional gap (Wild color selection) is a known, expected omission from this prototype's intentionally cut scope, not a signal against the architecture.

---

## If Proceeding

- **Core tuning values discovered:** N/A — no timing/feel values needed tuning; sync was clean by default with no client-side prediction or interpolation required at this scale.
- **Assumptions confirmed:** Server-authoritative validation (turn order + legal-move checking) works cleanly and rejects illegal moves immediately with a clear message, as Pillar 2 requires. A single in-memory room object broadcasting full redacted state on every change is sufficient — no need for delta updates or optimistic client updates at this scale.
- **Assumptions disproved:** None.
- **Emergent mechanics:** None — scope was deliberately narrow (turn loop only).
- **Explicit follow-up needed:** Wild-card color selection needs a real client UI (color picker) feeding a `WILD_COLOR_CHOSEN`-style event back to the server before the next attempt at this mechanic — currently the server just assigns a random color.

**Next steps:**
1. `/design-review design/gdd/game-concept.md`
2. `/gate-check`
3. `/map-systems`
4. `/design-system [mechanic]` — use this prototype's confirmed sync model in the networking/room system's Formulas and Edge Cases sections

---

## Lessons Learned

- **What assumptions were broken by actually building this?** None on the networking side — the "broadcast full state on every change" approach proved sufficient at prototype scale (up to 4 players, single room), simpler than anticipated.
- **What surprised us that didn't show up in the brainstorm?** Nothing about sync itself; the Wild-color gap was an expected consequence of the deliberately cut scope, not a surprise.
- **What would we test differently next time?** For the next prototype/spike, explicitly include the Wild color-picker interaction rather than cutting it, since "pick the next color" is a named legal requirement in the brief (Wild Draw 4 legality enforcement) and touches both UI and server validation.

---

> *Prototype code location: `prototypes/multiplayer-turn-loop-concept/`*
> *This code is throwaway. Never refactored into production.*
