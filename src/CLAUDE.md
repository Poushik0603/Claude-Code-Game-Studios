# Source Directory

When writing or editing game code in this directory, follow these standards.

## Stack

This is a web application (Node.js/TypeScript backend + React/TypeScript frontend) — not an
engine-based game. No `docs/engine-reference/` lookups apply here.

Keep game rules and state logic in the shared TypeScript package, not in server or client code
directly — this is what lets a future React Native mobile client reuse the same rules engine.

## Coding Standards

- All public APIs require doc comments
- Gameplay values must be **data-driven** (external config files), never hardcoded
- Prefer dependency injection over singletons for testability
- Every new system needs a corresponding ADR in `docs/architecture/`
- Commits must reference the relevant story ID or design document

## File Routing

Match the specialist agent to the file type being written.
See `CLAUDE.md` → Technical Preferences → Technical Specialists → File Extension Routing.

When in doubt, use the primary specialist (`lead-programmer`) configured in `CLAUDE.md`.

## Tests

Tests live in `tests/` — not in `src/`.
Run `/test-setup` to scaffold the test framework if it doesn't exist yet.
Every gameplay system should have unit tests covering its formulas and edge cases.

## Verification-Driven Development

Write tests first when adding gameplay systems.
For UI changes, verify with screenshots.
Compare expected output to actual output before marking work complete.
