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

## Implemented in V2 experimental branch (2026-11-07)

- `/v2/library` lists the actual curated cartridges with deterministic seeded procedural cover graphics. Current library is **available-to-play curated games**, not a falsely claimed authenticated collection of owned purchases.
- Player header now opens Library instead of displaying every game. Existing `/v2/play/[game]` routes continue to work unchanged.
- Game launch count, last played and foreground active duration persist guest-locally. No guessed story-completion percentages; the arcade titles show “Not tracked”.
- Users can create, view, restore and delete up to five **local** save snapshots per game via the existing IndexedDB host save driver; restore requires confirmation. No cloud network requests are made.
- V2 shell, library and device showroom now share locally saved dark/light display preferences. On phones the device FX settings use HeroUI Drawer rather than forcing the user to scroll past the game.
- Current CSS cartridge insertion and boot animations are **visual-first**; real user-controlled physical shutdown and an engine lifecycle contract are future gates. The animation must never claim that a cloud backup is complete.

QA evidence: https://github.com/MohamedXIV/slopboy/actions/runs/42372481719 — TypeScript, lint, static export, real Chromium device/sandbox/mobile Drawer/library regression and KAPLAY spike passed.
