# Card/Deck Primitives

> **Status**: In Design
> **Author**: user + agents
> **Last Updated**: 2026-09-28
> **Last Verified**: 2026-09-28
> **Implements Pillar**: Pillar 4 (Each Mode Is Its Own Game)

## Summary

Card/Deck Primitives is the shared, mode-agnostic data layer for representing cards, decks, and piles — the lowest-level building block every game mode's rules engine is built on. It defines what a card *is* (never what a card *does*), so that Normal UNO, No Mercy, and Flip can each configure their own deck composition and legality rules without duplicating or diverging on the underlying data shape.

> **Quick reference** — Layer: `Foundation` · Priority: `MVP` · Key deps: `None`

## Overview

This system provides the foundational data types and pure functions for representing playing cards and their containers (deck, discard pile, hand) in a mode-agnostic way. It defines a `Card` shape flexible enough to express every variant used across all three buildable modes — numbered cards, action cards (Skip, Reverse, Draw N), Wild cards, and Flip's dual-sided cards — plus deterministic-but-unpredictable shuffle and deck-construction functions. This system contains zero game rules: it has no concept of "legal move," "turn," or "stacking." Those belong entirely to each mode's Rules Engine, which configures this layer differently (a different card set, a different starting hand size) without ever needing to fork or modify this code. It exists so that three independently-implemented rule engines (Pillar 4) can share one correct, well-tested representation of "what a card is" instead of each rebuilding card/shuffle logic from scratch — which would be exactly the kind of duplicated logic Pillar 4 warns against, just one layer lower than rules.

## Player Fantasy

This system has no player-facing fantasy of its own — players never see a "card" object or a "shuffle" function; they see cards on a table. What players *do* feel — a fair, unpredictable shuffle every game, and cards that always behave consistently with their printed face — is entirely dependent on this layer being correct and boring. This system's job is to be invisible: if a player ever notices it (a card behaving inconsistently, a shuffle that feels rigged), that's a failure. The emotional target lives one layer up, in each mode's Rules Engine GDD.

## Detailed Design

### Core Rules

1. A `Card` is an immutable value object. Once created, its fields never change — "what was chosen for a Wild" or "which side is active" are tracked in game/room state, never by mutating the card.
2. Every card has a `kind` discriminating its category: `"number"`, `"action"`, `"wild"`. Each mode's Rules Engine defines its own closed set of valid `value`s within these kinds (e.g., Normal UNO's `"action"` cards are Skip/Reverse/Draw2; No Mercy adds Draw6/Draw10/SkipEveryone).
3. Standard (single-sided) cards: `{ id, kind, color, value }`. `color` is one of a mode-defined color set (e.g., 4 colors for Normal/No Mercy) or `"wild"` for wild-kind cards.
4. Flip-deck cards carry both faces: `{ id, kind: "flip-dual", lightFace: {color, value}, darkFace: {color, value} }`. Which face is "active" is never stored on the card — it's derived from the room's `activeSide: "light" | "dark"` state at read time.
5. A `Deck` is an ordered array of `Card`s treated as a stack (draw from one end, e.g. `pop()`).
6. `buildDeck(modeConfig)` constructs a full, unshuffled deck from a mode-supplied card-count specification (see Tuning Knobs) — this system does not hardcode any mode's deck composition.
7. `shuffle(deck)` returns a new array in randomized order using the Fisher-Yates algorithm, seeded from a cryptographically-sufficient random source (`crypto.randomInt` in Node, not `Math.random()`) — this matters because a predictable shuffle would let a malicious client infer deck order, violating Pillar 2's "provably cheat-proof" requirement.
8. A `Pile` (draw pile or discard pile) is a `Deck` with pile-specific operations: `draw()` (pop from the end), `topCard()` (peek without removing), `placeOnTop(card)` (push).
9. A `Hand` is an unordered `Card[]` belonging to one player; this system provides only storage and add/remove operations — legality of removing/playing a specific card is entirely the Rules Engine's concern, never this layer's.
10. This system never assigns `id`s that leak information (e.g., sequential IDs are fine since they're server-only and never reveal card identity to other clients before it's played — see Networking/State Sync GDD for redaction rules).

