# ADR-006 — Game save management and optional persistence

Status: accepted product direction (owner approved); incremental implementation under [#36](https://github.com/MohamedXIV/slopboy/issues/36), not a claim that all features ship in the contract slice.

## Capability contract
New reviewed manifests may declare `saveCapabilities: { mode, schemaVersion }`. Modes: none (no persistence), persistent-data (settings/unlockables/high scores, never progress slots), auto, manual, manual-and-auto. Schema is mandatory for all save-enabled modes and forbidden for none. Legacy saveSchemaVersion must agree if also supplied. Missing capability remains unknown/legacy; it never implies manual capture. Do not infer capabilities from genre. Existing immutable pixel-v1 bundles are not rewritten: reviewed game+revision UUID pairs identify Tiny Catcher and Star Patrol as none and Circuit Slide as auto/schema 1. These classifications do not erase historical records.

## Slots, snapshots and current session
A stable UUID slot represents a playthrough of a game (not a revision). It has a renameable label, active local session identity and an autosave head plus immutable, individually renameable manual snapshots. Selecting/loading is explicit; a snapshot load must preserve the old head or fork a slot, never silently overwrite. New manual capture requires an adapter/game serialization hook and confirmed host persistence of the actual current state; copying the last autosave is a backup, not manual capture. Auto writes target the session's bound slot, not a mutable global selection. Fence stale messages across restart/slot switch and serialize IndexedDB changes transactionally across tabs. Keep guest/offline progress; no deletion of legacy v1/v2 keys or local snapshot records during migration. Unknown/corrupt legacy metadata is not stamped with invented version or date.

## Compatibility
Keep immutable game UUID, revision UUID, release label (nullable for legacy), hardware/profile, explicit save schema version, snapshot ID, kind, bytes/digest, timestamps and user labels. Release label is presentation; matching schema and game/device identity permits load only when adapter policy supports it. Different known schema is incompatible unless a separately implemented, reviewed migration exists. Missing provenance is unknown. A migration copies to a new record and retains original bytes; never advertise a migration before implementation. Preserve old revision references.

## Player experience
Use existing HeroUI controls in a save manager on the play page and fullscreen/pause overlay. Display active slot and save status, name, type, time, game release/revision, compatibility; create/select/rename, manual capture only when supported, auto status, and explicit restore/fork. None/persistent-data games do not show progress save/load controls. Persistent data is not a progress snapshot or authoritative achievement/currency. Keep historical data recoverable even if a new revision disables progress saves. Library remains a secondary management entry point.

## Cloud and rollout
Existing migration 008 and private objects stay unchanged until additive slot/snapshot metadata migration and verified access/reconciliation are implemented. Local is primary, cloud opt-in, no upload per frame. Acknowledged server write only earns synced status; list/restore validate owner, exact digest and size. Conflicts: keep local, restore cloud, keep both, cancel. No automatic clobber; distinguish offline, pending, synced, failed and conflict. Preserve the existing admin QA gate, quota enforcement, request bounds, origin checks, rate-limit/reconciliation and two-account/multidevice acceptance before widening access. Local limits are operational policies, not fictional hardware capacities.

## Ordered implementation
1. Validated capabilities and compatibility contract (this slice); review fixed legacy metadata without repacking released bytes.
2. Atomic local slot/snapshot store, migration/recovery tests and session binding.
3. In-game HeroUI manager and supported serialize/restore lifecycle; retain legacy recovery; enforce capability in host and cloud eligibility.
4. Version provenance and explicit compatibility UX; adapter-specific migration only when proven.
5. Additive cloud metadata, private restore and conflict handling, reconciliation and hosted A/B/offline acceptance.
6. Publish creator SDK and maintained AI guide only for implemented/approved capabilities.

## Local storage foundation slice

The new host-only `save-slots` module uses one versioned record per game UUID and hardware version (not revision/schema), with atomic IndexedDB read-modify-write, a fenced session token, one replaceable autosave head, immutable manual/backup/fork snapshots, user labels and SHA-256 provenance. Opening a prior snapshot forks; same-schema revision changes are allowed, unknown legacy provenance is retained but not auto-loaded. A one-time opt-in import copies the old schema-1 autosave without altering its bytes; numbered legacy backups remain available through the existing UI until their dedicated migration. New host operational policies: 256 KiB per payload and 10 MiB encoded record per game/device, 80-character labels; quota errors preserve existing data, no silent eviction. This is a deliberately bounded record design; measure IndexedDB write amplification before wider use. No gameplay integration or UI change in this slice. Adapter capture and restore acknowledgment, browser transaction tests, historical backup migration and cloud synchronization remain follow-up acceptance.

## First player integration

Reviewed Circuit Slide (autosave only) uses named local slots, active slot label, rename, backup and load-as-new-playthrough in a HeroUI manager within the stage, including fullscreen. Existing single autosaves continue on their original lane until a player selects/creates a named playthrough; the player may return to the legacy lane. Fresh Circuit Slide games use a named playthrough. The sandbox flush barrier drains earlier worker save messages and waits for IndexedDB confirmation before an explicit slot switch/restart; failed writes cancel the action. Known no-save fixtures ignore progress save requests and show no save manager. Unknown legacy adapters remain on their established compatibility path. Current release labels are unknown for these fixtures, so the UI shows revision identity without inventing version numbers. Existing cloud endpoints and numbered legacy backups remain separate, explicitly labelled as legacy; cloud sync and true manual capture are not implemented by this slice. Browser smoke tests exercise named slot creation and autosave acknowledgment.

## Live manual capture protocol

For a newly reviewed, immutable digest-addressed pixel-v1 cartridge, the validated optional `saveCapabilities` declaration may enable manual or manual-and-auto saves. The SDK `GameModule.serialize(ctx): string` hook synchronously returns current state; `init(ctx)` restores `ctx.storage.load()`. The worker requires both hooks for manual mode and serializes only after prior ticks, behind the opaque iframe's private message channel. Host requests are correlated, bounded and timed out, and the player commits a named snapshot only after capture and atomic storage acknowledgment. No write/erase through storage during capture. Manual-only ignores automatic progress writes. Existing curated revisions retain their exact reviewed policy and bytes; no published fixture is upgraded by this PR. Disposable browser fixture tests current state changes, IndexedDB persistence and reload restore. KAPLAY/Phaser manual capture and production release of a compatible game remain separate; do not advertise an unsupported adapter. Cloud remains unchanged.

## Named cloud snapshot transport

The cloud transport is implemented separately from gameplay and account authorization: canonical named snapshot export, inner digest verification, strict identity/schema metadata, conservative conflict comparison, and atomic import as a new local playthrough without activation. The server storage adapter now supports bounded verified reads. Legacy raw backups and existing tables are unchanged. Remote account metadata, API and in-player cloud actions remain separate follow-up work; do not present this contract as live sync.

## Named cloud metadata foundation

Migration 009 separates legacy and named snapshot metadata, while sharing the account byte quota and lock. Restricted admin-QA functions reserve, list, confirm and resolve private ready objects; no payload is stored in PostgreSQL. Retain pending named records for future reconciliation, and refuse destructive rollback with retained records. This is SQL groundwork only; authorized web routes, grants, hosted migration, conflict UI and real storage acceptance remain separate.
