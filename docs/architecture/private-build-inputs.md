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
