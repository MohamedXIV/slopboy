# Private staged artifacts

Issue #31 adds a project revision store alongside the single-file source history
from #106. From Manage → Private project files, a verified owner selects source
modules and assets for an existing private draft. The server declares a pinned
KAPLAY manifest, reserves capacity, and assigns a UUID. Upload each file as raw
bytes. Finalization atomically verifies completeness, records the audit event,
and turns that UUID into an immutable source-and-asset revision. Managed
single-file revisions and public catalog revision IDs keep their existing
meaning. No runtime consumes these project revisions.

## Storage and limits

The [Neon storage documentation](https://neon.com/docs/storage/overview) was
reviewed first. The project API returned 401 from this workspace, so the
project's object-storage entitlement, bucket configuration and project-specific
cost are unverified. This implementation uses the existing private PostgreSQL
service, storing bounded bytea objects in a table available through a small
storage adapter. Setup needs no bucket, paid plan, or public URL. PostgreSQL
bytes, indexes, WAL, backups and read/write compute still count toward the
existing plan. Re-evaluate capacity before enabling broadly. Run dedicated
object-storage trials only on an authorized development project.

Each project accepts 1–16 files and at most 2 MiB in total. Source modules are
bounded to 64 KiB and media to 512 KiB each. The default per-account storage cap
is 16 MiB, including retained revisions and active reservations, with a maximum
of 64 project records per account. The operator can set
`STAGED_ARTIFACT_QUOTA_BYTES` up to 64 MiB. These are service quotas.

The manifest requires exactly one `src/game.ts` or `src/game.js` entrypoint.
Other modules must be declared under `src/`; relative imports name a declared
sibling explicitly with its extension. Assets use `assets/` and the PNG, JPEG
(`.jpg`) or WAV allowlist. Requests use canonical lowercase flat paths; archive,
SVG, HTML and remote URL ingestion are unavailable. Media checks combine a
declared extension/MIME, exact byte count, signature/header checks, and SHA-256.
They do not decode or sanitize media. Source goes through the pinned static
template checks and remains untrusted. These checks give no playback permission.

## API

Base path `/api/manage/games/{gameId}/staged-artifacts` uses verified Slopboy
sessions and owner-only SQL. All writes additionally require same-origin
metadata.

| Request | Result |
| --- | --- |
| POST base with `{key, manifest:{files:[{path,mime,bytes,sha256}]}}` | Reserve capacity and return stage, server manifest and upload tickets |
| GET base | List this game's finalized revisions and active staging records |
| GET `?project={id}` | Inspect metadata and renew per-file tickets |
| PUT `?project={id}&file={path}` | Store exact raw bytes with declared Content-Type and `X-Slopboy-Artifact-Ticket` |
| POST `?project={id}` | Finalize when all verified files are present |
| GET `?project={id}&file={path}` | Download a finalized object with a valid read ticket |

Tickets are signed and bound to actor, stage, path, verb and a five-minute
window. They require the existing verified session and travel in headers,
never URLs. Downloads are private, no-store attachments with nosniff.
Caller-supplied hashes are recomputed by the server and by PostgreSQL.
An actor lock makes capacity reservation, writes and finalization race-safe.
Retrying reservation with the same UUID and canonical manifest reuses its
stage while retained. Different manifests conflict. Identical file replay
is safe during staging. Finalization retries return the same revision ID.

Abandoned stages expire after 30 minutes. An owner's next initiation deletes
their expired stages and releases capacity. For inactive owners an operator
can run a bounded maintenance query with the migration role:

```sql
DELETE FROM public.staged_game_projects WHERE id IN (
  SELECT id FROM public.staged_game_projects
  WHERE finalized_at IS NULL AND expires_at <= clock_timestamp()
  ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED
) AND finalized_at IS NULL AND expires_at <= clock_timestamp();
```

## Dev enablement and rollback

1. Use disposable PostgreSQL or an isolated Neon dev branch. Confirm the database
   identity and existing migration ledger through 005. Run the existing
   checksum-tracked migrator up to 006. Keep the function owner a trusted
   migration role; the runtime role must not own the function or tables.
2. Grant only `EXECUTE ON FUNCTION
   public.staged_game_artifact(uuid,uuid,uuid,text,jsonb,bytea)` to the verified
   restricted Preview application role. PUBLIC has no EXECUTE. Give the app
   no grants on either staged table. The narrowly scoped definer function uses
   a pinned search path, verifies the owner and locks the draft. The trusted
   server resolves actor identity; direct SQL access to the app role must
   remain private.
3. Scope `STAGED_ARTIFACTS_ENABLED=1` and a fresh, independently generated
   `STAGED_ARTIFACT_TICKET_SECRET` of at least 32 bytes to the tested Preview
   branch. Use the existing dev database and managed Auth variables. Redeploy
   the Preview and exercise two verified accounts end to end. Rotation of the
   secret invalidates outstanding tickets; users can renew them.
4. Disable the Preview flag and redeploy to stop accepting requests. Export
   retained projects and files to approved private storage before rolling
   down 006. Down drops those objects and leaves all 005 records untouched.

Hosted rollout, actual Neon object storage, executable builds, game preview,
publication, friend sharing and MCP writes are separate.
