# Roadmap — from empty repository to playable proof

Milestones are **acceptance gates**, not deadlines. Avoid adding extra systems before closing each gate. Issues in GitHub are the actionable source of truth.

## P0 — Foundation and cartridge contract

- Document the platform constitution, one test hardware profile, security boundaries and deferred decisions.
- Establish pnpm workspace with Next.js static-first shell, typed shared hardware profile and minimal SDK.
- Define a manifest plus a local build/validation path without installing or executing untrusted dependencies.
- Demonstrate acceptance/rejection fixtures for invalid profile, bad colors and size budgets.

**Gate:** a separate example cartridge can be packaged and deterministically validated, with clear local commands and tests.

## P1 — Playable vertical slice

- Create an original physical shell for the first console (responsive CSS/SVG, not somebody else's device copied verbatim).
- Run a standalone example game in an isolated browser runtime; keyboard and touch mapping both functional.
- Console Mode and Game Mode switch without reset; preserve aspect ratio and framebuffer.
- Prove CSP/origin isolation and hung-game termination; show safety test results.

**Gate:** playable in browser on desktop and mobile; incompatible and malicious fixtures do not run.

## P2 — Library, PWA and creation path

- Static catalog of vetted game cartridges; installable PWA and local saves.
- Ship 2–3 different SDK-built games (not special-cased in platform source).
- Implement CLI creator workflow, validation output, preview, and documented PR submission/review.
- GitHub Actions check safe, bounded changes on PRs. Human approval before catalog publication.

**Gate:** a new human-written or AI-written game can follow docs, pass the same validator and be added without editing runtime logic.

## P3 — Platform progression and backend

- Evaluate Neon vs Supabase with real usage/free-tier measurements.
- Add identity, trusted achievements/coin award ledger, entitlements, cosmetics and cross-device sync.
- Prevent games from self-awarding global spendable points; test idempotence, abusive reports and restoration.
- Preserve offline access to installed/free content.

**Gate:** spending and unlocking remain consistent across devices and cannot be directly forged by game scripts.

## P4 — Creator integrations and broader release

- Expose an optional remote MCP workflow for supported ChatGPT/Claude plans, while preserving manual upload.
- Verify actual Free-tier connector and file submission behavior on each provider; never promise universal support without tests.
- Add public submission moderation/reporting, legal policies, a named brand cleared for use, scalable static hosting and publication compliance.
- Expand to a second, **non-clone** hardware family only after v1 compatibility works.

**Gate:** creator-to-review-to-publication flow succeeds without bypassing review or requiring platform-paid AI calls.

## MVP exclusions

No microtransactions, competitive multiplayer, massive social systems, creator revenue sharing, unlimited free AI generation, unrestricted user HTML/JS, or an arbitrary number of virtual devices.

## Open decisions

- Final public-facing name, logo and clearance.
- Final first-device aesthetic and calibrated budgets.
- Exact cartridge container/binary encoding and sandbox implementation verified in browsers.
- Backend selection and whether trustworthy global offline-earned coins are possible without a larger server-side trust strategy.
- Platform-wide content rating, appeals and takedown workflow for public UGC.
