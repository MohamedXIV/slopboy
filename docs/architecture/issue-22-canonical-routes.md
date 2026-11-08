# Issue #22 — Canonical Slopboy UI / legacy routing migration

## Route contract (static-export stage)

| Route | Owner / behavior |
|---|---|
| `/` | New (formerly V2) devices page, inside one HeroUI/shared-shell layout |
| `/library` | New curated library, UUID play links and existing guest save UI |
| `/play/<gameId UUID>` | New device player; same isolated pixel-v1 runtime and UUID storage |
| `/play/<curated legacy slug>` | Compatibility page; client replaces URL with canonical UUID |
| `/play` | Historical default, replaces URL with first curated UUID game |
| `/legacy`, `/legacy/library`, `/legacy/play`, `/legacy/play/<slug>`, `/legacy/create` | Original V1 home/library/play/creator, with working old pixel cartridges and in-legacy links |
| `/create` | Historical creator link to `/legacy/create` |
| `/v2`, `/v2/library`, `/v2/play/<UUID-or-slug>`, `/v2/spikes/kaplay` | Compatibility redirects to `/`, `/library`, `/play/<UUID>`, `/labs/kaplay` |
| `/labs/kaplay` | Existing first-party KAPLAY feasibility lab (NOT an approved upload runtime) |

New React components were **not** rewritten or styled from V1. The canonical Next.js `(modern)` route group owns exactly one `V2AppShell` instance per modern page and keeps its existing HeroUI theme/session state across client navigation. `/legacy` is an independent route tree without HeroUI chrome. The previous `/v2` route tree renders only compatibility pages. All original play history and IndexedDB save namespaces from #23 are preserved.

## Redirect tradeoff

Issue #24 will replace `output:'export'` with a dynamic Next.js runtime. Static export **cannot** use Next.js server redirects; this batch uses a small allowlisted internal client-side `window.location.replace` redirect component with a normal link fallback for users with disabled JavaScript. Query and fragment are preserved. All known static redirect source routes are pre-rendered, including curated UUID and legacy-slug aliases, so previous bookmarks and installed service-worker clients can load the redirect page. No blanket catch-all redirect is included; unknown game IDs do not create valid routes. Server-side 30x redirects may replace this at #24, after Vercel and offline smoke validation.

## Release gates and rollback

- This branch stacks on the **unmerged** Issue #23 branch, which itself stacks on Draft PR #14; do not merge any of those straight into `main` without the Issue #24 dynamic/PWA cutover and verified preview.
- Until #24, the generated offline worker caches current static app pages, cartridges and compatibility pages. Do not delete or rotate the existing IndexedDB database or localStorage. Old slug saves are recoverable by the UUID layer, not deleted.
- To roll back, deploy the previous known-good production artifact. Source bookmarks and original V1 records remain intact. UUID-key progress written during the new version may not appear in older client builds until the version is reintroduced; preserve all browser storage.
- Browser acceptance should confirm root/home, UUID player, old `/v2` + slug redirects, legacy home/library/creator/play, mobile HeroUI drawer, screen FX, keyboard/gamepad behavior, foreground play history and seeded IndexedDB save migration.
- Final Vercel Preview verification and device/WebKit/offline update-rollback QA are separate release gates; a CI pass is evidence for the tested Chromium build, **not** proof of a production deployment.
