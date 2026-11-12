# Issue #27 — curated cartridge byte attestation (Phase 2A)

**Branch:** `feat/27-curated-revision-attestation`, based on Draft PR #84, which is stacked on Auth Draft PR #83. This slice must **not** be merged into `main` independently.

## Scope

`tools/attest-curated-revisions.ts` generates an exact-byte SHA-256 evidence record for the three *existing reviewed* pixel-v1 cartridges. For each immutable catalog UUID and revision UUID it records:

- The actual manifest validated against the curated source and device controls.
- Engine `pixel-v1`, hardware profile, revision number 1 and system-curator identity.
- SHA-256 of the compressed `.slop` **bytes**, compressed byte length and one bundle-artifact descriptor.
- Existing static `/cartridges/<legacy-slug>.slop` path, clearly labeled as **not** an object-storage key.
- Intended initial revision status `draft` — the evidence is **not** independent publication approval.

The CLI **requires an on-disk bundle to match a deterministic rebuild** from the approved source and manifest; it refuses substituted bytes. A second independent check locks each immutable revision UUID to the exact previously reviewed SHA-256 and byte size in `packages/catalog/curated-revision-lock.json`. A compiled-code change must introduce a new reviewed revision ID rather than silently replacing an old one. `pnpm build` now runs `pnpm cartridge:attest` immediately after `pnpm cartridge:build`, before building the PWA. `pnpm cartridge:verify` remains an independent release check.

For machine-readable evidence after a successful cartridge build:

```bash
node --experimental-strip-types tools/attest-curated-revisions.ts --json
```

For CI/build logging, `pnpm cartridge:attest` prints one digest and size per reviewed release. Digest computation is local; no user-supplied code is executed and no cloud credentials are required.

## Release / database gate

This is **pre-import provenance verification only**. No new SQL migration, Neon data mutation, runtime discovery change, publication, storage object, or authenticated/user library change is implied. Neon Development's curated `games` rows stay private drafts and `game_revisions` and `cartridge_artifacts` stay untouched until a subsequent **explicitly reviewed import** can prove the artifact is durably addressable and immutable.

The current statically bundled paths are backwards-compatible but **not version-addressed storage**: they must never be treated as immutable cloud object keys or as sufficient evidence for public DB publication. A subsequent import must validate the exact on-disk hashes against approved immutable objects, bind them to the existing revision IDs, add draft-only metadata idempotently, and then establish an independent review/publication gate.

## Verification and rollback

- `tests/curated-revision-attestation.test.ts` covers deterministic SHA-256, UUIDs, display title independence, source path/manifest checks, substituted on-disk cartridge rejection and refusal to mutate a pinned revision's compiled code.
- Normal CI continues to cover offline/guest saves, playback, browser isolation and Auth/database regressions.
- Rollback: revert only this branch; no Neon schema/data, guest saves, PWA storage or Production environment changed.