### States and Transitions

Not applicable — cards and decks are stateless value objects and simple containers; they have no internal state machine. (Side/turn/game state belongs to the Rules Engine and Networking/State Sync GDDs.)

### Interactions with Other Systems

| System | Data In | Data Out | Notes |
|---|---|---|---|
| Rules Engine (Normal/No Mercy/Flip) | Mode-specific deck config (card counts, starting hand size) | `Card`, `Deck`, `Pile`, `Hand` types + `buildDeck`/`shuffle`/draw/discard operations | Each engine calls `buildDeck(itsOwnConfig)` — this system never knows which mode is calling it |
| Networking/State Sync | — | `Card` objects to serialize into `STATE_SYNC` payloads | This system doesn't know about redaction (hiding opponents' hands) — that's Networking/State Sync's job, operating on the `Card[]` this system produces |

## Formulas

### Reshuffle-on-Empty

```
draw(drawPile, discardPile):
  if drawPile.isEmpty():
    topCard = discardPile.pop()  // keep the current top card in play
    drawPile = shuffle(discardPile)  // remaining discard becomes the new draw pile
    discardPile = [topCard]
  return drawPile.pop()
```

| Variable | Type | Range | Source | Description |
|----------|------|-------|--------|-------------|
| drawPile | Deck | 0–N cards | game state | The pile players draw from |
| discardPile | Deck | 1–N cards | game state | The pile of played cards; always has ≥1 card once the game starts (the current top card) |

