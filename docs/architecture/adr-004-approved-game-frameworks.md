# ADR-004 — Approved Game Frameworks and Engine-Neutral Slopboy Cartridges

**Date:** 2026-11-08  
**Status:** Accepted **product direction**, proposed adapter and build design; no framework is yet approved to execute arbitrary public uploads  
**Owner:** [Epic #43](https://github.com/MohamedXIV/slopboy/issues/43) · [Roadmap](../../ROADMAP.md)

## Decision

Slopboy is an **agent-native virtual-console game platform**, **not** a host for arbitrary websites. ChatGPT, Claude and future AI clients create **TypeScript/JavaScript game source using approved, version-pinned game frameworks and canonical Slopboy game templates**. They do **not** submit a standalone HTML/CSS/JS application with its own DOM shell, arbitrary CDN scripts or package installs. All games enter via the same authenticated MCP upload → isolated build → private draft/revision → safe preview → human public-review path.

A framework does not make its JavaScript trusted. Approved libraries are only development/API and rendering choices; existing security gates [#4](https://github.com/MohamedXIV/slopboy/issues/4) and [#33](https://github.com/MohamedXIV/slopboy/issues/33) still govern code execution.

**Legacy exception:** The curated \`pixel-v1\` compatibility games and old guest saves remain usable. This rule applies to **new agent-authored revisions**, not a forced rewrite of historical games.

## Supported engines — proposed rollout, not launch promise

| Engine | Current reference | Status | Best starting use case | Caveat |
| --- | --- | --- | --- | --- |
| **KAPLAY** | \`kaplay@3001.0.19\` | **Experimental spike, first production-adapter candidate** | Small arcade, puzzles, platformers, accessible AI-generated projects | Chrome hidden/occluded iframe rendering/update throttling is unresolved; safe end-to-end worker/iframe isolation is not proved |
| **Phaser 4** | \`phaser@4.2.1\` | **Planned P1 adapter** | Complex 2D: tilemaps, physics, particles, multiple scenes, cameras, animation | Larger runtime/API; pin imports/version and verify device performance/bundle/CSP |
| **PixiJS 8** | \`pixi.js@8.21.0\` documentation reference | **Optional P2 feasibility** | Custom rendering, specialized visual/interactive games | **Rendering library**, not a comprehensive game engine; game update, physics, audio/save/input conventions need a coherent gameplay kit |
| **pixel-v1** | Existing curated runtime | **Compatibility only** | Preserve three original games and saves | Not default format for new published user content |

Versions above are verified reference versions as of the date of this ADR. Adopt exact immutable versions only after testing and reproducible build capture. Never rely on floating \`latest\` or an alpha release for games already published.

**Framework is a choice, not a device tier.** Any approved engine may target any compatible Slopboy screen. The device contract constrains **logical width/height, aspect ratio and final indexed color count** and exposes its actual controls. It does **not** simulate CPU, RAM, ROM, audio voice caps, physics features, nominal FPS or fake GPU restrictions. Quality and performance remain measured expectations, not fictional chip emulation.

## Proposed engine-neutral source manifest

*Illustrative schema only; these fields are not yet deployed as parser/runtime code.*

~~~json
{
  "schemaVersion": 1,
  "gameId": "SERVER_ASSIGNED_UUID",
  "revisionId": "SERVER_ASSIGNED_UUID",
  "deviceProfile": "slopboy-1000",
  "engine": {
    "id": "kaplay",
    "version": "3001.0.19",
    "adapterProtocol": 1
  },
  "entrypoint": "src/game.ts",
  "assets": [
    "assets/player.png",
    "assets/audio/collect.wav"
  ]
}
~~~

- **Server assigns** game/revision/owner IDs. The model cannot set another owner's ID or forge a revision's immutable identity.
- Validate manifest and actual resolved imports **against a maintained allowlist**; source entrypoint/assets must be relative permitted paths. Invalid remote URLs, unapproved npm modules and remote script injection are rejected (with actionable build errors).
- Build process produces immutable hashes for original source, artifacts, engine runtime and adapter version. A revision retains the engine it was built against; engine updates do not silently mutate installed or offline games.
- Runtime/framework binaries can be **shared, versioned and cached per client** rather than duplicated in every cartridge. Shared engine bytes are not simulated game ROM size. Always self-host pinned vetted builds; no implicit CDN/network fetch from restricted game execution.
- Store private artifacts behind authorization/signed URLs and deliver to a sandbox. Cache downloaded reviewed games appropriately for offline use without caching private tokens or cross-account responses.

## Standard Host API (one contract, multiple adapters)

The Slopboy host mediates, rather than sharing privileged browser/window APIs with game source:

- **Lifecycle:** mount, boot/start, pause/resume, restart, suspend/close, cleanup/dispose; host shutdown must stop input, audio and timers.
- **Display:** provide a logical render target. Engines can draw internally in RGB/WebGL. Before display optics the **output frame** must obey the indexed-color device profile; LCD/CRT Screen FX are applied **after** quantization and remain optional cosmetic effects.
- **Input:** action names for D-pad, A/B, Start/Select; host resolves keyboard, touch, gamepad and future device controls.
- **Persistence:** host-mediated save/load/revisions via game UUID + profile and version policy; no direct cloud secrets/credentials and no silent loss of guest IndexedDB saves.
- **Audio and assets:** host-mediated vetted assets/audio lifecycle; no external network fetch from the isolated game.
- **Diagnostics:** game/engine versions, sandbox state, errors, build/boot timings and measured resource usage; avoid fabricating achievement authority from game-supplied data.

The adapter maps this interface to a given engine without making V2DevicePlayer or Next.js API handlers know engine-specific internals. Components remain cohesive, not a swarm of tiny wrappers or one giant dispatcher.

**Renderer performance gate:** Current KAPLAY spike does GPU → CPU readback → quantize → 2D display, and hid GPU context stalls unless the raw renderer is visible. That is a diagnostic, **not an approved production pipeline**. Prototype zero-/low-copy GPU palette quantization and final FX where appropriate; profile actual visible + paused/hidden iframe, tab background, WebGL context loss and Safari/WebKit before selecting a design. No fictional hardware FPS cap; an optional screen refresh effect never changes game simulation or inputs.

## Manual paste is a first-class authoring path

Approved engine templates are not exclusive to remote MCP. A creator can copy a Slopboy-compatible KAPLAY or later Phaser module from any AI assistant and submit it in `/dashboard` using **Paste Code**. The server constructs/checks its framework manifest; the upload is an owner-only, non-executing draft until validated, isolated-built and safe to preview. Do not allow the manual path to bypass the same framework allowlist, upload quotas, ownership or sandbox gates as MCP. See [ADR-005](adr-005-manual-source-ingestion.md) and [#49](https://github.com/MohamedXIV/slopboy/issues/49).

## What the AI clients receive

Remote MCP should expose current approved capabilities using tools such as:

- \`list_supported_engines(deviceProfile?)\`: engine IDs, pinned versions, runtime approval status, supported feature tags and device output capabilities. **Do not list experimental engines as production-ready.**
- \`get_engine_capabilities(engineId, deviceProfile)\`: API recommendations and prohibitions; returns appropriate framework/host SDK reference and asset/entrypoint rules.
- \`get_game_template(engineId, deviceProfile)\`: a complete maintained source/manifest project starter with typed lifecycle and input/save methods.
- \`validate_game\`, \`build_revision\` and \`get_build_status\` report real actionable errors and supported fixes to the agent.

Model-driven selection is flexible: request a puzzle → recommend KAPLAY; request large physics/tilemaps → recommend Phaser if approved; request unusual drawing → PixiJS if its gameplay kit is approved. **Do not force Phaser only on a “modern” model**, nor allow unsupported engines because the assistant happened to generate their code.

The author never needs to manually assemble an HTML page. The game file is still real TypeScript/JS source: the policy standardizes its framework, lifecycle, imports and output, not a no-code visual language.

## Security and release gates

1. Framework allowlist, deterministic package resolution, no remote imports, static asset validation and bounded upload sizes. **Static checks do not constitute a JS sandbox.**
2. Resource-limited build environment; no untrusted code execution in privileged Neon/Next.js/MCP processes.
3. Opaque origin / independent origin browser isolation, strict CSP, hostile-code tests, trustworthy input/save host messages, correct fallback/recovery, mobile/browser compatibility.
4. Versioned immutable private preview. A successful MCP upload is not proof the game is playable; preview is reported only after actual build/run success.
5. Public library approval by human admin; friend sharing only via explicit grants. Engines cannot self-approve submissions.

## Acceptance path and Issues

1. [#44](https://github.com/MohamedXIV/slopboy/issues/44) — manifest, engine registry and engine-neutral Host SDK (P0).
2. [#45](https://github.com/MohamedXIV/slopboy/issues/45) — turn real KAPLAY spike into an integrated, security-gated adapter (P0). If unsolved, keep **experimental** and don't claim support.
3. [#46](https://github.com/MohamedXIV/slopboy/issues/46) — MCP discovery/templates + ChatGPT/Claude coding instructions (P0).
4. [#47](https://github.com/MohamedXIV/slopboy/issues/47) — Phaser 4 adapter after initial KAPLAY end-to-end (P1).
5. [#48](https://github.com/MohamedXIV/slopboy/issues/48) — PixiJS/gameplay kit feasibility; only implement public adapter if evidence supports it (P2).

Related Epics: [#17](https://github.com/MohamedXIV/slopboy/issues/17) MCP, [#18](https://github.com/MohamedXIV/slopboy/issues/18) secure cartridge ingestion/build and [#43](https://github.com/MohamedXIV/slopboy/issues/43) engines. First real agent-created private game acceptance [#30](https://github.com/MohamedXIV/slopboy/issues/30) requires a working approved engine, OAuth, upload and safe runtime. Keep [PR #14](https://github.com/MohamedXIV/slopboy/pull/14) Draft; this ADR itself changes policy and issues, **not the production player**.

## References checked 2026-11-08

- KAPLAY: https://www.npmjs.com/package/kaplay and https://kaplayjs.com/docs/guides/
- Phaser 4: https://phaser.io/download/phaser4 and https://docs.phaser.io/
- PixiJS 8: https://pixijs.com/versions and https://pixijs.com/8.x/guides/getting-started/intro
- Existing live code evidence: [KAPLAY feasibility spike](../v2/kaplay-feasibility.md)
