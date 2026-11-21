# Private build inputs (Issue #32)

The first build-service boundary accepts an exact immutable revision ID. It uses
the verified owner and private draft status, then normalizes the stored engine
manifest and its path, MIME, byte count and SHA-256 for each file. A validated
single-file revision from #106 and a finalized project from #107 use the same
descriptor. Legacy source without a validated manifest, unfinalized uploads,
foreign drafts and unsupported engine versions cannot be prepared.

An owner can request
`GET /api/manage/games/{gameId}/build-input?kind=source|project&revision={revisionId}`.
The response contains private metadata, an `inputDigest` and the explicit
`blocked_by_adapter` state. It carries no source bytes, storage URLs, build job
or preview link. Requests have no side effects. Project inputs require the
existing staging feature to be enabled. Single-file inputs reuse existing
database read grants. There is no migration.

The v1 digest hashes the ASCII domain string `slopboy-build-input-v1` followed
by a NUL and UTF-8 canonical JSON. The object keys are constructed in a fixed
order and file paths sorted by code unit. It tracks normalized content and
engine/device settings, separately from user authorization and revision ID.
It is an input receipt, not an artifact digest or reproducibility claim. A
future worker must re-check owner/job eligibility, resolve the exact revision,
re-hash actual bytes, verify an approved adapter and immutable toolchain, and
run within an independently verified isolation boundary before reporting ready.

The KAPLAY adapter (#45) and sandbox work (#4/#33) are open gates. Future #32 work
still needs a protected worker, resource/time limits, durable asynchronous
job states, reproducible outputs and authorized preview. These are outside this
initial read-only slice. Roll back by removing the route and descriptor.

## Disposable fixture build jobs

Migration 007 introduces a fixture-only queue with no web-role grants or
player revision references. Run it against disposable PostgreSQL. The worker
selects a fixed repo-owned test script and packages a small text fixture into
a deterministic gzip artifact for the installed Node/zlib version. The
PostgreSQL artifact SHA-256 is generated from the bytes. A ready fixture job
confirms that the bytes were stored. It grants no game execution privileges.

Enqueue uses a caller-supplied UUID as the idempotency key. Repeated enqueue
returns the same row, including after completion. Concurrent claims use
`SKIP LOCKED`. Every attempt has a fresh lease with a 30-second deadline.
A previous worker cannot finish a job after its lease expires or is replaced.
On timeout, crash, or oversize output the worker retries up to three attempts.
If the last worker disappears, the next claim marks its job failed with
`LEASE_EXPIRED`. Completion and digest publication use a single update.

Create a database named `slopboy_build_fixture` in a disposable PostgreSQL
cluster. Set `PGHOST` to that cluster's Unix socket directory, `PGPORT` to its
port, and `PGUSER` to the disposable role. Apply existing migrations with
the checksum-tracked migrator:

```sh
node --experimental-strip-types --input-type=module <<'JS'
import {migrateUp} from './packages/database/src/migrator.ts';
console.log(await migrateUp({database:'slopboy_build_fixture'},'packages/database/migrations',7));
JS
```

Use a new UUID for `enqueue`, run `work` once per processing attempt, then
check `status` with the same UUID. For example:

```sh
fixture_key=$(node -p 'crypto.randomUUID()')
node --experimental-strip-types tools/fixture-build-cli.ts enqueue "$fixture_key"
node --experimental-strip-types tools/fixture-build-cli.ts work
node --experimental-strip-types tools/fixture-build-cli.ts status "$fixture_key"
```

To remove the fixture queue, stop its CLI processes and roll back 007 with
the same migrator, targeting 006. This removes fixture job records and their
bytes only.

The fixture supervisor enforces wall-clock time and stdout bytes. It does not
sandbox source or enforce CPU, RAM or process limits. The measured Codex
Docker runtime has no cgroup driver and did not enforce the requested caps.
An independently verified runtime, adapter approval (#45) and preview
sandbox acceptance (#4/#33) remain required for player builds. The web
endpoint still reports `blocked_by_adapter`; no hosted migration or worker
setup is needed for this fixture verification.
