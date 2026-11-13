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

### Important qualification

These real Neon Development SQL checks simulate the owner subject UUID at the query layer. They **do not** constitute a working authenticated owner HTTP session. Existing Vercel Preview DATABASE_URL / Neon Auth secrets are restricted to the earlier dedicated Auth branch, not the new stacked branch. Do not broaden secrets to all previews without a deliberately isolated environment and owner approval, and do not fabricate a session or temporarily assign a real user the system curator's games just to make a happy-path test pass. Future deployment acceptance needs a separate, explicitly scoped Preview-to-Development binding and two real invited test accounts (owner/stranger), or a fully isolated disposable Neon branch with generated identities.

Production, game publication, private signed artifacts, cloud save/installation sync, and arbitrary game execution remain out of scope.
