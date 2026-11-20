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

## Dev migration 005 and Preview

The integration uses Neon project `slopboy-dev` (`super-scene-57459190`),
branch `main` (`br-still-cell-bagkrhn2`), database `slopboy_dev`.
In [Neon Console](https://console.neon.tech/app/projects/super-scene-57459190),
select that branch and choose **Connect**. Select an authorized migration role
and **Direct connection**. Configure it privately in a local libpq service
called `slopboy-dev-migration`. Use the dev branch connection, including TLS.
A Preview application role should never have migration rights.

Before applying, confirm the branch and database in the console, then inspect
`public.schema_migrations` and `public.game_source_drafts`. Stop if migration
001–004 checksums differ from the repository, ledger entries are missing, or
there is a partial 005. From the integration checkout, the repository migrator
validates prior checksums and commits the migration together with its ledger row.

```sh
PGSERVICE=slopboy-dev-migration node --experimental-strip-types --input-type=module <<'JS'
import {executePsql, migrateUp} from './packages/database/src/migrator.ts';
import assert from 'node:assert/strict';
assert.equal((await executePsql({}, {sql: 'SELECT current_database()'})).stdout.trim(), 'slopboy_dev');
const ledger = await executePsql({}, {sql: 'SELECT version FROM public.schema_migrations ORDER BY version'});
assert.deepEqual(ledger.stdout.trim().split('\n').slice(0, 4), ['1', '2', '3', '4']);
console.log(await migrateUp({}, 'packages/database/migrations', 5));
JS
```

The migration adds nullable columns and indexes, preserving existing rows and
UUIDs. Resolve the role actually used by the new Preview's dev connection with
`SELECT current_user`. With the migration role, grant the following to that
restricted role, using a safely quoted psql identifier variable named
`app_role`. The function has invoker rights and expects the application to
supply the verified actor. Keep its default `PUBLIC` execution revoked.

```sql
GRANT SELECT(id,game_id,created_by,created_at,language,source_text,
  engine_manifest,source_digest,request_key,request_digest),
  INSERT(id,game_id,created_by,language,source_text,engine_manifest,
  source_digest,request_key,request_digest)
  ON public.game_source_drafts TO :"app_role";
GRANT EXECUTE ON FUNCTION
  public.save_validated_source(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text)
  TO :"app_role";
```

The actual role also needs its existing usage on `public`, actor role lookup,
game metadata SELECT and INSERT, one permitted game metadata UPDATE column
for the row lock, and audit INSERT. Check the permissions in the disposable
database before adding or changing grants in Neon. Verify the 005 checksum,
function and grants on the dev connection. Confirm that the Preview role
cannot update or delete source revisions, and that it cannot update user roles.

In [Vercel project settings](https://vercel.com/mxiv/slopboy/settings/environment-variables),
add `DATABASE_URL`, `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` under
**Preview** scoped to `integrate/104-manual-ai-private-drafts`. Use only
dev credentials and keep the restricted application role distinct from the
migration role. In Neon Auth → **Trusted Domains** for the same dev branch,
add the exact HTTPS branch Preview origin. Redeploy that Preview and verify
`/api/auth/get-session`, the owner and foreign-account route behavior, and
save → history → restore with real verified test accounts. Keep source, secrets
and session data out of shared logs and screenshots.

Rollback starts by disabling or disconnecting the integration Preview. Migration
005 down keeps game/source UUIDs and source text but drops validation metadata
and idempotency history. Export those fields to approved private storage if
needed, then use the repository's checksum-tracked `migrateDown` to 004.
Migration 005 and the Preview grants are tested in disposable PostgreSQL.
Hosted Neon state and authenticated Preview acceptance require separate evidence.
