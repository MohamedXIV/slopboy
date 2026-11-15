# Issue #27 — Foundational game versions, installations and save compatibility

**Status:** Additive proposal in Draft PR #87, stacked on Draft #86 → #85 → #84 → #83. Not in production. No Neon Development writes have been made.

## Identity and version layers

| Concern | Identifier / field | Contract |
| --- | --- | --- |
| Game | `games.id` | Immutable UUID used by URLs, library membership and save namespace. Title is editable. |
| Revision | `game_revisions.id`, `game_id` | Immutable build UUID belonging to exactly one game; `revision_number` is a unique, positive internal sequence for the game. |
| Display release version | `game_revisions.release_version` | Optional canonical SemVer string (example `1.1.0-beta.1`), unique per game when present; never confuse with engine version. Legacy revision rows can be NULL rather than fabricate a release label. |
| Engine | `engine_id`, `engine_version` | Pinned runtime/framework compatibility, independent of release version. |
| Content | `game_revisions.content_digest` | SHA-256 of the revision's defined logical content. For v2 packages this need **not equal** SHA-256 of compressed .slop bytes. |
| File | `cartridge_artifacts.id`, `revision_id`, `sha256`, `storage_key` | SHA-256 of the **actual artifact bytes**, immutable storage reference. Can be one bundle or multiple assets. |
| Published selection | `games.current_published_revision_id` | Optional pointer to a revision belonging to this same game, enforced by a composite database FK. Visibility still requires both published game and published revision in API predicates. |

`003_versioned_installations.up.sql` is additive to historical migrations 001 and 002; never edit their content or checksums. It introduces a same-game composite FK; rejects changing an existing revision's release/build identity, content, storage reference or original timestamps; and rejects editing already-registered artifact payload metadata. Status can change through the review process. **A new build means a new revision UUID and a new content digest**, not updating the previous row. Retained revisions and artifacts enable approved rollback.

## Library membership is not a physical installation

`user_library(user_id,game_id)` means a signed-in user added the *game*, not one release. Its old `installed_offline` boolean is retained for compatibility but is explicitly deprecated as an installation authority: a user may have multiple devices, and a browser may clear its caches.

New `user_installations` records `(user_id,device_id,game_id,revision_id,artifact_id)`, one game per device. Composite foreign keys require a matching library membership, revision under that game, and an artifact under that revision. A random per-device UUID is **not** a fingerprint or an authorization credential. The account record is a non-authoritative sync mirror and cannot prove a physically cached game. Browser CacheStorage plus locally verified cartridge bytes are authoritative for offline availability; anonymous/guest installations stay local and are never auto-linked to an account.

Current Service Worker already indexes installed game + revision ID locally but does not yet implement the complete per-revision digest-pinned upgrade/rollback protocol. **Do not wire the new table into the frontend as a claimed completed cloud-install feature.** Later work must verify the downloaded artifact SHA-256, retain previous bundle until the replacement is fully fetched and verified, track installed immutable version-specific path, and only then atomically switch active pointers. Never cache private auth responses or user drafts.

## Save schema must not follow revision numbers

A release can update `revisionId` while keeping the same save format. `saveSchemaVersion` is an optional integer (1–9999) in v2 manifests and in the host-owned save service; omission means 1, preserving the historical `save-v2:<device>@<version>:<game UUID>` key and envelope exactly.

If a later **incompatible** release declares schema 2, the save store uses a separate `:schema-2` lane. Reading/writing/deleting schema 2 never overwrites/deletes schema 1. Old slug-to-UUID migrations are allowed only in schema 1. Rolling back to an older revision on schema 1 preserves its old save. Cross-schema migration is **not automatic**; a future reviewed migrator needs copy-if-absent behavior, backups, explicit preview/conflict handling and user consent. Note the hardware version is still part of the key: device profile/firmware migrations also require deliberate compatibility support.

The new manifest flag is a declaration, not a sandbox permission. Only trusted host code controls IndexedDB. No unreviewed code execution or cloud save linking is introduced here.

## Acceptance tests

The ephemeral PostgreSQL migration suite must verify:
- 001 → 002 → 003 fresh install, repeated-up no-op and checksum safety; 003 → 002 rollback, then full rollback, followed by replay.
- Release version uniqueness/format and prohibition on mutating immutable revision/artifact bytes.
- Rejection of a published pointer to a *different* game's revision.
- Rejection of a device installation whose revision/game or artifact/revision differ, whose library membership is missing, or whose device/game tuple is duplicated; support separate records for two devices.
- A cache-independent local save schema lane test: old values and tombstones survive incompatible-format updates and rollback.

These tests use a disposable CI PostgreSQL server. Neon Development remains unchanged until an explicit, separately gated migration/import; validate existing data and add snapshots before any real down-migration. Production `main` and all stacked PR heads stay untouched.

## Next concrete integration gates

1. Revalidate migration 003 on a non-production migration rehearsal using exact schema data and the full Node/Chromium/offline CI suite.
2. Build a **content-addressed** and byte-verified update path in the Service Worker, then represent installed revision offline per device. Only show a successful install after CacheStorage acknowledges it.
3. Implement an authorized server API for optional `user_installations` sync with per-user ownership and a device random ID. Server metadata is not proof of local storage.
4. Implement the guarded, idempotent *draft-only* database import for three curated revisions/artifacts from PR #85/#86, using real SHA-256 and static reviewed references; no public status until a separate approval.
5. Roll out reviewed DB catalog/library and explicit update/rollback/Save migration UX, preserving guest/offline compatibility.
