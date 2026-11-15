# Issue #27 Phase 2B — content-addressed delivery for reviewed curated games

**Branch:** `feat/27-curated-immutable-delivery`, stacked on Draft PR #85 → #84 → #83. Production and `main` stay unchanged.

## Why static, version-addressed artifacts?

The existing three reviewed pixel-v1 cartridges are **already public** and served from `/cartridges/<legacy-slug>.slop`; they are not newly submitted private game code. Their exact compiled compressed bytes are pinned to fixed game/revision UUIDs and SHA-256 digests in `packages/catalog/curated-revision-lock.json`.

Neon Development Storage is enabled but currently has **no object buckets**. Creating a private bucket for these three already-public bundles adds operational complexity without improving privacy. Future *private* creator uploads, unreleased build artifacts and cloud saves **must use authorized private object storage**; this static-delivery exception must not become the general upload pipeline.

## Delivery contract

`pnpm cartridge:build` continues to create the existing legacy paths without byte changes. After `pnpm cartridge:attest`, `pnpm cartridge:immutable` copies the verified bundles to:

```text
/cartridges/by-sha256/<sha256>.slop
```

The copies are built only from the allowlisted `GAMES` fixtures. Each asset's compressed bytes, SHA-256 and size are checked against the independent revision lock. Existing target files cannot be overwritten if their bytes differ; digest paths cannot be caller controlled. `pnpm cartridge:immutable-verify` is a read-only check.

For the three current reviewed releases:

| Game | Immutable revision UUID | SHA-256 | Size |
| --- | --- | --- | --- |
| Tiny Catcher | `107d59b4-03d5-4a29-be33-f8246a2c4caa` | `14000e495b8a7e16d6b20831812ecd943991d8987dac42982171018781634c33` | 579 B |
| Star Patrol | `38ecff6f-6b60-40d1-81ab-c07ad0dc928e` | `e0ff1bf21310de34ac49cf97dccbc927ed2e8d74b196c66a08e54540a7c47a6a` | 1094 B |
| Circuit Slide | `8b2c6f40-4684-4e6f-95d4-ce7cfca730f2` | `a96f3cf89dbefc9d0b4d6e4c51c72b44b73ba8a2370aaa7cba8f7fbb1fc5e5e7` | 1413 B |

**A content-addressed path is not, by itself, object-storage immutability.** The CI checks that every deployed SHA path responds with the exact same bytes as the reviewed alias through a live local Next.js HTTP server. Every subsequent deployment must retain these paths, and any new revision needs its own digest, UUID and independent review gate.

The new static path is *not* automatically returned to game execution, and the current runtime stays on the reviewed legacy paths. No private draft is exposed by adding this public-only delivery.

## Next acceptance gate

1. Verify the exact PR head in GitHub CI and a Vercel Preview, including the real Next HTTP route test of all three digest paths.
2. After confirming these URLs exist in the intended Preview, prepare an **idempotent, draft-only Neon Development import** for the three real revision UUIDs plus matching `cartridge_artifacts` rows. Explicitly encode a static vetted-asset storage scheme, not a fabricated Neon bucket name.
3. Check existing database rows and verify no conflict before any write. Keep `games.visibility = private`, `games.status = draft`, `game_revisions.status = draft` and `games.current_published_revision_id = NULL`.
4. Run read-only post-import verification before considering published revision status, catalog UI, private user libraries or any new user-authored execution. **Do not use these statically public URLs for private user submissions.**
5. Continue to require release approval before merges or Production promotion.

Rollback: revert the dedicated branch and its static digest-copy build step. Existing `/cartridges/<slug>.slop`, guest play, IndexedDB saves, offline install/remove and all Neon tables are untouched by this PR.
