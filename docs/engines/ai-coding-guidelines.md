# Slopboy Game Creation Guidelines for AI Coding Agents

**Authoritative reference for ChatGPT, Claude, and autonomous coding agents.**

This document defines the strict requirements, APIs, and self-correction instructions for generating games for the **Slopboy virtual console**.

---

## 1. Virtual Console Hardware Constraints

Virtual devices constrain display, color depth, aspect ratio, and controls. They do **not** simulate fake CPU cycles, RAM, or arbitrary frame rate caps.

| Parameter | Specification | Details |
|---|---|---|
| **Logical Resolution** | **160 × 144 pixels** | Fixed viewport. All gameplay coordinates must fit within `[0, 160]` horizontally and `[0, 144]` vertically. |
| **Aspect Ratio** | **10:9** | Native handheld form factor. |
| **Palette** | **4 indexed colors** | Monochrome/tinted palette: <br>• Color 0: Lightest / Background `RGB(220, 233, 177)`<br>• Color 1: Light accent `RGB(170, 194, 130)`<br>• Color 2: Dark accent `RGB(100, 132, 104)`<br>• Color 3: Ink / Foreground `RGB(40, 72, 62)` |
| **Physical Controls** | **8 standard inputs** | • D-Pad: `UP`, `DOWN`, `LEFT`, `RIGHT`<br>• Action buttons: `A` (Jump / Primary), `B` (Secondary)<br>• Menu: `START`, `SELECT` |

---

## 2. Strict Security and Sandbox Rules

Slopboy executes cartridges inside a locked browser sandbox (CSP `default-src 'none'`).

> [!CAUTION]
> Any violation of these rules causes the server pipeline and validation AST scanner to immediately reject the cartridge with actionable diagnostics.

1. **NO DOM Access:**
   - Forbidden identifiers: `window`, `document`, `globalThis`, `self`.
   - Never call `document.createElement`, `document.getElementById`, or manipulate the DOM shell.
   - All graphics must be rendered through the engine's canvas or drawing API.
2. **NO Network Access:**
   - Forbidden identifiers: `fetch`, `XMLHttpRequest`, `WebSocket`.
   - Games are offline-first. Remote calls fail closed.
3. **NO Remote Imports or CDNs:**
   - Do NOT import from URLs (e.g. `import x from 'https://esm.sh/...'` or `//cdn...`).
   - All source code and assets must be local relative paths.
4. **NO Arbitrary npm Dependencies:**
   - Only pre-approved framework modules may be imported:
     - For KAPLAY: `import kaplay from 'kaplay';`
     - For Pixel-V1: `import type { GameModule } from '@slopboy/sdk';`
     - For Phaser: `import Phaser from 'phaser';`
     - For PixiJS: `import { Application } from 'pixi.js';`
5. **NO Dynamic Code Evaluation:**
   - Forbidden: `eval()`, `new Function()`, `importScripts()`, dynamic `import()`.
6. **NO Direct Browser Storage:**
   - Forbidden: `localStorage`, `sessionStorage`, `indexedDB`.
   - Use the host-provided storage bridge: `hostContext.storage.save(jsonString)` and `hostContext.storage.load()`.

---

## 3. Approved Engines & Selection Rationale

Engine selection is **recommendation-based**, not hard-bound:

| Engine | Pinned Version | Status | Best Use Case |
|---|---|---|---|
| **KAPLAY** | `3001.0.19` | **Experimental candidate** | Fast arcade games, action, collect-a-thons, puzzles, jump-and-runs. |
| **Pixel-V1** | `0.1.0` | **Compatibility** | Minimal retro pixel-art games, procedural math toys, puzzle grids. |
| **Phaser 4** | `4.2.1` | **Planned P1** | Complex 2D systems: tilemaps, physics, particles, multi-scene RPGs. |
| **PixiJS 8** | `8.21.0` | **Planned P2** | Custom 2D WebGL2 shaders and visual rendering experiments. |

---

## 4. KAPLAY Game Template (Pinned `3001.0.19`)

