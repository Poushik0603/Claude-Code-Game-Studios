# Game Concept: UNO Online

*Created: 2026-09-22*
*Status: Draft*

---

## Elevator Pitch

> It's UNO, but browser-based and skribbl.io-fast: type a name, share a room code, and you're playing real-time UNO (or its brutal No Mercy and double-sided Flip variants) with friends in seconds — no installs, no accounts.

---

## Core Identity

| Aspect | Detail |
| ---- | ---- |
| **Genre** | Casual party card game |
| **Platform** | Web (desktop, tablet, phone browsers) — native mobile app planned as a future phase |
| **Target Audience** | Friend groups looking for a fast, low-friction game to play together remotely |
| **Player Count** | Multiplayer, 2–12 players per room |
| **Session Length** | 10–30 minutes per game/round set |
| **Monetization** | None |
| **Estimated Scope** | Medium (3 rule-complete game modes + real-time multiplayer infrastructure + reconnection) |
| **Comparable Titles** | skribbl.io (frictionless room-based multiplayer), Jackbox Games (party energy, browser-based), the official UNO app (rules fidelity) |

---

## Core Fantasy

You and your friends are already in the room together — there's no signup wall, no client to install, no waiting. You open a link, type your name, and you're at the table. The game gets out of the way so the *social* moment — the trash talk, the well-timed Draw 4, the last-second UNO call — is the whole point.

---

## Unique Hook

It's like skribbl.io, **and also** it plays the real, rules-accurate versions of UNO's more aggressive modern variants (No Mercy's escalating draw stacks and hand swaps, Flip's double-sided deck) — not just classic UNO with a chat window bolted on. The hook is rules fidelity married to zero-friction access: most browser card games either oversimplify the rules or require accounts; this does neither.

---

## Player Experience Analysis (MDA Framework)

### Target Aesthetics (What the player FEELS)

| Aesthetic | Priority | How We Deliver It |
| ---- | ---- | ---- |
| **Sensation** (sensory pleasure) | 2 | Satisfying card-play/draw animations, table flip effect in Flip mode, win celebration |
| **Fantasy** (make-believe, role-playing) | N/A | Not a role-play driven game |
| **Narrative** (drama, story arc) | N/A | No authored narrative |
| **Challenge** (obstacle course, mastery) | 3 | Reading opponents' card counts, timing Wilds/stacks, No Mercy's elimination pressure |
| **Fellowship** (social connection) | 1 | Playing with real friends in a shared room is the entire premise |
| **Discovery** (exploration, secrets) | N/A | Not applicable |
| **Expression** (self-expression, creativity) | 4 | Display name choice; room/mode selection |
| **Submission** (relaxation, comfort zone) | N/A | Not applicable |

### Key Dynamics (Emergent player behaviors)

- Players will call out or bluff about their hand size ("I'm at UNO!") since only card *counts* are visible, not contents.
- Groups will gravitate toward No Mercy for shorter, higher-chaos sessions and Normal UNO for longer, calmer ones.
- Hosts will experiment with turn-timer settings to control pace for larger groups (up to 12 players).
- Players will keep tabs open to "hold their seat" during long sessions, relying on reconnect-by-name to survive dropped connections.

### Core Mechanics (Systems we build)

1. Room/lobby system with host-authority controls and shareable room codes
2. A server-authoritative turn/action engine shared across three independently-ruled game modes (Normal, No Mercy, Flip), with a fourth (DOS) reserved but unbuilt
3. Real-time state sync and reconnection-by-name so dropped clients rejoin their exact seat and hand

---

## Player Motivation Profile

### Primary Psychological Needs Served

| Need | How This Game Satisfies It | Strength |
| ---- | ---- | ---- |
| **Autonomy** (freedom, meaningful choice) | Choice of game mode, timer settings, legal-move choices each turn | Supporting |
| **Competence** (mastery, skill growth) | Reading the table, managing stacked penalties in No Mercy, correct UNO-call timing | Supporting |
| **Relatedness** (connection, belonging) | The entire product is "play with your friends right now" | Core |

### Player Type Appeal (Bartle Taxonomy)

- [x] **Achievers** (goal completion, collection, progression) — How: Winning rounds/matches, reaching 500 points in Normal UNO
- [ ] **Explorers** (discovery, understanding systems, finding secrets) — Not a design focus
- [x] **Socializers** (relationships, cooperation, community) — How: Shared room, real-time reactions, playing as a group
- [x] **Killers/Competitors** (domination, PvP, leaderboards) — How: No Mercy's elimination format, catching opponents on missed UNO calls

### Flow State Design

- **Onboarding curve**: Rules are already known to most players (UNO); illegal cards are visually greyed out so new players can't make invalid moves even without knowing every rule.
- **Difficulty scaling**: N/A — this is a fixed-ruleset party game, not a scaling single-player challenge; "difficulty" comes from opponent skill, not systems.
- **Feedback clarity**: Turn indicator, active color, pending stacked penalty, and card legality are always visible.
- **Recovery from failure**: A round loss just means fewer points or elimination (No Mercy) — Play Again is one click away; nothing is lost permanently since there's no persistent progression.

