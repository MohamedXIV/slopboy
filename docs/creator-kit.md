# Slopboy Creator Kit v0.1

This is a **manual, local, zero-API-cost authoring workflow**. Human developers, ChatGPT and Claude can produce the same two source files. It does not require a model subscription, GitHub Actions, accounts or an MCP connector.

## Setup

Node 22 and pnpm 10 are required. From the Slopboy repository:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm creator:new my-first-game
```

The starter creates only `creations/my-first-game/manifest.json` and `creations/my-first-game/src/game.ts`. It **never overwrites** an existing project. No `npm install`, lifecycle scripts, imports or extra network calls are executed by the Creator Kit.

Edit those two files, then:

```sh
pnpm creator:check my-first-game
pnpm creator:build my-first-game
pnpm creator:verify my-first-game
pnpm creator:preview my-first-game
```

The build writes `creations/my-first-game/dist/my-first-game.slop`, which is intentionally ignored by Git.
`pnpm creator:preview my-first-game` generates `creations/my-first-game/dist/my-first-game.preview.html`. Open that HTML file locally in Chromium to play your game using **the same opaque iframe/Worker sandbox**, keyboard/touch controls, Console/Game Mode, and restart. No server, upload, model API or production catalog change is involved. You can regenerate the file after source edits; the tool validates and repackages before writing it. Preview saves are in-memory and last only until the preview page closes.

The preview is a **local development convenience**, not a certification of untrusted JavaScript safety. Do not post the generated HTML on public web hosting. Browser acceptance is currently Chromium only; Firefox/WebKit and low-end mobile remain unverified. Each command prints structured JSON to stdout (or a JSON error to stderr with a nonzero exit code), suitable for AI and CLI agents. `check` does not create an output file.

## Hardware contract: Slopboy 1000 v0.1

- 160×144 pixels, indexed palette **0–3**; 60 logical updates/second is a target, not a promise.
- D-pad + A/B + Start/Select; only declare controls actually needed.
- 64 KiB compiled JS, 512 KiB compressed cartridge, 2 MiB decompressed envelope, 8 KiB local save.
- One default-exported `GameModule` implementing `update(context,dt)` and `draw(context)` plus optional `init(context)`.
- Game API: `context.input.down()/pressed()`, `context.screen.clear()/pixel()/rect()`, `context.storage.load()/save()/erase()`.
- Only `import type {...} from '@slopboy/sdk'` is supported. No runtime packages, DOM, network, dynamic imports or eval.
- `achievements` in the manifest are **definitions only**, not a way to award platform currency.

The local validator performs manifest checks, AST screening, proper TypeScript semantic typechecking against the SDK, compressed package size checks, deterministic bundling and byte-identical verification. **It cannot prove JavaScript safe**, approve assets/content/IP, or run the game in a trustworthy environment. **Local standalone preview is now available**, but web-hosted public creator previews and third-party public submissions remain disabled until the cross-browser security gate is met.

## Use with any AI assistant

Paste the `packages/sdk/src/index.ts` and `packages/hardware/src/index.ts` contracts (or relevant sections) along with this request:

> Build an original Slopboy 1000 game for the existing Creator Kit. Edit only `creations/my-first-game/manifest.json` and `creations/my-first-game/src/game.ts`. Follow the typed GameModule SDK, use palette indices 0–3, use no browser globals or runtime imports, and make sure controls are declared in the manifest. Keep compiled code below 64 KiB and include concise test steps. Do not claim you have run tests without evidence. The user will run `pnpm creator:check my-first-game` and supply diagnostic JSON to fix.

AI chat products with no filesystem tools can return the **two files as text** for the user to copy. No provider-specific integration is required.

## Manual review (not public publishing)

A source/code quality reviewer must check rights, content suitability, license, malicious behavior, mobile playability, deterministic budgets, and platform game design. Only **maintainer-approved** code may be copied into the curated `examples/` catalog and released through `pnpm cartridge:build`. The `creations/` directory and its artifacts never auto-publish. Do not enable submission of arbitrary `.slop` files or link them directly to `/play` yet.

## Failure modes

Creator commands reject invalid IDs/traversal, symlinks, wrong manifest identity, invalid TypeScript SDK usage, forbidden imports/APIs, and over-budget inputs. JSON failure includes `code` and `message`. A failure does **not** mutate the public catalog.
