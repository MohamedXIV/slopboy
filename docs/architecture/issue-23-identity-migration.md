# Issue #23 — Immutable curated game IDs and guest-save migration

## Identity contract

- `gameId`: immutable UUID, seeded in `packages/catalog/src/index.ts`. The future backend must import these exact fixture UUIDs, not issue replacements. Titles are editable independently.
- `revisionId`: separate immutable fixture UUID for the currently bundled pixel-v1 revision. A game can acquire new revisions without changing `gameId`; this sprint does not introduce source revision ingestion.
- `legacySlug`: finite curated alias retained for old manifests (`manifest.id`), immutable `.slop` filenames and older bookmarks. It is **not** a new game identifier.
- `hardware`: existing curated pixel-v1 compatibility profile. Virtual device limits for new engines remain display resolution, indexed palette and controls (ADR-004).
- `save-v2:<profile>@<version>:<gameId>`: versioned IndexedDB host key. Value is a `slopboy-save-v2` envelope containing the UUID and either a payload or a deletion tombstone; it is not tied to title or revision ID.
- `slopboy:local-backup:v2:<device>:<gameId>:<slot>`: versioned IndexedDB backup keys.
- `slopboy:v2:history:v2:<gameId>`: versioned localStorage history with `schemaVersion:2`.

## Migration and rollback

V1 `save-v1:<profile>@<version>:<legacySlug>`, `slopboy:local-backup:v1:<device>:<legacySlug>:<slot>` and `slopboy:v2:history:v1:<legacySlug>` are **never deleted or renamed during migration**. Before reading a curated save or snapshot, the host checks the new UUID key. Only when missing does it copy a valid legacy value. Browser IndexedDB uses one read/write transaction with a no-clobber condition. If a migration aborts, read falls back to the original legacy record and a subsequent read can retry. Repeated reads leave an existing versioned value untouched. Unknown/corrupt values are never forwarded to the game or silently overwritten. An explicit deletion writes a UUID-key tombstone to avoid reviving old progress. History is copied on first read and remains visible from the legacy key if localStorage rejects a write.

**Rollback:** deploy the prior V2 build or follow an old slug route. All original records and curated cartridge files still exist. New progress written *after* switching to UUID keys will not automatically back-propagate to old V1 keys; rolling back may show the earlier original progress. Keep the UUID records until a future forward re-upgrade. Do **not** clear site data or remove the `slopboy-local-saves` database while rolling back.

## Sprint boundaries

Both `/v2/play/<UUID>` and `/play/<UUID>` are statically generated alongside the historical slug bookmarks. The actual V2-to-canonical route promotion and removal of static export are Issues #22 and #24, respectively. Curated pixel-v1 cartridge bytes and the opaque iframe runtime remain unchanged.

Tests: `pnpm test` includes fixture UUID stability, manifest compatibility, valid/invalid autosaves, snapshots, interrupted/idempotent copies, tombstones, history, and reload semantics. The existing browser smoke launches a legacy bookmark and chooses the next cartridge via its UUID link. Full production migration, real user browser datasets, and Safari/offline deployment cutover are separate gates.
