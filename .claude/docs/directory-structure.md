# Directory Structure

```text
/
├── CLAUDE.md                    # Master configuration
├── .claude/                     # Agent definitions, skills, hooks, rules, docs
├── src/                         # Application source code
│   ├── shared/                  # Game rules, state types, validation logic (consumed by server + client)
│   ├── server/                  # Node.js/TypeScript authoritative game server (rooms, sockets, matchmaking)
│   └── client/                  # React/TypeScript frontend (Vite) — lobby, game table, UI
├── assets/                      # Static assets (card art, sounds, sprites) — served directly, no import pipeline
├── design/                      # Game design documents (gdd, ux, registry)
├── docs/                        # Technical documentation (architecture, api, postmortems)
│   └── engine-reference/        # Not used — this is a non-engine web project; see CLAUDE.md
├── tests/                       # Test suites (unit, integration/E2E, playtest)
├── tools/                       # Build and pipeline tools (ci, build)
├── prototypes/                  # Throwaway prototypes (isolated from src/)
└── production/                  # Production management (sprints, milestones, releases)
    ├── session-state/           # Ephemeral session state (active.md — gitignored)
    └── session-logs/            # Session audit trail (gitignored)
```
