# Slopboy — Instructions for AI Coding Agents

**Read this before making architectural changes or generating new Slopboy game code.** This is the repository's lightweight onboarding index for Codex, Claude Code, Gemini, GitHub Copilot and future agents. The authoritative requirements are in linked documents and GitHub Issues; this file is *not* permission to implement future features unasked.

## Essential reading, in order
1. [ROADMAP.md](ROADMAP.md) — current active Sprint, milestone gates, issue dependencies. **Sprint 2 begins at #77 integration**; the #23 → #22 → #24 sequence is historical work in unmerged PRs. Check Issue #77 claim, PR base and blockers before accepting a task.
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

## UI component contract — HeroUI v3, not bespoke controls

- Follow the canonical [Slopboy HeroUI theme contract](docs/design/slopboy-theme.md) and `apps/web/app/v2/slopboy-theme.css` for all modern-route colors, radii, fields, overlays, typography and dark/light behavior. Use semantic tokens, not hardcoded per-page skins.\n- **HeroUI v3 is the canonical Slopboy UI component system** (`@heroui/react` and `@heroui/styles` are already installed). Before implementing any new UI, inspect the existing HeroUI components and official **v3** API.
- Compose interactive UI using **native HeroUI components first**: `Card`, `Button`, `TextField` + `Label` + `Input`, `Alert`, `Spinner`, etc. Prefer HeroUI's built-in behavior, focus/keyboard/accessibility, semantic variants, and theme tokens. HeroUI v3 uses compound components; do **not** use obsolete v2 prop patterns.
- Customize via **component props, semantic theme tokens, and small Tailwind layout utilities** (spacing, grid/flex, width). Do not rewrite input, button, modal, form, card, focus or validation styling from scratch. New custom CSS is only justified for platform-specific visuals (virtual handheld shells, indexed LCD/pixel canvas, game rendering) that HeroUI does not provide.
- Do not create visually separate bespoke auth/account styles; all new account, catalog, creator, admin and MCP-facing panels must share the existing HeroUI theme. Route-specific graphics do not override the common design system.
- In code review, reject custom control markup/CSS when an installed HeroUI v3 primitive would meet the requirement; verify in browser and TypeScript/ESLint before merging.

## Concurrent AI agents (Sprint 2)
- **One writer per Issue and branch.** Check [#77](https://github.com/MohamedXIV/slopboy/issues/77) and the target Issue for existing claims before starting; comment `CLAIM: agent / Issue # / branch / file scope / exact base SHA`.
- Never commit to another agent's branch or force-push integration branches. Avoid shared API/CI/schema files concurrently; split tasks and use PRs with explicit dependencies.
- Integration branch `integrate/sprint-2-baseline` is reserved for #77. Backend/auth #25–#27 depends on its combined passing integration gate and verification of isolated zero-cost Neon development resources.
- Gemini can independently handle #29 MCP **schemas/tests only** or #33 browser **hostile security fixtures only**, after separate Issue claims. No unapproved real write tools or relaxation of sandbox security.
- `main` and Vercel Production are **never** targets for unattended agents without explicit owner approval.
- Separate experimental work (KAPLAY adapter, OAuth mock verification, migration schema) from verified real external services and account access.

## Workflow
- Read the task's GitHub Issue/parent Epic and existing code before changing files; avoid unrelated refactors.
- Prefer substantial but focused, tested slices. Keep modules cohesive; no giant monoliths, magic constants, or forests of trivial wrappers.
- Maintain real browser/TypeScript/security/offline regression checks, migration notes and honest status. Distinguish actual code from proposals, prototypes and unverified claims.
- If a current decision affects a deferred feature in the Long-Term Vision, retain a simple versioned extension point or record the conflict; **do not build an unused subsystem**.
- Do not expose design principles as repetitive player-facing copy. Show game qualities through real systems and natural UI behavior.

## Planning change control
When new long-term product ideas are accepted: (1) update [Long-Term Vision](docs/product/long-term-vision.md), (2) link a GitHub Epic/Issue, (3) update [ROADMAP.md](ROADMAP.md) with priority/dependency, (4) note any architecture contract changes in an ADR. **Never silently replace the agreed direction.**

Historical [docs/platform-constitution.md](docs/platform-constitution.md) predates the display-only/agent-native decisions. Its conflicting v0.1 hardware limits and deferred-backend assumptions are superseded by the current ADRs and Roadmap.
