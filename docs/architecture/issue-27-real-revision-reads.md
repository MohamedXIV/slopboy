# Issue #27 — Owner-scoped live Revision reads (Phase 2D)

Status: implementation in stacked Draft PR #89 over #88, not production. The three curated rows have already been imported into the separate Neon Development database using approved migration 003 and remain private drafts.

## Observed gap and correction

The original public catalog correctly joins only the published revision, but an authenticated owner opening a private game detail with an imported draft revision got a misleading "No published revision available" message even though the actual private game has a revision. This patch returns the latest revision **only if** the verified server session UUID is the game's owner in the SQL predicate and has a persisted users row. An anonymous user sees only a game marked public/published whose selected revision is also published.

The owner Dashboard's existing HeroUI Card now uses the account API to show the newest revision number, optional display SemVer, revision status and pinned engine version. It never displays or executes cartridge code. The public listing stays publication-only.

## Additional authenticated route

GET /api/account/games/[gameId]/revisions

- Requires a real server-verified session and verified email, followed by the persisted user profile gate.
- Ignores untrusted caller-supplied owner/role/query parameters; the session ID is the only SQL owner predicate.
- Uses a bounded, newest-first revision history (50 max); an owned game with zero revisions returns an empty array, while a different owner's UUID returns 404.
- Returns revision UUID, ordinal, display version (if present), engine and status metadata **only**. Never includes storage_key, artifact SHA URLs, source, raw manifest, save data or a preview permission.
- Returns private/no-store and nosniff headers; it is not a creator upload or publishing API.
- The account listing also returns latestRevision to avoid client-side N+1 calls. Existing pages can ignore the new field.

## Evidence and test gates

- Pure SQL is run **read-only on actual Neon Development** (project slopboy-dev, DB slopboy_dev): system curator's three owned games expose their three draft revision IDs, a fake unregistered actor sees zero games, and both anonymous and another actor see zero of the curator's private game details and revision history. Public catalog returns zero entries.
- PostgreSQL ephemeral tests first import three real attested revisions, then validate the same visibility predicates and owner history before inserting a second immutable revision. They verify newest-first sorting without changing the game UUID or making either draft public.
- Next.js anonymous route smoke asserts the new history endpoint returns 401 even with spoofed ownerId query parameters.
- Full TypeScript, lint, server build, Chromium security/Creator/KAPLAY/offline PWA regressions must pass at exact head before review.

### Real Vercel Preview acceptance and Neon Development permissions (2026-11-13)

The Vercel project initially restricted `DATABASE_URL`, `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` to the dedicated older Auth branch. New Draft PR #89 did not inherit them and the real unauthenticated `GET /api/games` returned `503 DATABASE_UNAVAILABLE` despite CI success.

The three existing encrypted values were copied **server-side** into three new encrypted Preview-only variables, each scoped specifically to `feat/27-real-revision-reads`. The Dev database name in the connection URL was independently validated as `slopboy_dev` before copying. No secret values were copied to GitHub, checked into the repository, exposed in logs, or broadened to generic Preview/Production. The existing Auth branch variables remain as they were.

The deployment after binding had Auth configured but public catalog still returned 503. Read-only privilege checks on the Vercel QA PostgreSQL role revealed it had CONNECT and schema USAGE but no SELECT on `games` or `game_revisions`. The exact existing QA login role was verified as non-superuser and non-creator. On **Neon Development only**, column-scoped SELECT grants were made under a guarded transaction:

- `public.users`: `id`, `display_name`, `role`.
- `public.games`: `id`, `owner_id`, `title`, `tagline`, `description`, `genre`, `visibility`, `status`, `created_at`, `updated_at`, `current_published_revision_id`.
- `public.game_revisions`: `id`, `game_id`, `revision_number`, `release_version`, `status`, `engine_id`, `engine_version`, `device_profile`, `created_at`.

The new grants do **not** confer INSERT/UPDATE/DELETE, revision manifest/storage key or cartridge artifact read access. An earlier effective SELECT privilege on `public.users.email` was also observed during postflight; it was **not** granted by this rollout and should be audited separately instead of claiming the QA role cannot read it. For any later player account bootstrap, the read-only scope might need its own narrowly reviewed write grants; they are deliberately **not** enabled here.

After the database privileges were corrected, the **real Vercel-hosted** public GET calls succeeded:
- `/api/games` and `/api/games?limit=4`: HTTP 200 with `{"games":[],"nextCursor":null}` (empty public catalog is correct).
- `/api/games/<private-draft-UUID>`: HTTP 404 `NOT_FOUND`, no private metadata.
- `/api/auth/get-session`: HTTP 200 with `null` for guest; Auth is configured.
- `/auth/sign-in`: HTTP 200 with configured sign-in UI.
- Invalid cursor/limit requests: HTTP 400.

The Vercel account-linked fetcher has limitations on endpoints with **HTTP 401**: its temporary share-link validation can reject a legitimate application 401 as deployment-protection 401. Do not claim successful real HTTP 401 authorization testing from that tool. CI's local real Next.js HTTP tests verify anonymous 401 logic; real authenticated users and foreign-account denial remain separate unfinished acceptance gates.

To repeat the complete **anonymous HTTP** contract from a network-enabled development machine, including proving that 401 is JSON from Next.js rather than a Vercel protection challenge:

```sh
SLOPBOY_PREVIEW_URL=https://<your-actual-preview>.vercel.app/ pnpm security:live-preview
```

For Vercel-protected deployments, use an explicitly authorized, short-lived automation bypass in `SLOPBOY_PREVIEW_PROTECTION_BYPASS` via a private environment (never paste it into GitHub issues or commit it). The script sends **no cookies** and rejects misconfigured DB, a public draft leak, false anonymous session, incorrect status, cache weaknesses or HTML deployment challenges.

This script **cannot** prove owner/stranger authentication: that requires real verified accounts with authorized owned fixtures and real login sessions. Do not spoof a session, assign curated system-owned games to a player or create live authentication fixtures without a separate explicit gate. Existing Neon Development data and Published status were unchanged by the acceptance tests.

### Important qualification

These real Neon Development SQL checks simulate the owner subject UUID at the query layer. They **do not** constitute a working authenticated owner HTTP session. Vercel Preview credentials are now copied into encrypted, branch-scoped values for the exact PR #89 QA branch, **not** all preview branches. Actual anonymous Neon HTTP GETs passed as described above. Owner/stranger signed-in HTTP testing is still pending real verified sessions and authorized fixtures; no simulated login or game ownership changes have occurred.

Production, game publication, private signed artifacts, cloud save/installation sync, and arbitrary game execution remain out of scope.
