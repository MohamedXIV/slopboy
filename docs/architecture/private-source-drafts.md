# Private source drafts

From Dashboard → My Games → New Game, a verified account can select the pinned
KAPLAY source template, paste a single TypeScript or JavaScript module, run
server checks and save. The dashboard lists the private game, and Manage shows
its latest stored source, revision UUID and SHA-256. A source edit appends a new
immutable revision. Earlier migration 004 source remains readable and marked
unvalidated until a validated edit is saved.

KAPLAY is experimental for execution. This workflow checks syntax, source limits,
module references and the template contract. Source checks do not establish that
a module is safe or buildable. Source is neither compiled nor run. Publication,
private preview and multi-file/object-storage uploads remain separate gates.

PostgreSQL stores the bounded source as durable text under the existing private
owner/admin access rules. Creation, immutable source, quota enforcement and
audit are atomic. The service accepts up to 64 KiB per revision, 20 stored
revisions per rolling hour and 1 MiB of retained source per human actor. The
actor-scoped transaction lock serializes requests and checks the idempotency key
before quota accounting. The same payload and key replay the original result.
Using the key for a different payload returns a conflict. A missing database or
schema prevents saving. Validation by itself does not write to the database.

Apply migration 005 through the normal checksum-tracked migration process after
environment approval. It adds nullable columns and indexes to the existing draft
table and keeps historical rows and IDs intact. For an existing restricted app
role, extend the existing source table SELECT and INSERT column grants to
`engine_manifest`, `source_digest`, `request_key` and `request_digest`, and grant
EXECUTE on the exact `public.save_validated_source` signature in migration 005.
The function runs with caller privileges. It uses the existing game SELECT,
INSERT and metadata UPDATE permission (for the ownership row lock), and existing
audit INSERT permission. Verify all grants in an isolated environment first.
Rollback keeps game and source UUIDs and source text, but drops validation
metadata and idempotency history. Export those fields first if they are needed.
Disable the new source UI before rolling its schema back.

The repository tests exercise the SQL using disposable PostgreSQL. Real hosted
Neon Auth sessions, restricted deployment credentials and preview hosting still
need explicit acceptance before release.
