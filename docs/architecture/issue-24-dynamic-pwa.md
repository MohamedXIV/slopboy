# Issue #24 — Dynamic Next.js / offline PWA migration (P0)

**Scope:** stacked on Issue #22 PR #69, Issue #23 PR #68 and still-draft Slopboy 2 foundation PR #14. No production release or backend credential provisioning. Tested branch `feat/24-dynamic-pwa-runtime` maintains the current curated pixel-v1 runtime and guest storage.

## Deployable runtime contract

- Removed Next.js `output: 'export'`; `apps/web/.next/BUILD_ID` and the actual Node `next start` are the CI/host artifacts. Vercel builds Next normally; Render can run the same Next/Node production process, with no Vercel-specific APIs.
- `/play/[gameId]` is server-rendered at request time (`force-dynamic`). Unknown IDs 404. Known old slugs redirect to canonical UUIDs. The three curated games continue using their approved compressed `.slop` artifacts, separate from game UUID identity.
- `GET /api/public-games/[gameId]` is an intentionally **public**, no-store response for reviewed games. Do not add owner/private data to this contract.
- For an acceptance test only, `SLOPBOY_RUNTIME_FIXTURES_JSON` may be set on a test `next start` process to an array of `{gameId,revisionId,title,reviewedCartridgeSlug}`. Each game/revision must have a distinct valid UUID and the slug must be one of the three **already reviewed** bundled cartridges. There is no arbitrary submitted code, no user draft loader and no public upload endpoint. Real database-backed review/publishing follows in a later sprint; this registry is intentionally not a product backend.
- CI launches a real Next server with a UUID never compiled into its catalog, checks route and public manifest (plus negative 404 fixtures), and plays it in Chromium after reconnection.

## PWA installation and cache isolation

- `tools/build-offline.ts` generates `apps/web/public/sw.js` *before* `next build`; root/published game routes no longer rely on static HTML exports. Worker update uses a release digest from reviewed public icon/cartridge assets and template.
- The public shell caches only `/`, `/library`, manifest, icons and their public hashed Next assets. Responses for shell/game pages require a server-set `X-Slopboy-Offline-Public: 1` marker. API JSON, RSC/Flight router payloads, requests with query strings, cross-origin/credential-bearing URLs, and future private data are never cached as shell/game content.
- The Library and Play workspace expose **Install offline** and **Remove offline** for each approved game. The install message checks UUID metadata, allowed cartridge path and a compressed-byte safety ceiling; stores its exact public HTML, reviewed gzip cartridge and associated hashed chunks. The source remains the same isolated pixel-v1 engine.
- The reviewed game UUID may be runtime-supplied by a **trusted server-side fixture**, but it can only alias one of the bundled reviewed cartridges; this is not arbitrary uploaded JavaScript.
- Old implicit `slopboy-static-*` caches are **preserved** for rollback and copied into the install/index caches when available during activation. A version-stable uninstall tombstone prevents an old implicit cache from resurrecting a game the user explicitly removed when a later worker activates. A re-install clears the tombstone.
- **Uninstall never deletes IndexedDB or localStorage.** All autosaves, backups, history, client theme settings and migrated legacy data remain untouched. Multiple approved UUID fixture identities can share the same reviewed cartridge artifact without another game's uninstall deleting it.

## Tests and failure/rollback plan

`pnpm build` compiles assets and the service worker before Next build; `pnpm security:runtime-routes` tests real SSR and unknown-at-build UUID; `pnpm security:v2-browser` still validates curated gameplay, display FX, mobile drawer, saves, compatibility links and hostile iframe behavior; `pnpm security:kaplay-spike` verifies the non-public experimental lab; `pnpm security:pwa-browser` uses Chrome Service Worker + Network offline mode **and stops the actual Next server** (so the worker cannot secretly fetch from a second browser target); it restarts on the same origin for reconnect and checks install, cached resources, offline game boot, local IndexedDB continuity, offline library, uninstall and reconnection. Unit tests check registry validation, cache isolation and update/tombstone rules.

If the deployment is rolled back, the old pre-existing `slopboy-static-*` cache and original legacy save keys were **not** destroyed. The old client does not read new UUID save progress; preserve user browser data and restore the current version later for recovery. No destructive migration on IndexedDB database or post-install caches is allowed. Do not promote to `main` until exact-commit Vercel preview and end-to-end CI pass, and until cross-browser Safari/WebKit/mobile plus complete old→new service-worker upgrade/rollback have received release QA.

## Security/product non-goals

No account login, cloud saves, dynamic database-backed publishing, object storage, arbitrary third-party JS, RLS or quotas are claimed in Issue #24. Only reviewed first-party compatibility cartridges are playable. Public media metadata is not an entitlement. Next.js runtime support does **not** authorize public game uploads or mark KAPLAY as safe for untrusted cartridges.
