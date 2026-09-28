# UNO Online

Real-time multiplayer UNO in the browser — no installs, no accounts, just a room code.
Built with Claude Code Game Studios: indie development managed through 49 coordinated
Claude Code subagents, each owning a specific domain to enforce separation of concerns and quality.

## Technology Stack

- **Platform**: Web application (browser, no install, no account) — mobile app planned as a future phase
- **Backend**: Node.js + TypeScript, authoritative game server over WebSockets (Socket.IO)
- **Frontend**: React + TypeScript (Vite)
- **Shared package**: Game rules, state types, and validation logic live in a shared TypeScript package
  consumed by both server and client, so a future React Native client can reuse the same rules engine
  instead of reimplementing it.
- **Version Control**: Git with trunk-based development
- **Build System**: Vite (frontend), tsc/esbuild (backend)
- **Asset Pipeline**: Static assets served directly (cards, sounds, sprites) — no engine import pipeline

> **Note**: This is not a game-engine project. Godot/Unity/Unreal engine-specialist agents do not apply.
> Use the web-stack specialists instead — see Technical Preferences → Technical Specialists.

## Project Structure

@.claude/docs/directory-structure.md

## Technical Preferences

@.claude/docs/technical-preferences.md

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**
Every task follows: **Question -> Options -> Decision -> Draft -> Approval**

- Agents MUST ask "May I write this to [filepath]?" before using Write/Edit tools
- Agents MUST show drafts or summaries before requesting approval
- Multi-file changes require explicit approval for the full changeset
- No commits without user instruction

See `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md` for full protocol and examples.

> **First session?** If the project has no engine configured and no game concept,
> run `/start` to begin the guided onboarding flow.

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

@.claude/docs/context-management.md
