# Slopboy creator quickstart (manual path, **not public uploads**)

The project currently ships **curated**, locally validated cartridges only. This is a reproducible authoring guide for developers and AI assistants, **not an upload or publication endpoint**. Follow [security notes](p1-runtime-security.md); an accepted cartridge is not automatically safe or licensed.

## Steps

1. Inspect `packages/sdk/src/index.ts`, `packages/hardware/src/index.ts` and one existing game in `examples/`.
2. Create `examples/your-game/manifest.json` containing a unique `id`, `title`, a supported `hardware` ID/version, allowed `controls` and an `achievements` list (metadata only; no award system yet).
3. Put your game in `examples/your-game/src/game.ts`. Export a `GameModule` as default. Type-only `@slopboy/sdk` imports are supported; external runtime imports, browser APIs and unrestricted dependencies are not.
4. Run `pnpm test` to validate all curated games. You can use `node --experimental-strip-types tools/cartridge-cli.ts build <manifest> <game.ts> <output.slop>` to inspect a candidate package *without running its game code*.
5. Publication is restricted: a maintainer must inspect source, rights, content, behavior, technical budget and browser isolation. Only after approval can a maintainer add the new game descriptor to `packages/catalog/src/index.ts` and publish via `pnpm cartridge:build`.

The catalog is the **single source of truth** for approved game IDs, cartridge URLs, art metadata and build source paths. Do not add an arbitrary file browser, URL-based cartridge loader or user upload button: issue #4 has unresolved mobile and cross-browser security acceptance tests.

## AI prompt starter

> Create an original game for Slopboy 1000 using only the supplied `GameModule` SDK contract and versioned Hardware Profile. Return a `manifest.json` and a typed `src/game.ts`, with no runtime imports, DOM/network APIs or external assets. Keep every drawing operation within the 4-shade palette, and provide brief manual gameplay test steps. Do not claim that tests or achievements have passed unless verified.

## Publication gates

- The automated validator and deterministic build must pass.
- A human reviewer must inspect licensing/IP, age-appropriateness, controls, technical quality and security.
- Publishing a library game must **not** involve running arbitrary unreviewed submission scripts in a privileged CI workflow.
- MCP for ChatGPT/Claude, web uploads, creator identity and global coin grants are deferred.
