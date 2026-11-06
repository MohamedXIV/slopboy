# Slopboy 2.0 — Foundation and vertical slices

**Status:** branch-only implementation, not a production launch. **Started:** 2026-11-06.
**Premise:** Slopboy v1 and Gemini's one-file demo are prototypes, not compatibility or implementation requirements.

## Product invariants

- Original virtual handheld **slabs**, with largely rectangular exterior silhouettes. Never winged gamepad forms or close replicas of Nintendo/Sony designs. Families: vertical, wide, compact, folding rectangular. A device's look is distinct from its technical capabilities.
- Players may play offline and on nearby devices without an account. Cloud ownership/sharing, creator publishing and remote AI integrations require authenticated identity.
- Drafts are playable by their creators without public content review. Friends can be invited to specific immutable revisions after automated checks. Public discovery requires human approval. Private/unlisted access is not a substitute for technical sandbox isolation.
- **Display-only virtual devices:** games target a logical resolution (width × height / aspect ratio) and indexed-color count. No virtual CPU, RAM, GPU capacity, maximum audio voices, FPS ceiling, code/ROM size or save-memory limits. Physical buttons describe interaction and input mapping rather than restricting computation.
- **Platform safety is separate:** sandboxing, upload/asset validation, storage quotas, protection from runaway scripts and operational limits protect users and infrastructure. Never present these as invented console specifications.
- Creating and playing a game must work without a paid AI service; ChatGPT, Claude and other agents use the same versioned creator protocol. Agent authorization is scoped and revocable.
- Default candidate game framework: **KAPLAY 3001 stable**, advanced rigid bodies optional pending KaPlanck/Planck compatibility tests. Native-pixel remains an optional engine. Phaser/Matter are alternatives if KAPLAY tests fail.
- P2P multiplayer candidate: Trystero/WebRTC, private 2–4-player rooms; host-authoritative physics for a two-player slingshot duel. No dedicated gameplay servers or paid TURN. Connectivity cannot be guaranteed behind all NATs. LAN without internet needs separate signaling, not public Nostr. Same-device multiplayer and Native Nearby are different transports.
- Coins/achievements with global consequences must be trusted server-side. Host-authoritative P2P is **not** trustworthy for global spendable rewards.
- Keep operating costs at $0 where quotas allow; do not claim unlimited free scale.

## Versioned source of truth

The first new contract is `packages/hardware/src/v2.ts`. Its device has revision
`2.0.0-preview`, indexed 160×144 four-shade display and original rectangular shell families. Only model 1000 is active. The future three families are **concepts**, not playable products. Colors and shell finishes are presentation-only and cannot change the logical display resolution or palette depth.

No arbitrary game code may modify these specs, use account credentials or execute directly in the privileged Next.js document.

## Architecture boundaries

| Boundary | Responsibility | Current implementation |
|---|---|---|
| Platform app | Library, player UI, creator studio, account/social UX | V2 showroom and real curated game player on isolated branch |
| Hardware contract | Versioned device capabilities; shell form and cosmetic catalogs | `@slopboy/hardware/v2` |
| Cartridge/build service | Validate source/assets, build reproducible cartridges | V1 reference until next contract |
| Engine adapters | KAPLAY or small pixel games; submit constrained frames/input to virtual hardware | V1 pixel compatibility only; **KAPLAY not yet integrated** |
| Execution boundary | Separate untrusted browser origin, bounded code/frames, watchdogs | V1 opaque iframe + private Worker bridge reused to validate V2 UI |
| Identity/OAuth | Player identity; MFA/session policy; OAuth 2.1 MCP scopes | **Unimplemented**; Neon Managed Better Auth first candidate |
| Game permissions | Immutable revisions; owner/friend/unlisted grants; public-review status | **Unimplemented**; no pretend client-side RLS |
| File storage | Private signed cartridge URLs and public reviewed releases | **Unimplemented** |
| Trusted ledger | Coins/achievement grants with idempotency/abuse prevention | **Unimplemented** |
| Multiplayer | Engine-independent sessions: local, online P2P, LAN, native nearby | **Unimplemented**; Trystero candidate, not a game server |

