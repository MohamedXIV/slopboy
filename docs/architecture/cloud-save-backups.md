# Cloud save backups — #36 (Draft PR #116)

The local IndexedDB autosave remains the primary offline save. The Library offers opt-in backup/list for a verified, activated account and published playable games. No restore, conflict resolution, automatic sync or local overwrite in this slice.

## Design: private objects and metadata-only SQL

Migration 008 holds **metadata only**: verified account, game UUID, pinned hardware/save schema, digest, bytes, private storage key and pending/ready state. No save content is stored in PostgreSQL. Next.js Node server uploads private bytes to the dedicated Neon dev bucket `slopboy-cloud-backups-dev` under `backups/<account>/<game>/<backup>/<digest>.json`. The server checks the exact key/owner/game/digest contract; storage credentials stay server-only.

Neon credentials support branch-wide `storage:write`, **not** provider-enforced object-key prefix permissions. Owner explicitly approved this trade-off for a dedicated private dev bucket with application-enforced prefix. Never hand S3 credentials to the browser, or expose a presigned object URL without a fresh authorization check.

## Upload protocol

1. Verify identity/profile, Origin, UUID, playable eligibility, payload encoding and size.
2. Reserve a pending metadata row transactionally under the account advisory lock. Enforce 256 KiB/backup, 5 revisions/game, 10 MiB/account including pending reservations, unique SHA-256 per account/game.
3. Conditional private S3 PUT with `If-None-Match: *`; read the object back and confirm exact bytes and SHA-256.
4. Confirm metadata only after readback. Return `stored` and HTTP 201 only after backend acknowledgment. A confirmed digest replay is HTTP 200.
5. If confirmation throws, retry confirmation once (idempotent) without repeating the upload. If it remains ambiguous, return unavailable without deleting the object or releasing its reservation. A committed confirmation may have lost its response; deleting bytes here would corrupt a ready backup. Failed or interrupted requests may leave pending metadata/orphan objects. Pending rows older than 15 minutes are released on the next reservation. An audited reconciliation job, with safe fencing against in-flight writes and quota-abuse safeguards, remains a broad-rollout gate.

**FAIL CLOSED:** both `CLOUD_SAVE_BACKUPS_ENABLED=1` and `CLOUD_SAVE_CONDITIONAL_PUT_VERIFIED=1` must be explicitly set, together with a verified private bucket and server-only `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Do **not** set the verification flag until a live provider test proves first conditional PUT creates the object, second PUT to the same key fails (412), original bytes stay intact and unauthenticated GET is denied. Live provider evidence on 2026-11-24: [Vercel Sandbox presigned-request probe](https://github.com/MohamedXIV/slopboy/pull/116#issuecomment-7125901303) returned 200, 412, original GET 200, anonymous GET 403; probe removed. The separate header-signed app adapter and hosted account/browser behavior still require validation. CI is not proof of either.

## Schema rollout and test plan

The original 008 storing payload text must NEVER be run on hosted dev. The revised 008 keeps metadata only. Apply merged 007 (trusted fixture jobs) first if missing in `schema_migrations`; use the exact file checksum when recording 008. Do not enable backup flags until the S3 gate is verified and server credentials are scoped to **dev**.

Test on a disposable Postgres instance and a non-production Neon branch; verify SQL auth/quotas and no payload column. Hosted QA after activation: account A uploads, second browser account A lists it, account B and guests cannot list/read it, direct anonymous S3 GET denied, offline IndexedDB still works and there is no automatic sync.

Safe rollback: disable both feature flags. Down migration removes metadata and should never run against retained hosted saves without explicit data-retention and object-deletion approval.
