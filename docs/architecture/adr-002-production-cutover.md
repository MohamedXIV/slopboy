# ADR-002 — Slopboy production cutover and real backend (PROPOSAL)

**Date:** 2026-11-08  
**Status:** Proposed — requires stack review and integration tests before production merge  
**Scope:** Promote V2 to the canonical app, retain V1 as Legacy, replace hardcoded catalog assumptions with database-backed identity and entitlement.

## Decisions to review

1. **V2 is the new app; V1 becomes Legacy.** The canonical routes become `/` (devices/landing), `/library` (full catalog and personal library), `/play/[gameId]` (running a cartridge), `/games/[gameId]` (metadata/detail), and `/studio` (drafts/publishing later). `/legacy` and `/legacy/play/[legacySlug]` preserve V1 for reference and smoke tests. Keep temporary redirects from known `/v2` routes and the old root routes; redirects must be tested on Vercel.
2. **Opaque immutable game IDs.** `gameId` is a server-issued UUID (UUID v4 works everywhere; no need to infer title or slug). URLs use IDs only, never display names. Titles and search labels are editable metadata. Revisions have their **own UUIDs** and immutable build identifiers. `/play/[gameId]` resolves an authorized published revision or an authorized personal draft; explicit version selection may use a separate query/route without mutating the game's identity.
3. **Keep v1 save compatibility during promotion.** The three curated demos currently use slug IDs such as `tiny-catcher` in cartridge paths and IndexedDB keys. Introduce an explicit, finite `legacySlug -> UUID` mapping for these fixtures; migrate/alias local save namespaces transactionally without data loss. Do not silently replace IDs in existing save keys. Existing V1 URLs get explicit legacy or UUID redirects.
4. **Switch to runtime Next.js deployment when dynamic publishing is introduced.** Current `output: 'export'` requires known build-time game routes and cannot serve newly published UUID pages without redeployment. Remove the static export restriction **together with** the backend/route integration, not in a separate broken deployment. Keep public pages cached, runtime game metadata queried by ID, and games rendered in browser isolation. Update Vercel output and CI artifact assumptions.
5. **Offline-first stays a core feature.** Existing `tools/build-offline.ts` assumes static `apps/web/out` and an immutable global precache. Replace it with a versioned app-shell service worker plus explicit, per-user install/remove of approved immutable cartridge artifacts. Never precache private signed URLs or account responses; don't serve another user's cached data. Test offline boot, reconnect, IndexedDB guest saves and update rollback before merging.
6. **Backend candidate: Neon all-in-one.** Managed Better Auth for account identity, Postgres for games/metadata/ownership/milestones, private Object Storage for uploads, revisions and cloud saves, and Next.js Route Handlers/Server Actions for a limited API. Neon Functions only if a concrete isolated processing workload warrants them. Do not add Convex/Supabase/Neon simultaneously. Do not assume an authenticated user's email/display name proves ownership; enforce permissions server-side and (where supported) with RLS.
7. **No arbitrary public game code until safety gates pass.** Keep the actual V1 isolated pixel compatibility runtime for curated fixtures. KAPLAY's live WebGL iframe spike is not yet an untrusted-code security approval: hidden-frame throttling, CPU/memory control, source screening, cross-browser behavior and public distribution need verified design. Author/private preview and public publishing need separate trust/approval states.

## Proposed real data model

| Entity | Key and important fields | Security rules |
| --- | --- | --- |
| `games` | `id UUID PK`, `owner_id`, title, visibility, status, current published revision | creator edit; public sees approved published metadata only |
| `game_revisions` | `id UUID PK`, `game_id UUID FK`, build digest, framework, manifest, device profile, storage keys, created_at | immutable once published; author drafts private |
| `game_access` | `user_id`, `game_id`, grant type, expires/revoked | only actor with explicit grant can load private revision |
| `user_library` | unique `user_id + game_id`, installed/added_at/last_played_at | private per user; install/uninstall separate from purchased ownership |
| `play_history` | user + game + accumulated foreground duration + sessions | untrusted convenience analytics; not a currency source |
| `game_milestones` | game + revision + authored public milestone count | avoid spoilers, stable milestone IDs |
| `user_progress` | user + game + milestone ID + observed status | user-private; rewards cannot blindly trust game JS |
| `cloud_save_revisions` | revision UUID, user, game, device label, bytes, SHA256, storage key, created_at | private; immutable; atomic quota and revision caps |
| `device_preferences` | user + device + theme/visual settings | client-local first, cloud preferences opt-in later |
| `game_submissions` | game/revision, validation and review state | separate owner preview from public approval |