## V2 first vertical slice — implemented for testing

Paths `/v2` and `/v2/play/[game]` are the new UI laboratory. The first playable hardware is a rectangular slab with physical input, keyboard, standard gamepad polling, console/game-only mode sharing the same canvas/session, fullscreen, four physical-shell color finishes, four LCD palettes, scanline effect and save isolation. The actual games are **curated V1 cartridges** executed in the existing Worker/iframe, marked as a *pixel-v1 compatibility adapter*. The scope is a playable design/architecture spike, not a KAPLAY adoption or backend launch.

All body backgrounds, button colors, and LCD palettes from Gemini are adapted design ideas rather than copied source. No `new Function`, mock authentication, staged WebRTC success, fake currency, pseudo-review or source-code execution in the privileged app.

### Acceptance for this slice

- `pnpm test` validates display-only hardware compatibility, controls-as-input-metadata and palette separation from cosmetics.
- `pnpm typecheck`, `pnpm lint`, Next static export and PWA offline build pass.
- `pnpm security:browser` still rejects the Worker spoofing/watchdog fixtures.
- `pnpm security:v2-browser` starts a real game in headless Chrome over local HTTP, checks frame dimensions, keyboard input and a changed framebuffer, palette/shell selection, mode switching without reload, and restart with new iframe. **Chrome alone is not mobile/Safari security approval.**

## Neon candidate evaluation gates (not implementation claims)

Neon Managed Better Auth + Neon Database + Neon Object Storage + Functions is the current preferred *candidate*, not a locked provider. Its OAuth 2.1/MCP feature is very new; production architecture must pass:

1. Real login/logout, device sessions, token expiration/revocation, account deletion.
2. Resource-bound OAuth 2.1 token acquisition/refresh using ChatGPT/Claude-compatible MCP discovery and consent with least-privilege scopes; zero global admin scope.
3. Authorization tests: private game creator, invited friend, stranger, revoked invitation, reviewer; signed URLs expire and cannot be refreshed without permission.
4. Proper server-side checks/row authorization on PostgreSQL, including Neon Realtime Beta's RLS limitations: do not expose broad unfiltered subscriptions or database credentials.
5. Storage quotas, private asset access, reproducible backup/restore, free-tier limits and idle behavior.
6. Cost monitoring and service-failure testing.

Do **not** provision paid resources or commit credentials. Provider configuration cannot be verified without a real Neon project and appropriate permissions. Supabase is the fallback if the test reveals security/operational blockers.

## KAPLAY isolation gate

KAPLAY is Canvas/WebGL-based; the existing restricted Worker frame-buffer API is **not** a drop-in host. Prototype an explicit versioned engine adapter on an isolated branch first. Required: load KAPLAY from a pinned, self-hosted runtime **only when needed**, prove it renders from an opaque-origin sandbox, no unrestricted account DOM, no unrestricted network, hard watchdog behavior for stalls, indexed palette *output enforcement* and bounded frame/asset sizes, responsive touch input, Chromium/Firefox/WebKit and mobile checks. Check whether rendering can be captured under WebGL without expensive frame readbacks and whether a background/hidden document throttles timers. An opaque iframe alone does not impose a CPU/memory quota: untrusted execution risk remains a separate gate.

Performance benchmarks and frame transfer targets are user-experience checks, not emulated per-console FPS caps. CPU/memory isolation is required for untrusted code safety, not retro authenticity.

The first advanced physics test is a 2-player slingshot duel with rotating rigid bodies and destructible structures. Compare KaPlanck and Phaser/Matter if the KAPLAY path cannot meet the budgets. Evaluate Trystero/Nostr separately from truly offline LAN.

## Cutover policy

Maintain the original main and a V2 branch. Do not merge V2 into main merely because a screenshot looks attractive. Prefer substantial tested vertical slices over paper abstractions. Replace/rebuild anything needed; migration of the prototype's internal data is **not required** unless a real production user dataset is identified. The branch may be rebased/restructured freely until security, offline and mobile acceptance. V2 production rollout must not overwrite known-good V1 until the new player and creator loop pass.
