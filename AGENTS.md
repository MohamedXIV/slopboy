# Slopboy — Instructions for AI Coding Agents

**Read this before making architectural changes or generating new Slopboy game code.** This is the repository's lightweight onboarding index for Codex, Claude Code, Gemini, GitHub Copilot and future agents. The authoritative requirements are in linked documents and GitHub Issues; this file is *not* permission to implement future features unasked.

## Essential reading, in order
1. [ROADMAP.md](ROADMAP.md) — current active Sprint, milestone gates, issue dependencies. **Begin with #23, then #22, then #24** unless the task explicitly targets another issue.
2. [docs/product/long-term-vision.md](docs/product/long-term-vision.md) — future progression/economy, rich assets, multiplayer, social discovery, governance, device power/UX. **Preserve extension seams, but do not implement deferred Epics.**
3. [ADR-002](docs/architecture/adr-002-production-cutover.md) — canonical paths, UUIDs, /legacy and guest-save migration.
4. [ADR-003](docs/architecture/adr-003-agent-native-platform.md) — OAuth-linked ChatGPT/Claude MCP, player/creator dashboard, admin, Neon backend, Vercel frontend.
5. [ADR-004](docs/architecture/adr-004-approved-game-frameworks.md) — pinned KAPLAY first candidate, Phaser 4 later, optional PixiJS, versioned game manifest/host lifecycle.
6. [ADR-005](docs/architecture/adr-005-manual-source-ingestion.md) — Paste Code private source-only draft, shared secure ingestion, no unvalidated execution.

## Product decisions not to accidentally regress
- Slopboy new UI will become canonical; V1 under /legacy. **Draft PR #14** is not yet a merged production cutover.
- New game URLs use **immutable server-issued UUID game IDs**, never game title/slug. Versioned immutable revision IDs and ownership are distinct from cover/title.
- AI creates games using approved **game framework templates**, not standalone HTML/CSS/JS websites; manual Paste Code and OAuth MCP share the same source ingestion, build and safety checks.
- Games are **private by default**. Explicit friend permissions and separately reviewed public release; no untrusted game code executing in privileged Next, Neon, CI or MCP contexts. A private draft is not automatically safe to preview.
- Device emulator constraints: **logical display resolution, indexed colors, aspect ratio, physical input mapping only**. Do not invent hardware CPU, RAM, ROM, save, audio voice or FPS caps. Host security/storage quotas are separate.
- Keep offline guest gameplay/saves. Cloud sync is opt-in and cannot silently overwrite local saves or claim success without backend confirmation.
- **Vercel** hosts Next.js now; **Render** is only a possible alternative for frontend hosting later. **Neon** is the separate candidate for database/auth/storage/MCP functions.
- No paid infrastructure or model API assumed. Do not add permanent multiplayer servers or expensive dependencies because a distant feature is on the roadmap.

## Workflow
- Read the task's GitHub Issue/parent Epic and existing code before changing files; avoid unrelated refactors.
- Prefer substantial but focused, tested slices. Keep modules cohesive; no giant monoliths, magic constants, or forests of trivial wrappers.
- Maintain real browser/TypeScript/security/offline regression checks, migration notes and honest status. Distinguish actual code from proposals, prototypes and unverified claims.
- If a current decision affects a deferred feature in the Long-Term Vision, retain a simple versioned extension point or record the conflict; **do not build an unused subsystem**.
- Do not expose design principles as repetitive player-facing copy. Show game qualities through real systems and natural UI behavior.

## Planning change control
When new long-term product ideas are accepted: (1) update [Long-Term Vision](docs/product/long-term-vision.md), (2) link a GitHub Epic/Issue, (3) update [ROADMAP.md](ROADMAP.md) with priority/dependency, (4) note any architecture contract changes in an ADR. **Never silently replace the agreed direction.**

Historical [docs/platform-constitution.md](docs/platform-constitution.md) predates the display-only/agent-native decisions. Its conflicting v0.1 hardware limits and deferred-backend assumptions are superseded by the current ADRs and Roadmap.
