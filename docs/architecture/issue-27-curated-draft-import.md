# Issue #27 Phase 2C — Guarded curated private draft import

Status: **Draft only**. No production or live Neon SQL writes. Stacked on Draft #87 → #86 → #85 → #84 → #83.

## The precise storage contract

The curated pixel-v1 games already exist as reviewed public static cartridges. They are rebuilt from reviewed source, compared byte-for-byte with their legacy public bundles and independently SHA-256 pinned to immutable revision UUIDs. The importer also requires that content-addressed static copies exist and match the same compressed bytes.

The storage reference syntax for this one exception is:

    static-public-v1:/cartridges/by-sha256/<SHA256>.slop

This is an internal static locator, **not** a Neon Storage bucket or signed URL. It must never be treated as an arbitrary executable script URL. Future private creator builds use separately authorized private storage. V1 revision content_digest equals its compressed artifact SHA-256; V2 may use a logical-content digest distinct from the compressed artifact checksum.

## Preparation: strictly read-only with respect to the database

After installing project dependencies, run:

    pnpm cartridge:build
    pnpm cartridge:attest
    pnpm cartridge:immutable
    pnpm curated:import:plan
    pnpm curated:import:sql > curated-private-drafts.sql

These commands only build/verify local files and produce a plan or reviewable SQL. They **never execute database writes or connect to Neon**. The generated SQL must not be committed as a production migration.

## Hard preconditions for any live import

1. Independently verify the target database and apply checked-in additive migration 003 through its checksum-tracked migrator, after a backup/rehearsal. In this PR, real Neon Development still has only migrations 001 and 002.
2. Independently verify the exact SHA-addressed static bytes are deployed and readable at the approved destination.
3. Obtain explicit permission for the target database write.
4. Review the SQL, the seeded system curator, all three UUIDs, private draft statuses and no current published revision.

## Import guarantees

The emitted SQL is one PostgreSQL transaction with a transaction-level advisory lock and timeouts. For each of the three attested fixtures it locks and verifies original system ownership, legacy slug, private/draft status and absence of a published revision. It inserts exactly one immutable revision with revision_number 1 and release_version NULL (do not invent display SemVer); the manifest, engine, byte size, digest and static locator are actual reviewed evidence. Exactly one bundle artifact with matching compressed SHA-256 is attached.

For idempotence, conflict-on-existing-ID never overwrites a revision and conflict-on-existing-artifact never overwrites an artifact; the SQL *verifies* all existing fields and rejects unexpected extra artifacts. Any mismatch or failed precondition rolls back the entire transaction, including inserts attempted for earlier games. It never touches visibility, publication pointer, user library, private access grants, game execution, uploads or saves.

These curated DB rows intentionally remain private drafts even though the three older legacy cartridges were already distributed publicly. The DB public discovery API continues to return no such private draft rows.

## Verified test/rollout gates

The disposable PostgreSQL suite checks migration 001→002→003 and its rollback, then runs the exact generated import SQL twice, proves stable artifact UUIDs and all three retained private, checks a failed import during the second game leaves zero partially inserted rows, and checks extra artifact conflicts. All existing security, real-browser game/Creator, Next.js HTTP and offline PWA regressions continue to run.

No live Neon schema migration or import is performed by this PR. Live migration and execution must be separately authorized and verified. Rollback must be scoped to these exact imported UUIDs after checking foreign key dependents; never broadly delete users' files/installations, and never casually reverse migration 003 after real installation records exist.

After this gate: positive Neon-backed metadata acceptance, private Library membership and a validated SHA-pinned offline update protocol. Do not expose unsafe runtime code or autolink guest saves.