**Expected output range**: Always returns exactly one `Card`, unless both piles are empty (see Edge Cases).
**Example**: Draw pile has 0 cards, discard pile has 15 cards (14 "used" + 1 "current top"). The top card is set aside, the remaining 14 are shuffled into a new draw pile, that pile is drawn from, and the set-aside card becomes the new (single-card) discard pile.

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Both draw pile and discard pile are empty (discard has only the current top card, and reshuffling would produce 0 cards) | `draw()` throws/returns a "no cards available" result; the calling Rules Engine must decide the fallback (exceptionally rare with real UNO deck sizes and player counts, but must not crash the server) | Server must never crash on empty state — Pillar 2 requires the server stay authoritative and stable under all conditions |
| A mode requests `buildDeck(config)` with a `config` that produces zero cards | `buildDeck` throws a configuration error at deck-construction time (room setup), not mid-game | Fail fast at setup, not mid-game where it would corrupt an in-progress match |
| Two simultaneous `draw()` calls on the same pile (e.g., a race between two players' actions) | Not this system's concern — operations are synchronous, in-memory array mutations; the *ordering* of calls is guaranteed by the single-threaded Rules Engine/room processing (see Networking/State Sync GDD), not by this layer | Keeps this system simple (no locking needed) by relying on the higher layer's serialization guarantee |
| A Flip-dual card is drawn/played while `activeSide` context is unavailable (this system doesn't track side) | This system always returns the full dual-face card object; resolving "which face is showing" is entirely the Rules Engine/Networking layer's responsibility at render/legality-check time | Keeps this system's `Card` type identical regardless of side — no special-casing needed here |
| `shuffle()` is called on a 0 or 1-card deck | Returns the deck unchanged (a no-op, not an error) | Trivially correct — no cards to shuffle, no need for a special code path in callers |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Rules Engine — Normal UNO | Depends on this | Consumes `Card`, `Deck`, `Pile`, `Hand` types and `buildDeck`/`shuffle`/draw/discard operations |
| Rules Engine — No Mercy | Depends on this | Same as above, with its own deck config (extra Draw6/Draw10/Wild variants) |
| Rules Engine — Flip | Depends on this | Same as above, using the `flip-dual` card shape |
| Networking/State Sync | Depends on this | Serializes `Card` objects this system produces into `STATE_SYNC` broadcasts |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `deckConfig` (per mode: card counts by kind/color/value) | Mode-specific, defined in each Rules Engine GDD, not here | N/A — this system accepts any valid config | Larger decks mean longer games before reshuffle | Smaller decks reshuffle more often |
| Random source for `shuffle()` | `crypto.randomInt` (Node built-in CSPRNG) | Must be cryptographically sufficient — never `Math.random()` | N/A | Using a weaker RNG would make shuffle outcomes predictable/exploitable — not a tunable tradeoff, a correctness requirement |
| Card `id` format | Server-generated sequential or UUID, opaque to clients | Any unique-per-deck-instance scheme | N/A | N/A — no gameplay effect, purely an implementation choice |

## Visual/Audio Requirements

Not applicable — this system is a pure data layer with no rendering or sound. Card art, flip animations, and draw/play sound effects are specified in the **Game Table UI** system's GDD, which consumes the `Card` objects this system produces.

## UI Requirements

Not applicable — no direct UI. See **Game Table UI** GDD for how `Card` data is displayed.

## Cross-References

| This Document References | Target GDD | Specific Element Referenced | Nature |
|---------------------------|-----------|------------------------------|--------|
| "each mode's Rules Engine configures deck composition" | `design/gdd/rules-engine-normal-uno.md` (not yet written) | `deckConfig` input to `buildDeck()` | Ownership handoff |
| "each mode's Rules Engine configures deck composition" | `design/gdd/rules-engine-no-mercy.md` (not yet written) | `deckConfig` input to `buildDeck()` | Ownership handoff |
| "each mode's Rules Engine configures deck composition" | `design/gdd/rules-engine-flip.md` (not yet written) | `deckConfig` input to `buildDeck()`, `flip-dual` card shape | Ownership handoff |
| "card ordering guarantee relies on single-threaded room processing" | `design/gdd/networking-state-sync.md` (not yet written) | Room action-serialization guarantee | Rule dependency |
| "Networking/State Sync owns redaction of opponents' hands" | `design/gdd/networking-state-sync.md` (not yet written) | Hand redaction rule | Ownership handoff |

> Note: All target GDDs are not yet written (this is the first GDD authored). These references are provisional and must be verified once those GDDs exist — flagged as an Open Question below.

## Acceptance Criteria

### Core Rule 1 — Card immutability
- [ ] GIVEN a `Card` object has been created, WHEN any code attempts to reassign one of its fields (e.g. `card.value = "5"`) after creation, THEN the assignment either fails (TypeScript compile error / frozen-object runtime error) or has no effect on the object returned by prior references to it.
- [ ] GIVEN a Wild card has been played and a color has been chosen for it, WHEN the game/room state is inspected, THEN the chosen color is stored on game/room state (not on the `Card` object itself), and the original `Card` object's fields are unchanged from creation.

### Core Rule 2 — `kind` discrimination
- [ ] GIVEN a `Card` object of any kind, WHEN its `kind` field is read, THEN it is exactly one of `"number"`, `"action"`, `"wild"`, or `"flip-dual"` (per Rule 4) — no other value is possible.
- [ ] GIVEN a mode-specific Rules Engine defines a closed set of valid `value`s for the `"action"` kind, WHEN `buildDeck()` is called with that mode's config, THEN every produced `"action"`-kind card has a `value` from that mode's defined set only.

### Core Rule 3 — Standard card shape
- [ ] GIVEN `buildDeck()` produces a standard (non-flip) card, WHEN the card object is inspected, THEN it has exactly the fields `{ id, kind, color, value }` and no others.
- [ ] GIVEN a standard card has `kind: "wild"`, WHEN its `color` field is read before a color is chosen, THEN it equals `"wild"`.
- [ ] GIVEN a standard card has `kind: "number"` or `"action"`, WHEN its `color` field is read, THEN it is one of the mode-defined color set (not `"wild"`).

### Core Rule 4 — Flip-dual card shape
- [ ] GIVEN `buildDeck()` is called with a Flip-mode config, WHEN a produced card is inspected, THEN it has exactly the fields `{ id, kind: "flip-dual", lightFace: {color, value}, darkFace: {color, value} }` and no top-level `color`/`value` fields.
- [ ] GIVEN a `flip-dual` card object, WHEN the object itself is inspected (independent of any room state), THEN it contains no field indicating which face is "active" (no `activeSide`, `currentFace`, or similar field on the card).

### Core Rule 5 — Deck as ordered stack
- [ ] GIVEN a `Deck` containing N cards, WHEN `pop()` (or the deck's draw-from-end operation) is called, THEN it returns the last element of the array and the resulting deck has N-1 cards in the same relative order as before, minus the removed card.
- [ ] GIVEN a `Deck`, WHEN two consecutive `pop()` calls are made without any other mutation between them, THEN the two returned cards are distinct and were adjacent at the end of the original array (order is preserved, not re-randomized between pops).

### Core Rule 6 — `buildDeck(modeConfig)`
- [ ] GIVEN a valid mode-supplied card-count config (e.g. Normal UNO's spec), WHEN `buildDeck(config)` is called, THEN the returned `Deck` contains exactly the number and composition of cards specified by that config, with no hardcoded cards from any other mode.
- [ ] GIVEN two different mode configs (e.g. Normal UNO vs. No Mercy) with different card counts, WHEN `buildDeck()` is called with each, THEN each returns a deck matching only its own config's composition — no shared hardcoded deck list is reused between them.
- [ ] GIVEN `buildDeck(config)` is called, WHEN the returned deck is inspected before any `shuffle()` call, THEN the deck is in the unshuffled order implied by the config (i.e., `buildDeck` itself does not shuffle).

### Core Rule 7 — `shuffle()` algorithm and RNG source
- [ ] GIVEN a `Deck` of N ≥ 2 cards, WHEN `shuffle(deck)` is called, THEN the returned array is a new array instance (not the same reference as the input) containing the same N cards (verified by id) with no cards added, removed, or duplicated.
- [ ] GIVEN the `shuffle()` implementation, WHEN its source code is inspected, THEN it uses `crypto.randomInt` (or an equivalent Node CSPRNG) and contains no call to `Math.random()`.
- [ ] GIVEN a `Deck` of N ≥ 2 cards, WHEN `shuffle()` is called many times (e.g. 10,000 runs) on the same input deck, THEN the distribution of each card's resulting position is statistically consistent with uniform randomness (no position/card pairing occurs at a frequency far outside expected variance for Fisher-Yates) — verified via a chi-square or similar statistical test in an automated test.

### Core Rule 8 — `Pile` operations
- [ ] GIVEN a non-empty `Pile`, WHEN `draw()` is called, THEN the returned card is removed from the pile (pile length decreases by 1) and matches what `topCard()` would have returned immediately beforehand (pop from the end).
- [ ] GIVEN a non-empty `Pile`, WHEN `topCard()` is called, THEN it returns the last card in the pile without changing the pile's length or order (a pure peek).
- [ ] GIVEN a `Pile` and a `Card`, WHEN `placeOnTop(card)` is called, THEN the pile's length increases by 1, the new card is at the end, and `topCard()` now returns that card.

### Core Rule 9 — `Hand` storage and add/remove
- [ ] GIVEN an empty `Hand`, WHEN a card is added to it, THEN the hand's card array contains that card and its length increases by 1, with no ordering guarantee asserted (hand is unordered per spec).
- [ ] GIVEN a `Hand` containing a specific card, WHEN that card is removed by its `id`, THEN the hand no longer contains a card with that `id` and its length decreases by 1, regardless of whether removing it would be "legal" in any mode's rules (this layer performs the removal unconditionally — legality is the Rules Engine's job).
- [ ] GIVEN a `Hand`, WHEN an attempt is made to remove a card `id` not present in the hand, THEN the operation does not throw and does not mutate the hand (or throws a clearly-typed "not found" error, per implementation choice) — behavior must be deterministic and documented, not a silent corruption of hand state.

### Core Rule 10 — Card `id` non-leaking
- [ ] GIVEN `buildDeck()` produces a full deck, WHEN the generated `id`s are inspected, THEN no `id` value encodes or reveals the card's `kind`, `color`, or `value` in a way parseable by a client without server-side lookup (e.g., ids are not literally strings like `"red-5"` transmitted pre-reveal in contexts requiring secrecy).
- [ ] GIVEN two separate calls to `buildDeck()` for two different rooms, WHEN the generated `id`s are compared, THEN ids are unique within each deck instance (no duplicate `id` within a single deck).

### Formula — Reshuffle-on-Empty
- [ ] GIVEN a draw pile with 0 cards and a discard pile with N ≥ 2 cards, WHEN `draw(drawPile, discardPile)` is called, THEN the discard pile's current top card is set aside, the remaining N-1 cards are shuffled into a new draw pile, the set-aside card becomes the new single-card discard pile, and exactly one card (from the newly shuffled pile) is returned.
- [ ] GIVEN a draw pile with 0 cards and a discard pile with exactly 1 card (only the current top card, no cards to reshuffle), WHEN `draw(drawPile, discardPile)` is called, THEN it does not crash — it returns the "no cards available" result/throws as specified in Edge Cases (draw pile would be empty after reshuffle).
- [ ] GIVEN a draw pile with M ≥ 1 cards already present, WHEN `draw(drawPile, discardPile)` is called, THEN no reshuffle occurs (discard pile is untouched) and the top card of the existing draw pile is returned.
- [ ] GIVEN the reshuffle-on-empty example in the Formulas section (draw pile 0, discard pile 15 = 14 used + 1 top), WHEN `draw()` is called, THEN the resulting draw pile has exactly 14 cards, the resulting discard pile has exactly 1 card (the prior top card), and the function returns 1 card drawn from the newly shuffled 14 — total cards conserved at 15 across both piles plus the returned card.

### Edge Case 1 — Both piles empty (reshuffle would produce 0 cards)
- [ ] GIVEN a draw pile with 0 cards and a discard pile with exactly 1 card (the current top, nothing else), WHEN `draw()` is called, THEN it throws an error or returns an explicit "no cards available" result (not `undefined`, not a silent no-op) and the server process does not crash or hang.

### Edge Case 2 — `buildDeck(config)` producing zero cards
- [ ] GIVEN a `modeConfig` whose card-count specification totals zero cards, WHEN `buildDeck(config)` is called, THEN it throws a configuration error synchronously at call time (during room setup), and no partially-constructed deck is returned.
- [ ] GIVEN `buildDeck(config)` throws for a zero-card config, WHEN this occurs in the room-setup flow (not mid-game), THEN no in-progress match state is created or corrupted as a result — verified by confirming `buildDeck` is called only prior to first deal in the calling flow.

### Edge Case 3 — Simultaneous `draw()` calls (concurrency)
- [ ] GIVEN two `draw()` calls are issued against the same `Pile` in sequence within a single-threaded room-processing context, WHEN both complete, THEN each call returns a distinct card and the pile's final length reflects exactly two cards removed — no card is returned twice and no card is lost, confirming synchronous in-memory mutation behaves correctly under sequential calls (the ordering/serialization guarantee itself is out of scope for this system's tests, per the GDD, and is covered by Networking/State Sync's tests instead).

### Edge Case 4 — Flip-dual card drawn/played without `activeSide` context
- [ ] GIVEN a `flip-dual` card is drawn via `Pile.draw()` or added to a `Hand`, WHEN the returned/stored card object is inspected, THEN it always contains both `lightFace` and `darkFace` data in full, regardless of any `activeSide` value (or the total absence of `activeSide` context) — the primitives layer never returns a partial or side-resolved card.

### Edge Case 5 — `shuffle()` on a 0 or 1-card deck
- [ ] GIVEN an empty `Deck` (0 cards), WHEN `shuffle(deck)` is called, THEN it returns an array with 0 cards and does not throw.
- [ ] GIVEN a `Deck` with exactly 1 card, WHEN `shuffle(deck)` is called, THEN it returns an array containing that same single card (same `id`), unchanged.

## Open Questions

| Question | Owner | Deadline | Resolution |
|----------|-------|----------|-----------|
| Should `Card.id` be a UUID or a server-scoped sequential integer? | gameplay-programmer | Before implementation begins | Open — either satisfies Core Rule 10; pick based on serialization/debugging convenience |
| The Cross-References table points to 4 GDDs (Rules Engine ×3, Networking/State Sync) that don't exist yet — do the assumptions made here (single-threaded room processing, redaction ownership) hold once those are written? | design-system author (next GDDs in order) | When each referenced GDD is authored | Open — must be verified, not assumed, when those GDDs are written |
