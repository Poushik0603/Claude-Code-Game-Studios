# Technical Preferences

<!-- Populated by /setup-engine. Updated as the user makes decisions throughout development. -->
<!-- All agents reference this file for project-specific standards and conventions. -->

## Engine & Language

- **Engine**: None — this is a web application, not an engine-based game.
- **Language**: TypeScript everywhere (backend, frontend, and shared rules package)
- **Rendering**: DOM/CSS + React for UI and card table; no canvas/WebGL required unless animation needs demand it later
- **Physics**: N/A

## Input & Platform

- **Target Platforms**: Web (desktop, tablet, phone browsers) now — native mobile app (iOS/Android) planned as a future phase
- **Input Methods**: Mouse/keyboard and touch, both fully supported from day one
- **Primary Input**: Touch/click on cards (tap-to-play), not drag-and-drop, so the interaction pattern ports cleanly to mobile later
- **Gamepad Support**: None
- **Touch Support**: Full — required, since phone play is a primary use case per the brief
- **Platform Notes**: Because a mobile app is planned later, keep all game rules, state shapes, and
  validation logic in the shared TypeScript package (not embedded in React components) so a future
  React Native client can reuse them directly. Avoid browser-only APIs in shared/game-logic code.

## Naming Conventions

- **Classes**: PascalCase (e.g., `GameRoom`, `UnoNoMercyEngine`)
- **Variables/functions**: camelCase
- **Events (WebSocket messages)**: SCREAMING_SNAKE_CASE string constants (e.g., `PLAY_CARD`, `ROOM_STATE_SYNC`)
- **Files**: kebab-case (e.g., `game-room.ts`, `uno-no-mercy-engine.ts`)
- **React components**: PascalCase filenames matching the component (e.g., `GameTable.tsx`)
- **Constants**: SCREAMING_SNAKE_CASE

## Performance Budgets

- **Target Framerate**: 60fps UI animations (CSS/JS transitions), not a fixed game-loop framerate
- **Frame Budget**: N/A (event-driven UI, not a render loop)
- **Draw Calls**: N/A
- **Memory Ceiling**: Server: bounded per-room state only (no history/replay storage); Client: standard web app budget for low-end mobile browsers

## Testing

- **Framework**: Vitest (unit tests for game logic/rules engine), Playwright (integration/E2E for room + reconnect flows)
- **Minimum Coverage**: 100% of rules-engine branches for each game mode (turn validation, stacking, elimination, scoring)
- **Required Tests**: Turn-order/legality enforcement, reconnection state recovery, each mode's rule engine, WebSocket message contracts

## Forbidden Patterns

- Trusting the client for any game-logic decision (legality, turn order, scoring) — server is always authoritative
- Embedding game rules inside React components or UI code — rules live only in the shared engine package
- Storing player hands or full game state in client-readable form beyond what that player is entitled to see

## Allowed Libraries / Addons

- **Backend**: Node.js, TypeScript, Socket.IO (or `ws`), Express (or Fastify) for HTTP bootstrap
- **Frontend**: React, TypeScript, Vite, a lightweight animation library (e.g., Framer Motion) for card/table motion
- **Testing**: Vitest, Playwright
- [Additional dependencies added here as they're approved]

## Architecture Decisions Log

<!-- Quick reference linking to full ADRs in docs/architecture/ -->
- [No ADRs yet — use /architecture-decision to create one]

## Technical Specialists

<!-- Read by /code-review, /architecture-decision, /architecture-review, and team skills -->
<!-- to know which specialist to spawn for validation. No engine specialists apply to this project. -->

- **Primary**: `lead-programmer` (code architecture, review, standards)
- **Realtime/Networking**: `network-programmer` (WebSocket protocol, state replication, reconnection, turn synchronization)
- **Gameplay/Rules Logic**: `gameplay-programmer` (per-mode rule engines: Normal, No Mercy, Flip)
- **UI Specialist**: `ui-programmer` (React components, game table, lobby, HUD)
- **Security**: `security-engineer` (server authority enforcement, anti-cheat, input validation)
- **Infra**: `devops-engineer` (build pipeline, deployment, CI)
- **Routing Notes**: No `godot-*`, `unity-*`, `unreal-*`, or `ue-*` specialists apply — this is not an engine project.

### File Extension Routing

| File Extension / Type | Specialist to Spawn |
|-----------------------|---------------------|
| `.ts` in shared rules/game-logic package | `gameplay-programmer` |
| `.ts` in server (rooms, sockets, matchmaking) | `network-programmer` |
| `.tsx` / React components | `ui-programmer` |
| Auth/validation/anti-cheat code | `security-engineer` |
| Build config, CI, deployment | `devops-engineer` |
| General architecture review | Primary |