```typescript
/*
 * KAPLAY Engine - MIT License
 */
import kaplay from 'kaplay';

export interface HostStorage {
  load(): string | null;
  save(value: string): void;
  erase(): void;
}

export interface GameHostContext {
  storage?: HostStorage;
}

export default function setupGame(kInit: typeof kaplay, canvas: HTMLCanvasElement, host?: GameHostContext) {
  const k = kInit({
    canvas,
    width: 160,
    height: 144,
    scale: 1,
    pixelDensity: 1,
    maxFPS: 60,
    global: false,
    crisp: true,
    background: [220, 233, 177],
    touchToMouse: false,
    debug: false,
    loadingScreen: false,
  });

  const ink = [40, 72, 62];
  const dark = [100, 132, 104];
  const light = [170, 194, 130];

  // Entities
  k.add([k.rect(160, 12), k.pos(0, 132), k.color(dark[0], dark[1], dark[2])]);
  const player = k.add([k.rect(10, 10), k.pos(24, 122), k.color(ink[0], ink[1], ink[2])]);
  const gem = k.add([k.rect(6, 6), k.pos(80, 70), k.color(light[0], light[1], light[2])]);

  let heldKeys = new Set<string>();
  let score = 0;
  let highScore = 0;

  // Restore saved state
  if (host?.storage) {
    const raw = host.storage.load();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.highScore === 'number') highScore = parsed.highScore;
      } catch {
        // Fall back to clean state
      }
    }
  }

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  k.onUpdate(() => {
    const dt = Math.min(k.dt(), 0.05);
    const speed = heldKeys.has('A') ? 110 : 70;

    const dx = (Number(heldKeys.has('RIGHT')) - Number(heldKeys.has('LEFT'))) * speed * dt;
    const dy = (Number(heldKeys.has('DOWN')) - Number(heldKeys.has('UP'))) * speed * dt;

    player.pos.x = clamp(player.pos.x + dx, 2, 148);
    player.pos.y = clamp(player.pos.y + dy, 8, 122);

    // Collision check
    const dist = Math.hypot(player.pos.x - gem.pos.x, player.pos.y - gem.pos.y);
    if (dist < 8) {
      score += 10;
      gem.pos.x = 16 + Math.random() * 128;
      gem.pos.y = 16 + Math.random() * 96;

      if (score > highScore && host?.storage) {
        highScore = score;
        host.storage.save(JSON.stringify({ highScore }));
      }
    }
  });

  return {
    setInput(keys: readonly string[]) {
      heldKeys = new Set(keys);
    },
    destroy() {
      // Clean up game session
    },
  };
}
```

---

## 5. Diagnostic Codes and Self-Correction Guide

When validation fails, the server returns an `AgentDiagnostic` array. Use this guide to fix your code automatically:

| Error Code | Meaning | How to Fix |
|---|---|---|
| `REMOTE_IMPORT_FORBIDDEN` | An import uses `http:`, `https:`, or `//` URL. | Remove the remote URL. Use locally declared assets in `assets/` or the approved engine module name. |
| `UNAPPROVED_MODULE` | An import targets an unapproved npm module (e.g. `axios`, `lodash`). | Remove the external import. Implement helper functions inline or use standard JavaScript primitives. |
| `DOM_ACCESS_FORBIDDEN` | Code referenced `window` or `document`. | Replace DOM manipulation with the engine's rendering APIs (e.g., `k.add(...)` or `ctx.screen.rect(...)`). |
| `NETWORK_ACCESS_FORBIDDEN` | Code called `fetch()`, `XMLHttpRequest`, or `WebSocket`. | Remove network calls. All game logic and state must run locally. |
| `DIRECT_STORAGE_FORBIDDEN` | Code referenced `localStorage` or `sessionStorage`. | Use `hostContext.storage.save(string)` and `hostContext.storage.load()`. |
| `DYNAMIC_CODE_FORBIDDEN` | Code called `eval()` or `new Function()`. | Rewrite dynamic code into direct, statically analyzable TypeScript functions. |
| `MISSING_EXPORT` | No `export default` was found in the entrypoint. | Add `export default createGame;` or `export default game;` at the end of the entrypoint file. |
| `SYNTAX_ERROR` | TypeScript syntax error. | Inspect the reported line and column to fix the syntax error. |
