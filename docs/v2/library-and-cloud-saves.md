# Slopboy V2 — game library, progress and save policy

**Design status:** guest-first local implementation. Cloud account identity, storage provider and remote synchronization are **not implemented**. This page must never claim a cloud save succeeded before server confirmation.

## User library / play history
- The Library is the main game picker. Play routes remain `/v2/play/[game]`, so bookmarks and sharing keep working; the player header contains no carousel of all cartridges.
- Local library metadata tracks play launches, last played time and **foreground active play duration only**; idle/background intervals do not count.
- Story completion is **optional and game-authored data**, not guessed from playtime. Show e.g. “3/12 story milestones” only after a game publishes an appropriate milestone definition and the host records a verified player progress update. Arcade games without story metadata show “No story progress reported”.
- Procedural cover patterns use stable seeded identity values. Changing the game's title or cover style must not silently change its stable identity.

## Local save slots
- The legacy V1 compatibility game can auto-save in IndexedDB; user-visible local backups are additional snapshots in separate IndexedDB keys, each tagged by game and timestamp.
- Restoring a backup writes to the host's legitimate save slot; the next game launch consumes that save. Explicit confirmation required to overwrite the current autosave.
- Local backups are available to guests without account/network. Storage errors must never block gameplay.
- An IndexedDB backup is **not an off-device backup**: clearing site storage or losing the device may delete both local saves and snapshots.

## Cloud save design (provider-neutral; proposed free-tier protection)
- Cloud backend candidate: Supabase (Auth, Postgres metadata/RLS, private storage). Backend remains subject to provider/cost/security checks; no fake sign-in or “sync success”.
- **Proposed initial caps:** 10 MiB total stored save payload per account, 5 cloud revisions per game, 256 KiB maximum individual snapshot. These are storage/abuse policies, NOT virtual CPU/ROM/save hardware limits. Measure real traffic before changing caps.
- Identity: authenticated user subject ID, unique game/revision IDs, server-assigned timestamps, content SHA-256, opaque storage key. Client may never choose another user's `user_id`.
- Private-by-default RLS and signed short-lived URLs, no public bucket. Atomic quota reservations and server-side byte checks. Prevent replay and cross-user access. Backend must enforce aggregate quota and revision count transactionally.
- Conflict policy: **never silently replace a newer cloud or local revision**. Show timestamps/device labels and choices: Keep local, Restore cloud, Keep both (if quota permits), Cancel. Once enabled, sync only with explicit opted-in account.
- Library statistics remain private per account, except deliberately shared achievements later. Playtime and progress must not grant spendable coins or trusted achievements by themselves.
- Service disruption/offline: keep local autosaves working and queue only intentionally opted-in revisions; cloud status must say “Unavailable” until actual server acknowledgment.

## Future UX
A future V2 device can use a physical power button, animated removable cartridge and authentic boot process. Cosmetic entry/exit animation may not falsify game/runtime status or prevent basic controls; respect reduced motion and always allow clean bypass.