**Do not put large cartridge binaries or cloud save blobs in Postgres.** Store blob objects in private object storage, and index immutable content digests, metadata and quota reservations in Postgres. Public reviewed game artifacts can be downloaded as immutable, cacheable assets; private drafts use short-lived signed URLs after access checks.

## Cloud save product policy (proposed)

- Guest local IndexedDB save support continues indefinitely.
- Cloud sync is **opt-in** for authenticated players; never display a success state before server acknowledgment.
- Initial ceilings (service quotas, NOT simulated handheld memory): **10 MiB/account**, **5 cloud revisions/game**, **256 KiB/revision**. Revise from real usage; show transparent usage.
- Quota checks and object ownership are server-enforced transactionally. Keep a checksum and idempotency key; failed uploads cannot orphan quota reservations indefinitely.
- On conflicts: inspect local and cloud revisions, compare dates/digests, offer Keep local / Restore cloud / Keep both if space / Cancel; never silently discard either.

## Rollout batches and gates

### A. Canonical routing / backward compatibility
- Move shared UI shell to canonical root layout; route `/`, `/library`, `/play/[gameId]` to the actual V2 UI; create `/legacy` namespace for V1.
- Introduce UUID mapping and deterministic fixture imports; migrate/alias IndexedDB state with verified smoke fixtures.
- No mock sign-in, no fake cloud saves, no slug routes for newly published games.
- Browser regression across old bookmarks, known demos, mobile drawer, FX, input and restarts.

### B. Backend foundation with real resources
- Provision an explicitly Slopboy-specific Neon project and separate development branch; never reuse unrelated databases.
- Confirm project's region, free allowances, auth availability, object storage, Vercel connectivity and environment variables without committing secrets.
- Database migrations with constraints, indexes, server-side authorization tests and clean rollbacks.
- Implement real account creation/login/logout/session expiry and guest-to-user library reconciliation.

### C. Dynamic catalog and game distribution
- Convert Next.js to a server-capable Vercel build, create `GET /api/games` and `GET /api/games/[gameId]` or direct server-side data loading, preserve the existing playable client component.
- Game discovery is database-driven with pagination; imported fixture games become real rows with stable UUIDs.
- Implement immutable artifacts in object storage and revision-specific content digests; test revoked/private/public access.
- Update PWA caching to explicitly installed games and test offline/reconnect.

### D. Saves, library, creation and launch gate
- Integrate local + cloud saves, quotas and conflict resolution; synchronize private play history as opt-in.
- Game creator: authenticated drafts, versioned builds, isolated preview, upload scanning/validation, invited testers and review workflow. No anonymous JS execution in privileged origin.
- Gate public publishing and untrusted KAPLAY on security and real mobile testing; no fake backend screens.
- Only then merge the production cutover or promote tested release commits to `main`.

## Stack summary

- **UI:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, HeroUI v3; CSS virtual handheld; standalone WebGL screen FX.
- **Gameplay:** isolated client-side runtime; KAPLAY as engine candidate after security/performance gate; small pixel runtime for legacy-curated games.
- **API:** Next.js server handlers (minimize backend duplication).
- **Data/Auth/Files:** Neon Postgres + Managed Better Auth + Object Storage **candidate pending a live Slopboy project acceptance test**.
- **Hosting:** Vercel. Hobby is for personal/non-commercial use only; reassess hosting before monetization.
- **Offline:** PWA with guest IndexedDB saves and explicit immutable cartridge caching.
- **Testing:** unit, typecheck, ESLint, Chromium + mobile WebKit, permissions/RLS, multi-device saves, offline recovery. Avoid unnecessary recurring CI minutes.

## Merge policy

Do **not** merge current PR #14 unchanged: it still serves V1 on canonical URLs and V2 only under `/v2`, with all games from an immutable in-code list and static export. Keep the existing working production until an updated PR has working canonical routes, data migration strategy, full-stack deployment/rollback, and security/offline smoke evidence. Review stack choices in discussion before irreversible provider provisioning.
