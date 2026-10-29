# Slopboy (working title)

**Build tiny games. Play imaginary consoles.** 🎮

Slopboy is a zero-budget-first, community-created fantasy handheld gaming platform. Each fictional console has its own display, controls, audio capabilities, and enforceable game limits. Games are portable cartridges built with one TypeScript SDK by people or AI assistants.

> **Project status:** constitution and prototype planning. Slopboy is a codename, not a cleared brand. A first curated play prototype is in development; no public submissions or production service exists yet.

## Product pillars

- **Invented hardware, real constraints.** Consoles are not clones of Game Boy, PSP, or any commercial device.
- **Two play modes.** Interact with the complete handheld shell, or maximize the game display without stretching or changing aspect ratio.
- **One SDK, many creators.** Human developers, ChatGPT, Claude, and other assistants use the same build and validation contracts.
- **Player-friendly collection.** A single earned currency eventually unlocks consoles, games, shell colors, stickers, editions, and boot animations.
- **Safety and quality first.** Imported code is untrusted; validation and human publication review are mandatory.
- **Zero monthly cost as an MVP target.** No required paid LLM APIs, no multiplayer game servers, and no paid infrastructure dependencies.

## Project documents

- [Platform Constitution v0.1](docs/platform-constitution.md)
- [Architecture & security](docs/architecture-and-security.md)
- [Slopboy 1000 draft hardware contract](docs/hardware/slopboy-1000.md)
- [Roadmap and acceptance gates](docs/roadmap.md)
- [Development setup and P0 validation](docs/development.md)

## Proposed implementation

Next.js + React + TypeScript, Tailwind + shadcn/ui, pnpm monorepo, standalone TypeScript SDK and browser runtime, static export/PWA, GitHub-driven submissions and bounded CI. Backend **deferred**; Neon and Supabase are candidates, not a commitment. Remote MCP connector **deferred** until manual cartridge workflow passes.

## First milestone

Run a separately packaged, validated demo cartridge on an original virtual console in both Console and Game modes, with keyboard/touch controls and no backend. See `/play` after starting `pnpm dev`.

This repository is at planning stage. See the roadmap before beginning implementation.

## Play the curated games

Run `pnpm install && pnpm dev`, then open `/library` for the catalog or `/play/tiny-catcher` for the first cartridge. The static build (`pnpm build`) packages all games listed in `packages/catalog/src/index.ts`. Creator submissions are **not** accepted yet; see [Creator quickstart](docs/creator-quickstart.md) for the manual authoring contract.
