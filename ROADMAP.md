# Slopboy — Agent-Native Platform Roadmap

**Updated:** 2026-11-08 · **Status:** Proposed; [Draft PR #14](https://github.com/MohamedXIV/slopboy/pull/14) contains the working V2 UI/runtime baseline. No production cutover has been merged.

**GitHub Project:** [Slopboy — Agent-Native Platform Roadmap](https://github.com/users/MohamedXIV/projects/7)  
**Long-term product register:** [Long-Term Vision](docs/product/long-term-vision.md) · [Agents' entrypoint](AGENTS.md)
**Architecture:** [ADR-002](docs/architecture/adr-002-production-cutover.md) (UUIDs/Legacy) · [ADR-003](docs/architecture/adr-003-agent-native-platform.md) (ChatGPT/Claude MCP, SaaS roles, hosting) · [ADR-004](docs/architecture/adr-004-approved-game-frameworks.md) (approved frameworks/cartridge runtime)

## Locked product direction

- **Framework-based AI games:** new cartridges contain game source written against an **approved, version-pinned engine template** (first KAPLAY candidate, Phaser 4 planned, PixiJS 8 later evaluation); not arbitrary self-contained HTML/CSS/JS websites. An engine-neutral host contract handles input, saves, lifecycle and display. Frameworks do not make uploaded JavaScript trusted. See [ADR-004](docs/architecture/adr-004-approved-game-frameworks.md) and [Epic #43](https://github.com/MohamedXIV/slopboy/issues/43).
- **AI-assisted creation is the core product**, not a future optional feature. A creator connects their own Slopboy account to ChatGPT or Claude using an authenticated Remote MCP connector and creates a game inside those clients. Slopboy receives the game source and assets; no paid generation API subscription is required from Slopboy.
- A new game is a **private, account-owned draft by default**. Friends see it only through explicit grants. Only reviewed approved immutable revisions become publicly discoverable.
- A Slopboy user may be guest/player/creator in one identity; the protected `/dashboard` manages My Games, revisions, permissions, stats, integrations and saves. `/admin` manages moderation, approval and platform operations. A web game-code Studio is not in launch scope.
- **Canonical URLs:** `/` devices/home, `/library` full catalog and personal collection, `/play/[gameId]` UUID route, `/games/[gameId]` detail, `/dashboard` user/creator, `/admin` operator, and `/legacy` for old prototype. UUID game/revision IDs are immutable; titles are mutable display data.
- **Display-only virtual hardware:** logical resolution, aspect ratio and indexed-color count; no invented CPU/RAM/ROM, save-size, audio or FPS hardware caps. Storage/upload abuse quotas are independent platform policies.
- **Hosting:** **Vercel** hosts Next.js for now; **Neon** provides data/Auth/Object Storage and candidate Remote MCP Functions. **Render is only a future alternative to Vercel for hosting the Next.js frontend/app**, not a replacement for Neon. Keep portable Next.js runtime/config and document OAuth redirect, domain, cookie and PWA changes before any switch.
- **Safety:** guest IndexedDB saves remain offline-first; untrusted games never run in privileged app or MCP contexts. Existing [#4](https://github.com/MohamedXIV/slopboy/issues/4) is the untrusted-code sandbox gate; the KAPLAY experiment alone doesn't satisfy it.

## Milestones and epics

| Milestone | Epic and implementation issues | Exit criterion |
|---|---|---|
| **M0 · Canonical app** | [#15](https://github.com/MohamedXIV/slopboy/issues/15): [#23 UUID/save aliases](https://github.com/MohamedXIV/slopboy/issues/23) → [#22 routes/legacy](https://github.com/MohamedXIV/slopboy/issues/22) → [#24 Next.js dynamic/PWA](https://github.com/MohamedXIV/slopboy/issues/24) | No `/v2` for users; canonical UUID play pages; old saves/bookmarks preserved; real dynamic Next deploy passes |
| **M1 · User/data** | [#16](https://github.com/MohamedXIV/slopboy/issues/16): [#25 Neon dev/schema](https://github.com/MohamedXIV/slopboy/issues/25), [#26 Auth/roles](https://github.com/MohamedXIV/slopboy/issues/26), [#27 DB catalog/ownership](https://github.com/MohamedXIV/slopboy/issues/27) | Two real accounts; private user drafts and public catalog with UUIDs; guest play intact |
| **M2 · Agent-native private game (core product)** | [#17](https://github.com/MohamedXIV/slopboy/issues/17): [#28 OAuth](https://github.com/MohamedXIV/slopboy/issues/28), [#29 MCP tools](https://github.com/MohamedXIV/slopboy/issues/29), [#30 ChatGPT+Claude E2E](https://github.com/MohamedXIV/slopboy/issues/30). [#18](https://github.com/MohamedXIV/slopboy/issues/18): [#31 uploads](https://github.com/MohamedXIV/slopboy/issues/31), [#32 builds](https://github.com/MohamedXIV/slopboy/issues/32), [#33 sandbox](https://github.com/MohamedXIV/slopboy/issues/33) + existing [#4](https://github.com/MohamedXIV/slopboy/issues/4) | Game genuinely created in ChatGPT and Claude, private in owner dashboard, safely built and playable to authorized owner only |
| **M2a · Approved game frameworks** | [#43](https://github.com/MohamedXIV/slopboy/issues/43): [#44 host manifest/SDK](https://github.com/MohamedXIV/slopboy/issues/44), [#45 KAPLAY adapter](https://github.com/MohamedXIV/slopboy/issues/45), [#46 AI engine templates](https://github.com/MohamedXIV/slopboy/issues/46) (P0); [#47 Phaser 4](https://github.com/MohamedXIV/slopboy/issues/47) (P1); [#48 PixiJS 8](https://github.com/MohamedXIV/slopboy/issues/48) (P2) | First AI-created private game uses a version-pinned tested engine/adapter; untrusted JS sandbox and approval remain required |
| **M2b · Manual creator fallback** | [#49](https://github.com/MohamedXIV/slopboy/issues/49): signed-in Paste Code → private draft; same #31/#32 secure pipeline as MCP | Players can manually submit source from any AI, owned by their account, without a plugin; game only becomes playable after a validated safe preview |
| **M3 · Player/creator experience** | [#19](https://github.com/MohamedXIV/slopboy/issues/19): [#34 My Games](https://github.com/MohamedXIV/slopboy/issues/34), [#35 friend sharing](https://github.com/MohamedXIV/slopboy/issues/35), [#36 cloud saves](https://github.com/MohamedXIV/slopboy/issues/36), [#37 analytics/ratings](https://github.com/MohamedXIV/slopboy/issues/37) | Owner manages games, stats, private grants and opt-in quota-protected synced saves |
| **M4 · Admin moderation** | [#20](https://github.com/MohamedXIV/slopboy/issues/20): [#38 review](https://github.com/MohamedXIV/slopboy/issues/38), [#39 reports](https://github.com/MohamedXIV/slopboy/issues/39) | Server-only admin roles, audited approvals; unapproved content stays non-public |
| **M5 · Reliability/launch** | [#21](https://github.com/MohamedXIV/slopboy/issues/21): [#40 offline](https://github.com/MohamedXIV/slopboy/issues/40), [#41 hosting portability](https://github.com/MohamedXIV/slopboy/issues/41), [#42 release QA](https://github.com/MohamedXIV/slopboy/issues/42) | Dynamic PWA, mobile/WebKit, security/permissions/quotas, Vercel↔Render Next.js guide and rollback evidence |

M0/M1/M2 are partially parallelizable: the OAuth contract and remote MCP tool schemas can start while canonical routes are being migrated, but *success* depends on real data ownership and a safe game bundle.

## Long-term Product Vision (deliberately deferred)

The MVP roadmap above is **not** the full planned platform. The persistent future-feature register lives in [Long-Term Product Vision](docs/product/long-term-vision.md), with six GitHub parent Epics and 12 execution issues. Agents must read it for architecture compatibility but **must not implement deferred features as scaffolding in current Sprints**.

| Long-term track | Epic | Detailed Issues | When to revisit |
| --- | --- | --- | --- |
| Slop Coins, achievements, unlockables | [#50](https://github.com/MohamedXIV/slopboy/issues/50) | [#56](https://github.com/MohamedXIV/slopboy/issues/56), [#57](https://github.com/MohamedXIV/slopboy/issues/57) | P2: verified identity/events, after beta |
| Multi-file games, assets, cartridge art | [#51](https://github.com/MohamedXIV/slopboy/issues/51) | [#58](https://github.com/MohamedXIV/slopboy/issues/58), [#59](https://github.com/MohamedXIV/slopboy/issues/59) | P1: after secure one-file drafts |
| P2P / local multiplayer | [#52](https://github.com/MohamedXIV/slopboy/issues/52) | [#60](https://github.com/MohamedXIV/slopboy/issues/60), [#61](https://github.com/MohamedXIV/slopboy/issues/61) | P2: optional measured pilot |
| Discoverability, creator profiles, collections | [#53](https://github.com/MohamedXIV/slopboy/issues/53) | [#62](https://github.com/MohamedXIV/slopboy/issues/62), [#63](https://github.com/MohamedXIV/slopboy/issues/63) | P1: published catalog and moderation |
| IP/rights, privacy, backups, cost governance | [#54](https://github.com/MohamedXIV/slopboy/issues/54) | [#64](https://github.com/MohamedXIV/slopboy/issues/64), [#65](https://github.com/MohamedXIV/slopboy/issues/65) | P1: minimums before public UGC |
| Physical shutdown/boot, personalization, future 3D | [#55](https://github.com/MohamedXIV/slopboy/issues/55) | [#66](https://github.com/MohamedXIV/slopboy/issues/66), [#67](https://github.com/MohamedXIV/slopboy/issues/67) | P1 lifecycle, P2 cosmetics/3D |

**The current implementation order does not change:** #23 → #22 → #24, with #44 SDK and #25/#28 readiness in parallel. Future tracks are preserved as architecture and documentation requirements, not as a reason to block or inflate the first launch.

## Sprint 1 — Start here

**Primary order:** [#23](https://github.com/MohamedXIV/slopboy/issues/23) **UUID contract and non-destructive legacy save mapping** → [#22](https://github.com/MohamedXIV/slopboy/issues/22) **promote the Slopboy UI and keep the old prototype as `/legacy`** → [#24](https://github.com/MohamedXIV/slopboy/issues/24) **dynamic Next.js deploy without breaking PWA/guest games**.

**Engine work runs in parallel:** [#44](https://github.com/MohamedXIV/slopboy/issues/44) should design the engine-neutral manifest/host API alongside #23 without blocking the canonical route cutover. [#45](https://github.com/MohamedXIV/slopboy/issues/45) + [#46](https://github.com/MohamedXIV/slopboy/issues/46) are gates for the first end-to-end AI-created KAPLAY game (#30). Phaser #47 and PixiJS #48 are **not launch blockers** for that first vertical slice.

**Manual creator path:** design [#49](https://github.com/MohamedXIV/slopboy/issues/49) now; implement private source-only draft as soon as #26/#27 and #31/#44 provide real accounts and safe ingestion. This creates useful games without waiting for ChatGPT/Claude connector availability; preview still waits for #4/#32/#33.

**Parallel research/implementation:** [#25](https://github.com/MohamedXIV/slopboy/issues/25) Neon isolated development schema and [#28](https://github.com/MohamedXIV/slopboy/issues/28) OAuth provider / ChatGPT + Claude MCP compatibility, before real [#26](https://github.com/MohamedXIV/slopboy/issues/26) authentication and [#29](https://github.com/MohamedXIV/slopboy/issues/29) MCP tools.

**Sprint exit:** UUID routes, guest saves preserved, root new UI + legacy route, running dynamic Vercel Preview and real Chromium/mobile controls. No fake cloud or OAuth connected indicators.

## Manual paste-to-private-draft — earlier fallback slice

**[Issue #49](https://github.com/MohamedXIV/slopboy/issues/49) — P0.** The creator signs into Slopboy, copies `.ts`/`.js` code generated by ChatGPT/Claude/other AI, selects an approved engine/template and pastes it through `/dashboard → My Games → New game`. The same server-side service as future MCP ingestion verifies session ownership, limits inputs and saves an unexecuted **private draft** with diagnostics. Private-only access is **not** a security sandbox. Preview waits for validated isolated builds (#31, #32, #33, #4). Public publication always requires human review.

This path can validate real data persistence and ownership **before official AI plugin approval**, without postponing the ChatGPT/Claude Remote MCP goal. No custom HTML/CSS/JS website uploads: approved pinned game framework templates still apply. See [ADR-005](docs/architecture/adr-005-manual-source-ingestion.md).

## First real game acceptance journey

1. Creator signs in, linking their Slopboy account to **both ChatGPT and Claude** through OAuth.
2. ChatGPT or Claude calls `create_game_draft` with an authenticated tool, creating an immutable UUID-owned private draft. User identity always comes from verified server auth, **never** model-supplied account IDs.
3. Assistant transfers source/assets through bounded, verified uploads; isolated build and preview return honest state.
4. Owner sees game immediately in My Games and can play only when the safe preview passes. A second unrelated account cannot access it.
5. Optional private friend sharing uses grants; public discoverability requires admin review.
6. The same process is repeated against the other AI client to prove interoperability.

## Existing work and release constraints

- [PR #14](https://github.com/MohamedXIV/slopboy/pull/14) is Draft and carries real V2 UI, HeroUI drawers, screen FX, offline guest saves and curated runtime. Do **not** merge unchanged; canonical-route/UUID/backend/offline migration is still missing.
- Existing issues [#2](https://github.com/MohamedXIV/slopboy/issues/2), [#3](https://github.com/MohamedXIV/slopboy/issues/3) and legacy PRs are completed history. [#4](https://github.com/MohamedXIV/slopboy/issues/4) remains a security blocker. Legacy [#5](https://github.com/MohamedXIV/slopboy/issues/5) and [#6](https://github.com/MohamedXIV/slopboy/issues/6) need separate reconciliation rather than duplicate tickets.
- Every issue closes with tested code, typecheck/lint/build and relevant browser/security evidence, migration and rollback notes, and a small PR. Avoid unnecessary ongoing CI minutes and unapproved paid infrastructure.
- **GitHub Project #7 exists; its items have not yet been added into the Project board.** The linked Epics and their Issue checklists are the authoritative work hierarchy until a GitHub Project add-item operation is available. Don't claim the board is populated.

No calendar dates or production-ready status are implied by this roadmap.
