# Architecture, trust boundaries and zero-cost strategy

**Status:** Target architecture for first implementation; unresolved details are called out as spikes.

## Packages

Proposed pnpm workspace (do not generate empty packages before they have real code):

```text
apps/web/             Next.js platform, PWA, library, console viewer, creator UI
packages/hardware/    Versioned typed hardware contracts and validation
packages/sdk/         Public API for game authors; no platform secrets
packages/runtime/     Cartridge lifecycle, framebuffer, input/audio, host messaging
packages/cartridge/   Manifest schema, packaging, size checks, integrity validation
packages/validator/   Deterministic static checks and local CLI
examples/             Small, separately packaged game fixtures
docs/                 Constitution, decisions and review rules
```

Use small cohesive modules: neither monolithic files nor pointless one-function files. Shared specs are the single source of truth (not copied hardcoded numbers). No game-dependent conditionals in the web platform.

## Browser execution security

User-authored TypeScript is **untrusted JavaScript after compilation**. TypeScript types, static AST validation, AI review, workers and CSP are not individually sufficient sandboxes. Required defense in depth:

1. Cartridge code is self-contained: no external npm dependencies, package install scripts, dynamic imports, eval, Function constructor, direct DOM, fetch, XMLHttpRequest, WebSocket, localStorage or direct account APIs.
2. Use a **separate, opaque-origin sandbox** for cartridge execution, ideally a dedicated game origin or a sandboxed iframe **without `allow-same-origin`**; never give arbitrary game code the web app's origin. Use an explicit, restrictive CSP and minimize sandbox permissions.
3. Where supported and validated, execute game logic in a Worker within the sandbox; send bounded draw/audio/input commands to the host via validated, typed messages. Be aware that Worker isolation does not itself prevent network access; CSP and origin policy must do so.
4. Never send auth tokens, player identity secrets, full account data, or privileged host capabilities to a game. Validate message origin/source, type, size and rate before processing. Do not rely on ordinary Worker `postMessage` for trustworthy lifecycle messages when untrusted JS shares the Worker global; use a bootstrap-private `MessageChannel` transferred before importing game code.
5. Enforce bounded queues/frame work and a kill/restart path for hung or abusive games. Hard browser memory quotas cannot be guaranteed; document measured limits and device caveats.
6. Disable untrusted cartridge launch and publication until an actual browser security spike has verified these restrictions. No unsafe fallback that executes arbitrary creator JS in the main app thread.

### Packaging and validation

A future `.slop` may be a restricted ZIP containing a manifest, one fixed-format game bundle, assets and achievement metadata. Do not finalize format until a loader proof of concept. Validate decompressed size and entry count, canonical paths and traversal, duplicates, manifest schema, asset mime/signatures/dimensions, hardware compatibility, code size, content hashes, and achievements.

Static analysis is a **screen**, not a mathematical proof that JS cannot misbehave. Disallow arbitrary code submission to privileged CI, and avoid any build step that executes user-controlled package scripts or custom build plugins.

## GitHub workflow safeguards

- GitHub is the canonical source, issues, peer review and release record.
- Prefer **local validation during development** to avoid needless CI traffic; GitHub Actions run on meaningful PRs/changes and on explicit release checks.
- Initial community PRs should carry **data-only bundles or restricted cartridge packages**; never trust contributors' workflow files, dependency manifest scripts or dependencies.
- Untrusted contributions use read-only `pull_request` triggers, minimal permissions, no secrets, no privileged `pull_request_target` checkout/execute pattern.
- Keep publish/write credentials in a separately approved trusted release workflow after human review, not in PR tests. No untrusted artifacts should auto-publish.
- Test malformed packages, resource overflows, prohibited APIs, disallowed content metadata, and malicious messages. Human reviewers still inspect gameplay/content/IP.

## Achievements and progression trust model

The game can report candidate achievement events through a validated message bridge. The host may show unlocked local achievements immediately, but **client reports cannot mint spendable global currency**. An eventual backend must own grants, rate limits, idempotency keys, ledger and abuse detection; client-only games inherently limit anti-cheat certainty. Cross-device synchronization, global balances and console entitlements remain postponed to that backend milestone.

## Infrastructure budget

- Phase 0: Next.js static export and PWA, local IndexedDB preferences/saves, GitHub repository and conservative Actions usage.
- For deployment, compare free static hosts and quotas (e.g. Cloudflare Pages); do not assume GitHub Pages is an unlimited general application/CDN service.
- Phase 1 only if needed: one free-tier backend (Neon or Supabase) for accounts, server-side coin ledger and sync. No assumption that either remains free under unbounded traffic.
- No platform-funded inference: creators use their own ChatGPT/Claude tools or local tooling, with manual upload fallback.
- Android Play distribution requires its own one-time developer registration and app compliance; it is **outside strict $0 upfront** until separately funded.
- Budget guardrails: no automatic upgrade, paid usage, or secret-bearing production deployment without an explicit decision.

## Technical spikes required

A. Prove that packaged game JS cannot access network, DOM, parent origin, storage or privileged messages across target browsers, and that hangs can be terminated.

B. Prove compressed/uncompressed and performance budgets on at least one low-end Android target, plus desktop.

C. Prove Next.js static export, offline PWA behavior, and safe fullscreen/mobile touch control mapping.

D. Verify that chosen CI checks never execute arbitrary contributor code with privileged credentials.

The first release is gated on A, B, and C; public creator publishing is additionally gated on D and human review.