---

## Core Loop

### Moment-to-Moment (30 seconds)

On your turn: read the top card and active color, identify which cards in your hand are legal (visually distinguished from illegal ones), and play a card or draw. Off-turn: watch the table state update live — whose turn it is, direction, pending penalties.

### Short-Term (5-15 minutes)

A single round: play continues until someone empties their hand (or, in No Mercy, until only one player remains). Tension builds as hand sizes shrink, UNO calls happen, and action cards (Skip/Reverse/Draw/Wild, or mode-specific cards) redirect the round.

### Session-Level (30-120 minutes)

Multiple rounds/matches back-to-back in the same room: Normal UNO plays to 500 cumulative points across rounds; No Mercy and Flip play round-by-round with Play Again available instantly. A session ends naturally when the group decides to stop, with Return to Lobby / Return to Main Menu always available.

### Long-Term Progression

None by design — there is no persistent profile, stats, or unlocks. The "progression" is entirely social: bragging rights within the friend group for that session.

### Retention Hooks

- **Curiosity**: N/A — no hidden content to unlock
- **Investment**: Mid-round investment only (don't want to lose your current hand/points), not cross-session
- **Social**: The dominant hook — friends already in the room, room code already shared, one click to play again
- **Mastery**: Getting better at reading opponents' card counts and timing No Mercy's swap/stack mechanics

---

## Game Pillars

### Pillar 1: Zero Friction to the Table

Getting from "here's a link" to "we're playing" must take seconds — no accounts, no installs, no verification steps.

*Design test*: If a feature would add a screen, a required field, or a wait state before play begins, cut it or make it optional.

### Pillar 2: The Server Is the Only Referee

No client is ever trusted to determine a legal move, turn order, or outcome — the game must be provably cheat-proof and desync-proof by construction.

*Design test*: If a decision about "is this move legal" or "whose turn is it" is ever computed client-side and merely displayed (not just requested and validated server-side), that's a bug, not an optimization.

### Pillar 3: Never Lose Your Seat

Connection drops are treated as a certainty, not an edge case — reconnecting must restore the exact hand, seat, and turn state with no data loss.

*Design test*: When choosing between a simpler implementation that risks state loss on reconnect vs. a more complex one that guarantees it, always choose guaranteed state recovery.

### Pillar 4: Each Mode Is Its Own Game

Normal UNO, No Mercy, and Flip have meaningfully different rule systems and must not be built as one ruleset with conditional patches — each is implemented as its own cleanly separated engine.

*Design test*: If adding or fixing a rule in one mode requires touching another mode's logic, the separation has failed and needs refactoring.

### Anti-Pillars (What This Game Is NOT)

- **NOT an account-based platform**: No login, profile, or persistent identity — this would violate Pillar 1 and add scope nothing in the brief asks for.
- **NOT a stats/history tracker**: No game history or cross-session records — keeps scope minimal and matches the "just play right now" premise.
- **NOT a public matchmaking product**: No room browsing or public lobbies — rooms are private, code-only, by design (also reduces moderation/abuse surface).
- **NOT a house-ruled hybrid of the four modes**: Each mode implements exactly its own specified rule set (Normal UNO stacks Draw 2/Wild Draw 4 as a core rule, per the brief; No Mercy's escalating stack, Flip's dual-sided deck, and DOS's rules are each distinct and not cross-applied), no invented UNO DOS rules, no "close enough" improvisation.

---

## Inspiration and References

| Reference | What We Take From It | What We Do Differently | Why It Matters |
| ---- | ---- | ---- | ---- |
| skribbl.io | Instant, no-account room-code multiplayer; casual, playful presentation | We implement a rules-precise card game rather than a freeform drawing canvas | Validates that the "type a name, get a code, play instantly" flow is the right access pattern for casual group play |
| Official UNO / UNO No Mercy / UNO Flip (physical + Mattel163 digital) | Exact ruleset fidelity for each variant | We deliver all three (plus a reserved slot for DOS) in one web app instead of separate paid apps | Validates that players already know and want these specific rulesets — no reinvention needed |
| Jackbox Games | Party-game energy, phone-as-controller friendliness, group session pacing | We're a single continuous card table rather than a rotating minigame collection | Validates that lightweight, funny, low-stakes multiplayer sessions have strong repeat-play demand |

**Non-game inspirations**: The specific pain point of "friends want to play cards over a video call but nobody has a physical deck / everyone's on a different device" — this is a direct digital replacement for pulling out a real UNO deck at a table.

---

## Target Player Profile

| Attribute | Detail |
| ---- | ---- |
| **Age range** | Teens through adults (broad — UNO's audience is not age-restricted) |
| **Gaming experience** | Casual — players who may not otherwise play "games" but know UNO |
| **Time availability** | Short, spontaneous sessions — often during a call or a get-together, 15-60 minutes |
| **Platform preference** | Whatever device is at hand — phone, tablet, or laptop, often mixed within the same room |
| **Current games they play** | skribbl.io, Jackbox party packs, physical UNO |
| **What they're looking for** | A fast way to play a game everyone already knows, together, remotely, without setup friction |
| **What would turn them away** | Any signup requirement, losing their hand on a dropped connection, or a version of the rules that "isn't real UNO" |

---

## Technical Considerations

| Consideration | Assessment |
| ---- | ---- |
| **Recommended Engine** | None — this is a web application (Node.js/TypeScript backend, React/TypeScript frontend), not an engine-based game. See `CLAUDE.md` Technology Stack. |
| **Key Technical Challenges** | Server-authoritative turn/rules validation across 3 distinct rulesets; real-time state sync with no client trust; seat-preserving reconnection-by-name; race-condition-proof concurrent action handling |
| **Art Style** | 2D UI — clean, playful, skribbl.io-adjacent visual energy |
| **Art Pipeline Complexity** | Low-Medium (card faces, table background, simple animations — no 3D assets) |
| **Audio Needs** | Minimal (UI/action feedback sounds, optional ambient) |
| **Networking** | Client-Server, WebSocket-based (Socket.IO), single authoritative game server per room |
| **Content Volume** | 3 complete rulesets (Normal, No Mercy, Flip) + reserved slot for a 4th (DOS, rules pending) |
| **Procedural Systems** | None — deck shuffling only (standard randomized shuffle, not procedural generation) |

---

## Risks and Open Questions

### Design Risks

- Balancing turn-timer defaults so larger rooms (up to 12 players) don't feel slow while still giving everyone enough time to read their hand
- No Mercy's elimination format may end games quickly for eliminated players with nothing to do until the match ends

### Technical Risks

- Reconnection-by-name at scale: two tabs from the same person must count as different players, but the same name re-entering the same room must resume the correct seat — needs a robust session/identity scheme (not just name string matching)
- Concurrent-action race conditions (e.g., two reconnect attempts, or a timeout and a manual play landing simultaneously) must resolve to exactly one authoritative outcome
- Real-time sync at up to 12 players per room with animations (card flips, hand swaps in No Mercy, full-table flips in Flip mode) synchronized across all clients

### Market Risks

- Low — this is being built for personal/friend-group use, not commercial release, per the brief's framing

### Scope Risks

- Three fully independent, rules-accurate game engines (not one engine with variants) is real content volume — must resist the urge to share more logic between modes than the rules actually allow
- UNO DOS is explicitly deferred; must not be guessed at or half-built

### Open Questions

- UNO DOS's authoritative ruleset — deferred until the user provides it (per Pillar "Each Mode Is Its Own Game" and explicit instruction not to guess)
- Exact avatar/seat visual treatment for the game table (placeholder vs. custom art) — to be resolved in Art Bible / UX design phase

---

## MVP Definition

**Core hypothesis**: A friend group can go from "here's a link" to "we're playing a rules-accurate game of UNO together in real time" in under a minute, and the reconnect-by-name flow survives a dropped connection without losing game state.

**Required for MVP**:
1. Name entry → Create/Join Room by code → Lobby (host controls, live player list) → Start Game
2. One fully rules-accurate game mode end-to-end: Normal UNO (turn engine, legal-move enforcement, scoring to 500, UNO-call/catch penalty)
3. Server-authoritative reconnection-by-name that restores exact seat/hand/turn state

**Explicitly NOT in MVP** (defer to later):
- UNO No Mercy and UNO Flip rulesets (built after Normal UNO proves the architecture)
- UNO DOS (rules not yet provided)
- Turn timer (optional feature per the brief — can ship after core loop is validated)
- Polish animations beyond basic play/draw feedback

### Scope Tiers (if budget/time shrinks)

| Tier | Content | Features | Timeline |
| ---- | ---- | ---- | ---- |
| **MVP** | Normal UNO only | Room/lobby, one ruleset, reconnection | TBD |
| **Vertical Slice** | Normal UNO, polished | Full UX per brief Section 6 for one mode, turn timer | TBD |
| **Alpha** | + No Mercy + Flip | All three modes, full UX, all animations | TBD |
| **Full Vision** | + UNO DOS (once rules provided) | Fourth mode integrated cleanly alongside the other three | TBD |

---

## Next Steps

- [ ] Get concept approval from creative-director
- [x] Fill in CLAUDE.md technology stack (web stack, not an engine — done)
- [ ] Create game pillars document (`/design-review` to validate)
- [ ] **Prototype core idea** (`/prototype`) — validate the room/lobby + Normal UNO turn loop before writing full GDDs
- [ ] If prototype PROCEEDS: Decompose concept into systems (`/map-systems`)
- [ ] Design each system (`/design-system [system-name]`) — one GDD per mode plus room/lobby, networking, reconnection
- [ ] Build vertical slice in Pre-Production (`/vertical-slice`)
- [ ] Validate core loop with playtest (`/playtest-report`)
- [ ] Plan first milestone (`/sprint-plan new`)
