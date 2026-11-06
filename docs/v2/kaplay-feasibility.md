# KAPLAY 3001.0.19 — isolated rendering feasibility spike

**Status:** experimental first-party integration on `feat/slopboy-2-foundation`. Does NOT approve arbitrary game uploads or replace the pixel runtime.

## What is real

- The checked-in source cartridge lives at `examples/kaplay-spike/{manifest.json,game.mjs}`. A pinned local NPM dependency, `kaplay@3001.0.19`, runs its actual component/game update and WebGL drawing; not an emulated screenshot or CSS animation.
- `pnpm kaplay:spike-build` validates the source manifest against `@slopboy/hardware/v2`, reports game source size without simulated code/ROM budgets, reads the installed KAPLAY ESM bundle, then produces a **self-hosted**, CSP-locked HTML sandbox at `/v2/kaplay-spike.html`. The shared engine's bytes are reported separately, **not** charged to each tiny cartridge.
- The privileged Next.js page fetches the generated document with `credentials: omit` and mounts it as iframe `srcDoc`, `sandbox="allow-scripts"` (no `allow-same-origin`), no network fetches from the iframe. The frame establishes a random-key message handshake. Parent verifies message source, null origin, key, dimensions, WebGL state and every pixel index.
- KAPLAY draws into a 160×144 WebGL canvas. The sandbox copies the screen into a 2D canvas, quantizes RGBA to exactly four indexed values, and transfers a `Uint8Array` to the parent. The parent maps indices to LCD palettes using the existing framebuffer validator/rasterizer.
- The page includes touch controls, keyboard input, reboot and readback timings; the new Chromium test requires actual visible 2–4-color pixels, movement from inputs, origin isolation, CSP presence and palette changes.

## Important limitations / security gates

1. **Opaque origin and CSP constrain capabilities; they do not impose CPU or memory limits.** A malicious infinite loop in an iframe may block the renderer and defeat the parent's watchdog. A safe arbitrary-code cartridge runtime is **not** demonstrated. The `game.mjs` fixture is first-party code read at build time, never user code.
2. Indexed palette enforcement here occurs **after a WebGL readback**. KAPLAY internally renders full RGB; we only expose four shades on the platform display. This experimental bridge currently transfers at 30 FPS (60 FPS is a host performance target, not virtual hardware cap) and its CPU/GPU impact requires real device measurements. Pixel copies do not demonstrate a high-performance production bridge.
3. The iframe bootstrap includes a fixed inline module and blob imports generated from trusted files. It uses a strict `connect-src 'none'` CSP, but this alone is not an approved isolation profile for unknown user code; renderer compromise, unusual side channels, allocation bombs and navigation behavior remain separate security tests.
4. No remote assets, persistence bridge, audio bridge, generic .slop adapter, independent process isolation, resource/memory cap, multi-engine loading, Firefox/WebKit or Android/iOS browser validation yet. A third-party KAPLAY project must **not** use this source insertion path.
5. For release, decide whether to isolate a GPU worker using OffscreenCanvas (subject to KAPLAY DOM dependencies), a dedicated remote origin/process, or a smaller audited/controlled game API. Test webgl readback vs hardware-preserving GPU palette shaders, monitor hidden-tab throttling and handle lost WebGL contexts.
6. **The diagnostic bridge's 30 FPS transfer and arbitrary-code isolation are quality/security blockers, not console hardware limitations** to treating this implementation as the final KAPLAY runtime. Keep pixel-v1 compatibility running until both are addressed.

## Commands

```sh
pnpm install --ignore-scripts --frozen-lockfile
pnpm kaplay:spike-build
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm security:kaplay-spike
```

Actual pass/fail evidence belongs to CI and browser smoke. Do not equate green status with production acceptance.

## Render scheduler diagnostic

The first Chromium run rendered index-validated frames but did not move during a 900ms keypress. The original sandbox canvas was hidden in a 1×1 opacity-zero iframe. A diagnostic run found only 12 KAPLAY update ticks over several seconds despite complete asset loading, consistent with background/occlusion throttling. The follow-up keeps the isolated WebGL iframe at its natural 160×144 dimensions behind the trusted, quantized display and tests sustained keypresses. This change is still a feasibility experiment, not a browser-wide FPS guarantee.

### Raw renderer preview in this spike

This lab deliberately shows a second small raw WebGL preview (the visible iframe) alongside the indexed Slopboy output. Chrome stopped the engine game loop after about 12 ticks when the iframe was fully occluded, even while the parent displayed previously captured valid pixels. This visibility experiment is a **diagnostic concession** for first-party code; final hardware must not expose unrestricted RGB or unrestricted iframe DOM as the player-facing display.

## Display-only device contract (2026-11-06)

Slopboy no longer emulates CPU, RAM, GPU horsepower, audio voices, FPS ceilings, code/ROM capacity or save memory. Device restrictions concern only logical resolution and indexed palette depth. Physical button descriptions support input mapping but are not gameplay resource limits. The V2 cartridge builder now checks visual compatibility, not fabricated 64 KiB code / 512 KiB ROM budgets. Existing safety limits for generated test bundles are separate platform protections, not cartridge hardware restrictions. V1 remains a temporary compatibility adapter until it is replaced.
