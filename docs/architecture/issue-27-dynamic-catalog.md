# Issue #27 — dynamic catalog, server read-only foundation (Phase 1)

This PR is **stacked on Draft PR #83**, not production `main`. Auth remains
private and unmerged. The three curated `pixel-v1` demo cartridges keep
working from the existing reviewed static bundle and their stable UUIDs.

## New server surfaces

- `GET /api/games?limit=12&cursor=…` — public **database** discovery with
  bounded (1–24) keyset pagination and a strict opaque timestamp/UUID cursor.
- `GET /api/games/[gameId]` — a single game's metadata, visible only if it is
  a *published/public* game **with a matching published revision**, or to the
  verified, persisted profile that owns the game. Unauthorized/private/unknown
  UUIDs return the same 404 shape; client-provided owner IDs are ignored.
- `/games/[gameId]` — a minimal server-rendered metadata page using native
  HeroUI Card and navigation. It deliberately cannot execute arbitrary drafts,
  retrieve storage objects or invent a playable cartridge link.

All endpoints use parameterized SQL and `no-store` responses, so title edits
are visible at the next authorized request without changing an immutable UUID
or risking a user-specific CDN cache. No new schema/database migrations, new
roles, secrets or production variables.

## The important distinction

The seeded three games are intentionally stored in development Postgres as
**private drafts without published revisions or verified content digests**.
Therefore this DB-backed public API currently yields `games: []` in the dev
project; promoting those rows to public would falsely imply file review.
The original public offline curated games remain available unchanged through
the existing `@slopboy/catalog` compatibility adapter and `/play/[gameId]`.

A future import/review phase must attach SHA-256 of the *actual built bundle*,
an immutable published revision, and an independently verified storage artifact
before public discovery can include new games. Do not map untrusted storage URLs
into playable cartridge fields or load arbitrary JS in the privileged origin.

## Verification and remaining Issue #27 work

- Unit tests cover malformed cursors, duplicate query params, pagination
  bounds, SQL visibility/owner predicates and injection-shaped input.
- Ephemeral PostgreSQL CI tests a release first hidden without approved
  revision, then visible after revision publication; a private draft is
  invisible to guest/stranger but visible to its true owner.
- Real Next.js anonymous HTTP smoke verifies invalid inputs return 400/404,
  and absent DB connection returns 503 without fake catalog data.
- Full `#27` still needs actual revision/object import, public UI discovery
  replacing static catalog for reviewed artifacts, installed/added private
  `user_library` membership, and a live dev Preview with authorized dynamic
  published rows (not mocked in Production). Game execution remains gated by
  Issues #31/#32/#33 and engine security approval.

Rollback: revert the PR; no database migrations or data changes. Keep the
old offline catalog, UUID aliases, and IndexedDB guest saves intact.
