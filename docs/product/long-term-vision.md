# Slopboy — Long-Term Product Vision & Architecture Guardrails

**Created:** 2026-11-08  
**Status:** Documented product direction + deferred backlog, **not implemented** and **not a commitment to ship in the initial beta**.  
**Primary implementation roadmap:** [ROADMAP.md](../../ROADMAP.md). **Architectural core:** ADR-002 → ADR-003 → ADR-004 → ADR-005.  
**GitHub tracking:** [Project #7](https://github.com/users/MohamedXIV/projects/7), deferred Epic issues [#50–#55](https://github.com/MohamedXIV/slopboy/issues/50), and their execution issues [#56–#67](https://github.com/MohamedXIV/slopboy/issues/56).

## Why this exists

The first Slopboy release must be modest, but many of its fundamental entities (game IDs, accounts, revisions, device profiles, saves, engine adapters, moderation, catalog, host runtime) will be reused by more advanced systems. We want to **plan extension seams today**, while explicitly **not building speculative systems early**.

When an AI coding agent implements a current Epic, it should:
1. Read this document and the current Roadmap, then the appropriate ADR and Issue acceptance criteria.
2. Preserve stable IDs, versioned contracts, authorization boundaries, portable host/platform services and compatibility tests needed by future features.
3. **Not** create empty feature tables, placeholder components, fake user-facing promises, generic framework layers or overengineered APIs just because a future Epic is documented.
4. Implement the smallest coherent supported slice for the current Issue; defer future mechanics and polish to their existing issues.
5. When a current decision would make an item here impossible/expensive, note it in the relevant Issue/ADR and address the boundary before entrenching it.
6. Keep historical old design docs available, but treat ADRs and this document as superseding outdated v0.1 assumptions.

## Non-negotiable current direction

- **Agent-native platform:** games primarily authored within ChatGPT, Claude and future AI clients; OAuth-linked Remote MCP submits code on behalf of the creator. Manual paste of framework-template code is an equally legitimate first-class fallback (ADR-005).
- **Multiple roles, one account:** guests can play, a user can be both player and creator, admin privileges are separately enforced. Private drafts by default, explicit friends sharing, human review before public listing.
- **Approved frameworks:** pinned KAPLAY first candidate, Phaser 4 future adapter, optional PixiJS evaluation; new submissions are approved game modules/assets, not arbitrary standalone HTML/CSS/JS sites. Browser sandbox and build isolation remain compulsory.
- **Fantasy hardware is display-only:** logical resolution, aspect ratio, indexed color count, plus actual physical input mapping. No fake CPU, RAM, ROM/cartridge byte limit, save capacity, audio voice limit or fixed hardware FPS. Game performance/service quotas are operational constraints, not simulated chips.
- **One runtime lifecycle contract:** device/game boot, suspend, shutdown, save, cartridge insertion/ejection and swap are distinct states. The same live game session survives display-only fullscreen changes; real power-off stops execution and audio.
- **Offline-first:** local guest saves and installed game content work without account/network; server cloud sync is opt-in with real quotas and conflicts. New game/revision UUID identities are stable through title and cover changes.
- **$0-first:** do not silently sign up for paid resources. Next.js frontend stays on Vercel for now; Render is only a potential future replacement for **frontend/Next.js hosting**. Neon is the separate backend/Auth/Object Storage/MCP-functions candidate.
- **Game systems should demonstrate values through gameplay**, not generic repetitive slogans in player-facing text.

## Long-term backlog, deliberately not Sprint 1

| Track / GitHub Epic | Later deliverables | Preserve now | Scheduling |
| --- | --- | --- | --- |
| [#50 Achievements & Slop Coins](https://github.com/MohamedXIV/slopboy/issues/50) | [#56 achievement contracts](https://github.com/MohamedXIV/slopboy/issues/56), [#57 audited ledger/unlockables](https://github.com/MohamedXIV/slopboy/issues/57) | Stable game IDs; event-source trust boundary; independent entitlements | P2, after real Auth/catalog/progress |
| [#51 Asset-rich cartridges](https://github.com/MohamedXIV/slopboy/issues/51) | [#58 multi-file asset packaging](https://github.com/MohamedXIV/slopboy/issues/58), [#59 procedural/creator covers](https://github.com/MohamedXIV/slopboy/issues/59) | Versioned manifests, content digests, upload quotas, stable cover identity | P1, after one-file draft/secure pipeline |
| [#52 Optional multiplayer](https://github.com/MohamedXIV/slopboy/issues/52) | [#60 P2P/TURN feasibility](https://github.com/MohamedXIV/slopboy/issues/60), [#61 opt-in room/local-play contract](https://github.com/MohamedXIV/slopboy/issues/61) | Optional network capabilities, friends/privacy, lifecycle cleanup | P2, after solo product |
| [#53 Discovery & community](https://github.com/MohamedXIV/slopboy/issues/53) | [#62 search/filters](https://github.com/MohamedXIV/slopboy/issues/62), [#63 creator profiles/collections](https://github.com/MohamedXIV/slopboy/issues/63) | UUID catalog, ownership visibility, moderation/provenance | P1, public catalog maturation |
| [#54 Governance & operations](https://github.com/MohamedXIV/slopboy/issues/54) | [#64 IP/policies/takedown](https://github.com/MohamedXIV/slopboy/issues/64), [#65 privacy/backups/budgets](https://github.com/MohamedXIV/slopboy/issues/65) | Audits, least privilege, retention, access revocation, quota accounting | Minimum policy P1 before public UGC; deep ops later |
| [#55 Device lifecycle & polish](https://github.com/MohamedXIV/slopboy/issues/55) | [#66 real power/cartridge boot](https://github.com/MohamedXIV/slopboy/issues/66), [#67 cosmetics/optional 3D](https://github.com/MohamedXIV/slopboy/issues/67) | Host lifecycle, display FX independence, settings format, skin vs entitlement | True shutdown P1; fancy visuals P2 |

### 1. Achievements, progression, Slop Coins and unlocks

Initial Slopboy concept includes **one earned platform currency**, Slop Coins, and optional themed achievements per game. Game progression can unlock fantasy devices, selected games, physical shell colors, stickers, limited editions, boot animations and other cosmetic content. There should be generous starting choices, no forced grind and no pay-to-win expectation. Game-specific achievements and unlock criteria must have stable, authored, reviewable IDs; not every game needs a story or achievements.

**Trust boundary:** the agent-authored game runs as untrusted client code. It can propose achievement events, but those are **not proof** for a server-minted wallet. Design for replay protection, limits, moderation, server-authorized grants and an audited, idempotent balance ledger only when the economy is implemented. Guest offline achievement progress may be provisional, not spendable global currency.

**Don't implement now:** currencies, rewards tables, fake achievements or wallet UI before trustworthy identity/event contracts. See #56 and #57.

### 2. Rich cartridge assets and cover art

Early Paste Code supports a single typed game source file. Real games will need *multiple* source modules, sprite sheets/images, animation frames, audio, fonts and metadata. Framework-specific adapters must package them deterministically without arbitrary network imports or custom HTML/CSS websites. Keep stable UUID game and revision identity, manifest digests and offline install paths.

Cartridges should have varied **procedural seeded cover art** generated at game creation; stable cover layout/colors may be refined by creator artwork later (subject to rights review). The cover is **presentation**, not the identity of the game. Changing title/art/color never invalidates saves or bookmarks. Game runtime binaries can be shared/pinned rather than copied into every tiny cartridge.

**Guardrail:** a ZIP is not “just files”; compressed/expanded size, path traversal, count and decoder limits apply. Never bypass #31/#32/#4. See #58 and #59.

### 3. Optional multiplayer (not a launch promise)

Players may later want small-player co-op or versus (often 2–4), LAN/local party or hotseat. Prefer minimal costs: evaluate WebRTC/Trystero and simple signaling, but P2P cannot guarantee connectivity without relay/TURN for all NATs and networks; $0 global reliable multiplayer must **not** be promised. Consider data-channel encryption, room membership and teardown, host authority or deterministic simulation only when a specific game requires it.

**Preserve now:** the host lifecycle can optionally expose capabilities and input ownership. Solo/offline games should never need WebRTC or networking permission. Network access in untrusted game source stays sandbox-controlled. See #60/#61.

### 4. Community, search, creator identity and discovery

A game catalog should grow beyond a static grid: searchable tags/categories/device compatibility, curated lists, new releases, genuine play statistics, creator profiles and collections, ratings/comments, optional follows and bookmarks. Avoid private draft metadata leaking through search/recommendation caches. Ratings need user/account controls and reporting; analytics must distinguish **verified**, **approximate** and **game-supplied/untrusted** numbers. Do not fabricate story completion from play duration.

**Preserve now:** game UUID separate from title, server visibility, revision status, creator identity and ability to paginate. Don't build “trending” UI with made-up numbers. See #62/#63 and existing #37/#39.

### 5. Trust, governance, IP rights, data protection and cost controls

Before accepting **public** user-generated or AI-generated games, define creator rights declarations, content and copyright/trademark policy, reporting, takedown/review appeals, age/access considerations and repeat abuse handling. AI generation does not imply rights to copy commercial games, protected music, images, brands or characters. User-side private source ownership and public publishing rights are distinct.

Treat privacy as product behavior: user data export/deletion, cloud-save conflicts, separate guest saves, signed access revocation, retention, account moderation and backup/recovery. Design for operational $0 limits: database/storage/egress/compute quotas, per-user abuse ceilings, audit logs, safe error states, orphan upload cleanup and cost alerts. Human review and static scanning never replace technical sandboxing.

**Preserve now:** least-privilege server checks, meaningful audit events and provider portability. Full governance documents must exist before open public submissions; not necessary to block a private source-only dev slice. See #64/#65.

### 6. Device feel, shutdown, cartridge actions and personalization

The current first handheld already looks good, but visual boot/insertion animation is not the same as **real device power**. Later build device-specific cartridge shapes/slots, physical Power/Shutdown, eject/change, correct game boot vs console boot, errors, session resume and saved progress. The host must coordinate game stop, input release, audio cancellation and save state; no simulation updates while genuinely powered off.

Keep console mode and screen-only fullscreen the same session; allow optional LCD/phosphor/glass FX, appearance-level refresh effects (not actual game FPS caps), shell skins, stickers, colors, limited editions, reduced motion and accessible controls. Optional 3D rotatable hardware using Babylon.js/Three.js may come **far later**; don't import a heavy 3D engine just for current 2D.

**Preserve now:** host lifecycle state machine concepts, engine-neutral display bridge, profile-ID/skin-ID separation, user preference versioning. See #66/#67.

## Stage gates / when to revisit each track

1. **Current Sprint 1:** UUID migration, V2 canonical route, Next dynamic/PWA, engine-neutral Host API. *Only preserve extension points*; don't introduce the new long-term features.
2. **First private game:** real Auth+Neon, creator-owned draft from manual paste or OAuth MCP, isolated valid KAPLAY build and secure owner preview.
3. **Closed beta:** user dashboard, cloud saves, review queue, basic legal/privacy/abuse rules, real feedback and device lifecycle reliability. Revisit asset-rich cartridges and simple discovery when creator needs justify.
4. **Public submissions:** IP and content policy, moderator tools, report/takedown, private/public access checks, auditability, backups/cost controls **mandatory** before opening the catalog to arbitrary users.
5. **Post-beta progression:** achievements/coin rewards, broader consoles, fuller community and advanced personalization **only with** validated identity/trust and actual user demand.
6. **Optional experimental phase:** multiplayer/P2P and 3D inspection based on measured feasibility, not assumptions.

**No calendar deadlines are implied**. Priorities are ordering hints, not commitments to ship.

## Architecture-review checklist for AI agents

Before accepting a design touching the current catalog, schema, SDK, UI or routing, ask internally:

- Does the change keep **game ID, revision ID, owner, visibility, display profile and installed/entitled state** distinct?
- Does it allow more than one vetted framework without embedding KAPLAY/Phaser specifics into account/data API code?
- Does source/asset handling permit eventual multi-file bundles with bounded quotas, stable checksums and private access without unsafe remote scripts?
- Do events from untrusted games stay separate from platform-trusted wallets, rewards, ownership, administration and public metrics?
- Will public catalog search avoid private/unlisted game metadata leakage, and can moderation revoke approved revisions?
- Can the host eventually shut down/eject/restart a cartridge and avoid losing saves, without distorting logical display or gameplay cadence?
- Is offline guest play still independent of cloud login/sync? Can a storage failure avoid blocking gameplay?
- Can optional multiplayer be added without turning on network access for every cartridge or charging for a permanent server now?
- Is Vercel replaceable by Render for **frontend hosting only**, while Neon backend and versioned services stay independent?
- Does this implement the current Issue rather than silently start a deferred Epic?

If the current scope does not require an answer, **document the uncertainty** in the Issue/ADR; do not invent a subsystem or ship placeholder UI.

## Change-control and maintenance

- Add newly approved long-term ideas here **and** link an Epic/Issue. Edit both when a decision changes.
- Only move a deferred task into an active Sprint with an explicit issue prioritization and a working dependency-ready path.
- Keep earlier spec history for audit, but supersede contradictory older language explicitly; no outdated “CPU/RAM/ROM restrictions” in current implementations.
- A game runtime or device update must never silently reinterpret or corrupt published cartridges, published engine versions, user ownership or saves.
- Make the document available to code agents via root [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md) and [README.md](../../README.md); it must be part of agent onboarding, not only conversational memory.
