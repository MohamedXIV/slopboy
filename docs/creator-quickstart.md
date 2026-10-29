# Slopboy creator quickstart

The supported offline Creator Kit now has executable scaffolding, semantic TypeScript SDK checks and deterministic packaging. See the [complete Creator Kit guide](creator-kit.md).

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm creator:new my-first-game
pnpm creator:check my-first-game
pnpm creator:build my-first-game
pnpm creator:verify my-first-game
```

These commands do not run the creator's game code and **do not publish** it to Slopboy. A successful check means the source conforms to available technical screens, not that it is safe, rights-cleared or ready for publication. Third-party public uploads and preview remain disabled pending the browser security gate [#4](https://github.com/MohamedXIV/slopboy/issues/4).

**AI assistants:** Share the SDK and hardware contract with your model, have it edit only the new project's `manifest.json` and `src/game.ts`, then return the exact JSON diagnostics from `pnpm creator:check` for correction. This works without a paid AI API or an MCP connection. See `/create` on the web app for a copyable prompt.

Publishing remains maintainer-reviewed: only reviewed source may be moved into the curated `examples/` + `packages/catalog/` flow, with explicit content, license, and security checks. Do not upload arbitrary `.slop` code to the public platform.
