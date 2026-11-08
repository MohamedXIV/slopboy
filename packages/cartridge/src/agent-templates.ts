/**
 * AI-Facing Engine Templates, Coding Instructions, and MCP Capability Discovery.
 *
 * Supports ChatGPT, Claude, and autonomous agents generating Slopboy cartridges.
 * - Provides version-pinned, validated templates for approved game engines (KAPLAY, Pixel-V1, Phaser 4, PixiJS 8).
 * - Implements MCP capability discovery tools (list_supported_engines, get_engine_capabilities, get_game_template).
 * - Implements recommendation-based engine selection (not hard-bound).
 * - Generates actionable diagnostics for AST and manifest violations to enable agent iteration.
 * - Demonstrates engine version pinning and no external runtime fetches.
 */

import ts from 'typescript';
import {
  ENGINE_REGISTRY,
  getEngineDescriptor,
  getEngineRegistry,
  type EngineDescriptor,
  type EngineId,
  type EngineStatus,
  type EngineCapabilities,
} from './engine-registry.ts';
import {
  validateManifestV2,
  type CartridgeManifestV2,
  type ManifestAssetDeclaration,
  ManifestError,
} from './manifest-v2.ts';
import { V2_DEVICE_1000 } from '../../hardware/src/v2.ts';

export interface AgentDiagnostic {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly file?: string;
  readonly suggestedFix?: string;
}

export interface EngineRecommendation {
  readonly recommendedEngine: EngineId;
  readonly engineName: string;
  readonly rationale: string;
  readonly alternatives: readonly {
    readonly engineId: EngineId;
    readonly engineName: string;
    readonly rationale: string;
  }[];
}

export interface SupportedEngineInfo {
  readonly id: EngineId;
  readonly name: string;
  readonly version: string;
  readonly adapterProtocol: number;
  readonly status: EngineStatus;
  readonly isProductionReady: boolean;
  readonly description: string;
  readonly allowedImports: readonly string[];
  readonly entrypointExtensions: readonly string[];
  readonly capabilities: EngineCapabilities;
  readonly recommendedFor: readonly string[];
  readonly deviceOutput: {
    readonly width: number;
    readonly height: number;
    readonly colors: number;
    readonly aspectRatio: string;
  };
}

export interface EngineCapabilitiesInfo {
  readonly engine: EngineDescriptor;
  readonly hardwareConstraints: {
    readonly width: number;
    readonly height: number;
    readonly colors: number;
    readonly aspectRatio: string;
    readonly buttons: readonly string[];
  };
  readonly allowedImports: readonly string[];
  readonly forbiddenApis: readonly string[];
  readonly entrypointRequirement: string;
  readonly saveProtocol: string;
  readonly bestFor: readonly string[];
  readonly guidelines: string;
}

export interface GameTemplateResult {
  readonly engineId: EngineId;
  readonly engineVersion: string;
  readonly deviceProfile: string;
  readonly manifest: CartridgeManifestV2;
  readonly files: Record<string, string>;
  readonly licenseNotice: string;
  readonly instructions: string;
}

export interface ValidationReport {
  readonly valid: boolean;
  readonly engineId: string;
  readonly diagnostics: readonly AgentDiagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly summary: string;
}

const FORBIDDEN_IDENTIFIERS_INFO: Record<string, { code: string; desc: string; fix: string }> = {
  fetch: {
    code: 'NETWORK_ACCESS_FORBIDDEN',
    desc: "Access to 'fetch' is forbidden. Cartridges cannot make network calls.",
    fix: 'Remove network requests. Slopboy cartridges run offline-first; use in-memory state or host storage.',
  },
  XMLHttpRequest: {
    code: 'NETWORK_ACCESS_FORBIDDEN',
    desc: "Access to 'XMLHttpRequest' is forbidden. Cartridges cannot make network calls.",
    fix: 'Remove network requests. Slopboy cartridges run offline-first.',
  },
  WebSocket: {
    code: 'NETWORK_ACCESS_FORBIDDEN',
    desc: "Access to 'WebSocket' is forbidden. Network connections are not permitted.",
    fix: 'Remove WebSocket connections. Multiplayer is not supported in cartridge sandboxes.',
  },
  window: {
    code: 'DOM_ACCESS_FORBIDDEN',
    desc: "Direct access to 'window' is forbidden. Cartridges run in an isolated execution sandbox.",
    fix: "Use the engine's built-in drawing, input, and lifecycle APIs instead of window methods.",
  },
  document: {
    code: 'DOM_ACCESS_FORBIDDEN',
    desc: "Direct access to 'document' is forbidden. Cartridges cannot manipulate the DOM shell.",
    fix: "Use the engine's canvas rendering APIs. All graphics must render inside the 160x144 canvas.",
  },
  globalThis: {
    code: 'GLOBAL_ACCESS_FORBIDDEN',
    desc: "Direct access to 'globalThis' is forbidden to prevent sandbox escape.",
    fix: 'Keep state within module scope or passed context objects.',
  },
  self: {
    code: 'GLOBAL_ACCESS_FORBIDDEN',
    desc: "Direct access to 'self' is forbidden.",
    fix: 'Keep state within module scope.',
  },
  localStorage: {
    code: 'DIRECT_STORAGE_FORBIDDEN',
    desc: "Direct access to 'localStorage' is forbidden. Storage is isolated per cartridge.",
    fix: 'Use the Host Storage API (hostContext.storage.save/load or ctx.storage.save/load).',
  },
  sessionStorage: {
    code: 'DIRECT_STORAGE_FORBIDDEN',
    desc: "Direct access to 'sessionStorage' is forbidden.",
    fix: 'Use in-memory state or the Host Storage API.',
  },
  Worker: {
    code: 'WORKER_FORBIDDEN',
    desc: "Spawning 'Worker' threads is forbidden inside cartridges.",
    fix: 'Perform computations synchronously within the game update loop.',
  },
  SharedWorker: {
    code: 'WORKER_FORBIDDEN',
    desc: "Spawning 'SharedWorker' threads is forbidden inside cartridges.",
    fix: 'Perform computations within the game update loop.',
  },
  importScripts: {
    code: 'DYNAMIC_SCRIPT_FORBIDDEN',
    desc: "Dynamic 'importScripts' is forbidden.",
    fix: 'Declare all code in local source files.',
  },
  eval: {
    code: 'DYNAMIC_CODE_FORBIDDEN',
    desc: "Using 'eval()' is strictly forbidden for security.",
    fix: 'Write static TypeScript/JavaScript logic without dynamic evaluation.',
  },
  Function: {
    code: 'DYNAMIC_CODE_FORBIDDEN',
    desc: "Using 'Function()' constructor is strictly forbidden.",
    fix: 'Write static functions instead of dynamic string evaluation.',
  },
  navigator: {
    code: 'NAVIGATOR_FORBIDDEN',
    desc: "Direct access to 'navigator' is forbidden.",
    fix: "Inputs and audio are managed by the host. Do not query navigator APIs.",
  },
  location: {
    code: 'LOCATION_FORBIDDEN',
    desc: "Direct access to 'location' is forbidden.",
    fix: 'Cartridges cannot navigate the parent page or inspect URL parameters.',
  },
  process: {
    code: 'NODE_API_FORBIDDEN',
    desc: "Node.js 'process' global is unavailable in the browser sandbox.",
    fix: 'Remove process references. Cartridges run in the browser client.',
  },
  require: {
    code: 'COMMONJS_FORBIDDEN',
    desc: "CommonJS 'require' is forbidden. Use ES Module syntax.",
    fix: "Replace 'require(...)' with standard 'import ... from ...'.",
  },
  Deno: {
    code: 'RUNTIME_API_FORBIDDEN',
    desc: "'Deno' runtime global is unavailable.",
    fix: 'Remove Deno-specific code.',
  },
  Bun: {
    code: 'RUNTIME_API_FORBIDDEN',
    desc: "'Bun' runtime global is unavailable.",
    fix: 'Remove Bun-specific code.',
  },
};

export const KAPLAY_LICENSE_NOTICE = `/*
 * KAPLAY Engine (https://kaplayjs.com/)
 * MIT License - Copyright (c) 2024 KAPLAY developers
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */`;

export const KAPLAY_STARTER_SOURCE = `${KAPLAY_LICENSE_NOTICE}
import kaplay from 'kaplay';

export interface HostStorage {
  load(): string | null;
  save(value: string): void;
  erase(): void;
}

export interface GameHostContext {
  storage?: HostStorage;
}

/**
 * Slopboy Arcade Starter (KAPLAY 3001.0.19)
 *
 * Virtual Hardware Constraints:
 * - Logical Display: 160x144 pixels.
 * - Indexed Colors: 4 shades [Background: (220, 233, 177), Accent: (170, 194, 130), Dark: (100, 132, 104), Ink: (40, 72, 62)].
 * - Controls: UP, DOWN, LEFT, RIGHT, A (Jump/Action), B (Secondary), START, SELECT.
 * - No DOM access (window/document), no network (fetch/WebSocket).
 */
export default function createGame(kInit: typeof kaplay, canvas: HTMLCanvasElement, host?: GameHostContext) {
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

  // Ground platform
  k.add([k.rect(160, 12), k.pos(0, 132), k.color(dark[0], dark[1], dark[2])]);

  // Player sprite (10x10 square)
  const player = k.add([k.rect(10, 10), k.pos(24, 122), k.color(ink[0], ink[1], ink[2])]);

  // Collectable gem
  const gem = k.add([k.rect(6, 6), k.pos(80, 70), k.color(light[0], light[1], light[2])]);

  let heldKeys = new Set<string>();
  let score = 0;
  let highScore = 0;

  // Restore saved high score
  if (host?.storage) {
    const saved = host.storage.load();
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.highScore === 'number') {
          highScore = parsed.highScore;
        }
      } catch {
        // Fall back to 0
      }
    }
  }

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

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
`;

export const PIXEL_V1_STARTER_SOURCE = `import type { GameModule } from '@slopboy/sdk';

/**
 * Slopboy Pixel V1 Starter (Compatibility Runtime)
 *
 * Hardware Display: 160x144 logical resolution, 4 indexed colors (0: light to 3: dark).
 *
 * Controls:
 *   ctx.input.down('LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'A' | 'B' | 'START' | 'SELECT')
 *   ctx.input.pressed(...)
 *
 * Persistence:
 *   ctx.storage?.load(), ctx.storage?.save(string)
 */
let playerX = 76;
let playerY = 120;
let score = 0;
let highScore = 0;
let coinX = 80;
let coinY = 60;

const game: GameModule = {
  init(ctx) {
    playerX = 76;
    playerY = 120;
    score = 0;
    coinX = 80;
    coinY = 60;

    if (ctx.storage) {
      const saved = ctx.storage.load();
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (typeof parsed.highScore === 'number') {
            highScore = parsed.highScore;
          }
        } catch {
          // ignore
        }
      }
    }
  },

  update(ctx, dt) {
    const speed = 60 * Math.min(Math.max(dt, 0), 0.05);
    if (ctx.input.down('LEFT')) playerX = Math.max(0, playerX - speed);
    if (ctx.input.down('RIGHT')) playerX = Math.min(152, playerX + speed);
    if (ctx.input.down('UP')) playerY = Math.max(0, playerY - speed);
    if (ctx.input.down('DOWN')) playerY = Math.min(136, playerY + speed);

    const dist = Math.hypot(playerX - coinX, playerY - coinY);
    if (dist < 8) {
      score += 10;
      coinX = 10 + Math.floor(Math.random() * 140);
      coinY = 10 + Math.floor(Math.random() * 110);

      if (score > highScore && ctx.storage) {
        highScore = score;
        ctx.storage.save(JSON.stringify({ highScore }));
      }
    }
  },

  draw(ctx) {
    // Clear background to color 0
    ctx.screen.clear(0);

    // Ground platform in color 1
    ctx.screen.rect(0, 138, 160, 6, 1);

    // Player in color 3 (darkest)
    ctx.screen.rect(Math.round(playerX), Math.round(playerY), 8, 8, 3);

    // Collectable coin in color 2
    ctx.screen.rect(Math.round(coinX), Math.round(coinY), 6, 6, 2);
  },
};

export default game;
`;

export const PHASER_STARTER_SOURCE = `import Phaser from 'phaser';

/**
 * Slopboy Phaser 4 Starter (Planned P1 Adapter)
 *
 * Hardware Display: 160x144 logical resolution, 4 indexed colors.
 */
export default class StarterScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors: Record<string, boolean> = {};

  constructor() {
    super({ key: 'StarterScene' });
  }

  create() {
    this.cameras.main.setBackgroundColor('#dce9b1');
    this.player = this.add.rectangle(80, 72, 10, 10, 0x28483e);
  }

  update() {
    const speed = 2;
    if (this.cursors['LEFT']) this.player.x -= speed;
    if (this.cursors['RIGHT']) this.player.x += speed;
    if (this.cursors['UP']) this.player.y -= speed;
    if (this.cursors['DOWN']) this.player.y += speed;
  }

  setInput(keys: readonly string[]) {
    this.cursors = {};
    for (const k of keys) this.cursors[k] = true;
  }
}
`;

export const PIXI_STARTER_SOURCE = `import { Application, Graphics } from 'pixi.js';

/**
 * Slopboy PixiJS 8 Starter (Planned P2 Feasibility Adapter)
 *
 * Hardware Display: 160x144 logical resolution, 4 indexed colors.
 */
export default async function createPixiGame(canvas: HTMLCanvasElement) {
  const app = new Application();
  await app.init({
    canvas,
    width: 160,
    height: 144,
    backgroundColor: 0xdce9b1,
    resolution: 1,
    autoDensity: true,
  });

  const player = new Graphics();
  player.rect(0, 0, 10, 10);
  player.fill(0x28483e);
  player.x = 75;
  player.y = 67;
  app.stage.addChild(player);

  return {
    app,
    destroy() {
      app.destroy(true, { children: true });
    },
  };
}
`;

/**
 * Returns engine recommendations based on the user's game concept or genre.
 * Engine selection is recommendation-based, never hard-bound.
 */
export function recommendEngine(promptOrGenre: string): EngineRecommendation {
  const text = (promptOrGenre || '').toLowerCase();

  if (text.includes('physics') || text.includes('tilemap') || text.includes('rpg') || text.includes('scene')) {
    return {
      recommendedEngine: 'phaser',
      engineName: 'Phaser 4',
      rationale: 'Phaser 4 is planned for complex 2D systems with physics, tilemaps, particle systems, and multiple scenes.',
      alternatives: [
        {
          engineId: 'kaplay',
          engineName: 'KAPLAY',
          rationale: 'Available now as experimental candidate; great for lightweight arcade and platformers.',
        },
        {
          engineId: 'pixel-v1',
          engineName: 'Pixel V1',
          rationale: 'Compatibility runtime for minimal direct pixel drawing.',
        },
      ],
    };
  }

  if (text.includes('shader') || text.includes('render') || text.includes('custom visual')) {
    return {
      recommendedEngine: 'pixi',
      engineName: 'PixiJS 8',
      rationale: 'PixiJS 8 specializes in high-performance WebGL2 rendering and custom shaders (requires custom gameplay kit).',
      alternatives: [
        {
          engineId: 'kaplay',
          engineName: 'KAPLAY',
          rationale: 'Recommended for rapid game logic and accessible controls.',
        },
      ],
    };
  }

  if (text.includes('minimal') || text.includes('retro direct') || text.includes('procedural pixel')) {
    return {
      recommendedEngine: 'pixel-v1',
      engineName: 'Slopboy Pixel V1 Runtime',
      rationale: 'Pixel-V1 provides direct 2D canvas pixel-drawing functions with zero external engine overhead.',
      alternatives: [
        {
          engineId: 'kaplay',
          engineName: 'KAPLAY',
          rationale: 'Recommended if you need sprite rotation, scaling, or richer audio.',
        },
      ],
    };
  }

  // Default recommendation: KAPLAY for arcade, action, puzzles
  return {
    recommendedEngine: 'kaplay',
    engineName: 'KAPLAY',
    rationale: 'KAPLAY 3001.0.19 is the first candidate engine adapter, ideal for accessible arcade games, action, and puzzles.',
    alternatives: [
      {
        engineId: 'pixel-v1',
        engineName: 'Pixel V1',
        rationale: 'For minimal retro pixel drawing with zero external engine overhead.',
      },
      {
        engineId: 'phaser',
        engineName: 'Phaser 4',
        rationale: 'Planned for large physics, tilemaps, and complex scenes.',
      },
    ],
  };
}

/**
 * MCP Tool: list_supported_engines
 *
 * Discovers approved engine descriptors, versions, status, and device constraints.
 * Does NOT label experimental engines as production-ready.
 */
export function listSupportedEngines(options?: { deviceProfile?: string }): readonly SupportedEngineInfo[] {
  const profile = options?.deviceProfile || V2_DEVICE_1000.id;
  const registry = getEngineRegistry();

  const recommendationsMap: Record<EngineId, readonly string[]> = {
    kaplay: ['Arcade', 'Action', 'Puzzle', 'Platformer', 'Fast prototypes'],
    phaser: ['Physics', 'Tilemaps', 'Multiple scenes', 'Particles', 'RPG'],
    pixi: ['Custom rendering', 'WebGL2 shaders', 'Visual experiments'],
    'pixel-v1': ['Minimal retro', 'Direct pixel drawing', 'Original compatibility'],
  };

  return registry.map(desc => ({
    id: desc.id,
    name: desc.name,
    version: desc.version,
    adapterProtocol: desc.adapterProtocol,
    status: desc.status,
    isProductionReady: desc.status === 'approved', // None currently approved for unvetted public execution
    description: desc.description,
    allowedImports: desc.allowedImports,
    entrypointExtensions: desc.entrypointExtensions,
    capabilities: desc.capabilities,
    recommendedFor: recommendationsMap[desc.id] || [],
    deviceOutput: {
      width: 160,
      height: 144,
      colors: 4,
      aspectRatio: '10:9',
    },
  }));
}

/**
 * MCP Tool: get_engine_capabilities
 *
 * Detailed API recommendations, limitations, allowed imports, and guidelines for an engine.
 */
export function getEngineCapabilities(options: { engineId: string; deviceProfile?: string }): EngineCapabilitiesInfo {
  const desc = getEngineDescriptor(options.engineId);
  if (!desc) {
    throw new Error(`Unknown engineId "${options.engineId}". Supported engines: ${Object.keys(ENGINE_REGISTRY).join(', ')}`);
  }

  const guidelines = [
    `Target: ${desc.name} (${desc.version}) on Slopboy 1000 (160x144, 4 indexed colors).`,
    `Entrypoint must be in src/ with extension ${desc.entrypointExtensions.join(' or ')}.`,
    `Allowed imports: ${desc.allowedImports.join(', ')}. Remote CDN scripts and unapproved packages are strictly rejected.`,
    'No DOM access (window, document) and no network calls (fetch, WebSocket).',
    'Persistence must use the Host Storage API envelope.',
  ].join('\n');

  return {
    engine: desc,
    hardwareConstraints: {
      width: 160,
      height: 144,
      colors: 4,
      aspectRatio: '10:9',
      buttons: [...V2_DEVICE_1000.inputs],
    },
    allowedImports: [...desc.allowedImports],
    forbiddenApis: Object.keys(FORBIDDEN_IDENTIFIERS_INFO),
    entrypointRequirement: `Single module in src/ exporting lifecycle handlers or default setup function.`,
    saveProtocol: 'envelope-v2',
    bestFor: recommendEngine(desc.id).alternatives.map(a => a.rationale),
    guidelines,
  };
}

/**
 * MCP Tool: get_game_template
 *
 * Returns a fully typed, validated starter cartridge project for an engine.
 */
export function getGameTemplate(options: {
  engineId: string;
  deviceProfile?: string;
  title?: string;
  gameId?: string;
  revisionId?: string;
}): GameTemplateResult {
  const desc = getEngineDescriptor(options.engineId);
  if (!desc) {
    throw new Error(`Unknown engineId "${options.engineId}". Supported engines: ${Object.keys(ENGINE_REGISTRY).join(', ')}`);
  }

  const deviceProfile = options.deviceProfile || V2_DEVICE_1000.id;
  const gameId = options.gameId || '00000000-0000-4000-8000-000000000001';
  const revisionId = options.revisionId || '00000000-0000-4000-8000-000000000002';
  const title = options.title || `Starter ${desc.name} Game`;

  let entrypoint = 'src/game.ts';
  let sourceCode = KAPLAY_STARTER_SOURCE;
  let licenseNotice = KAPLAY_LICENSE_NOTICE;

  if (desc.id === 'pixel-v1') {
    sourceCode = PIXEL_V1_STARTER_SOURCE;
    licenseNotice = '/* MIT License - Slopboy Curated Runtime */';
  } else if (desc.id === 'phaser') {
    sourceCode = PHASER_STARTER_SOURCE;
    licenseNotice = '/* MIT License - Phaser */';
  } else if (desc.id === 'pixi') {
    sourceCode = PIXI_STARTER_SOURCE;
    licenseNotice = '/* MIT License - PixiJS */';
  }

  const manifest: CartridgeManifestV2 = {
    schemaVersion: 1,
    gameId,
    revisionId,
    title,
    deviceProfile,
    engine: {
      id: desc.id,
      version: desc.version,
      adapterProtocol: desc.adapterProtocol,
    },
    entrypoint,
    assets: [],
    controls: ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B'],
  };

  const files: Record<string, string> = {
    'manifest.json': JSON.stringify(manifest, null, 2) + '\n',
    [entrypoint]: sourceCode,
    'README.md': [
      `# ${title}`,
      '',
      `Engine: ${desc.name} (${desc.version})`,
      `Device Profile: ${deviceProfile} (160x144, 4-color indexed palette)`,
      '',
      '## Controls',
      '- D-Pad: UP, DOWN, LEFT, RIGHT',
      '- Buttons: A (Action), B (Secondary)',
      '',
      '## Notes for AI Coding Agents',
      '- Do not add remote CDN imports or unapproved npm packages.',
      '- Do not access window, document, fetch, or localStorage.',
      '- Render all visuals inside the 160x144 coordinate space.',
    ].join('\n') + '\n',
  };

  return {
    engineId: desc.id,
    engineVersion: desc.version,
    deviceProfile,
    manifest,
    files,
    licenseNotice,
    instructions: getAgentCodingInstructions(desc.id),
  };
}

/**
 * Concise coding instructions for AI Coding Agents (ChatGPT, Claude, etc.).
 */
export function getAgentCodingInstructions(engineId?: EngineId): string {
  const engineText = engineId
    ? `Target Engine: ${engineId} (pinned version: ${ENGINE_REGISTRY[engineId]?.version || 'pinned'}).`
    : 'Target Engines: kaplay (3001.0.19) or pixel-v1 (0.1.0).';

  return `
# Slopboy Game Creation Instructions for AI Coding Agents

${engineText}

## Virtual Console Hardware Specification
1. Logical Display: 160 x 144 pixels strictly. Aspect ratio 10:9.
2. Palette: 4 indexed colors only:
   - Color 0 (Lightest / Background): RGB(220, 233, 177)
   - Color 1 (Light Accent): RGB(170, 194, 130)
   - Color 2 (Dark Accent): RGB(100, 132, 104)
   - Color 3 (Ink / Foreground): RGB(40, 72, 62)
3. Physical Controls: D-Pad (UP, DOWN, LEFT, RIGHT), Action buttons (A, B), Menu buttons (START, SELECT).

## Strict Security & Sandbox Rules
- NO DOM access: 'window', 'document', and DOM element creation are strictly forbidden.
- NO Network access: 'fetch', 'XMLHttpRequest', 'WebSocket' are strictly forbidden. Games are offline-first.
- NO Remote imports: All code must be in local files. Do not import from 'https://...' or external CDNs.
- NO Arbitrary packages: Only approved engine imports ('kaplay', '@slopboy/sdk', 'phaser', 'pixi.js') are allowed.
- NO Dynamic code evaluation: 'eval()' and 'Function()' constructors are forbidden.
- Persistence: Use the Host Storage API ('hostContext.storage.save(json)' / 'hostContext.storage.load()'). Never use 'localStorage'.

## Development Guidelines
- Always export a default game setup function or GameModule.
- Keep game logic responsive (60 FPS tick).
- All visuals must fit within the 160x144 viewport.
`.trim();
}

/**
 * Scans source code and produces structured, actionable diagnostics for AI agents.
 */
export function scanSourceDiagnostics(
  source: string,
  engine: EngineDescriptor,
  fileName = 'src/game.ts'
): AgentDiagnostic[] {
  const diagnostics: AgentDiagnostic[] = [];

  if (!source || source.trim().length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'EMPTY_SOURCE',
      message: 'Source code cannot be empty.',
      file: fileName,
      suggestedFix: 'Provide a valid cartridge source module exporting a game setup function.',
    });
    return diagnostics;
  }

  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);

  // Parse diagnostics
  const parseErrors = (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics || [];
  for (const err of parseErrors) {
    const loc = err.start !== undefined ? sourceFile.getLineAndCharacterOfPosition(err.start) : null;
    diagnostics.push({
      severity: 'error',
      code: 'SYNTAX_ERROR',
      message: ts.flattenDiagnosticMessageText(err.messageText, ' '),
      line: loc ? loc.line + 1 : undefined,
      column: loc ? loc.character + 1 : undefined,
      file: fileName,
      suggestedFix: 'Fix the syntax error at the indicated position.',
    });
  }

  const allowedImportsSet = new Set<string>(engine.allowedImports);
  let hasExport = false;

  function walk(node: ts.Node): void {
    // Import checks
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const importPath = moduleSpecifier.text;
        const loc = sourceFile.getLineAndCharacterOfPosition(node.getStart());

        // Remote imports
        if (importPath.includes(':') || importPath.startsWith('//')) {
          diagnostics.push({
            severity: 'error',
            code: 'REMOTE_IMPORT_FORBIDDEN',
            message: `Remote import "${importPath}" is forbidden. Games cannot load external scripts.`,
            line: loc.line + 1,
            column: loc.character + 1,
            file: fileName,
            suggestedFix: `Remove remote import. Use approved engine import "${engine.allowedImports[0]}" or declare assets in manifest.json.`,
          });
        } else {
          const isRelative = importPath.startsWith('./') || importPath.startsWith('../');
          if (!isRelative && !allowedImportsSet.has(importPath)) {
            diagnostics.push({
              severity: 'error',
              code: 'UNAPPROVED_MODULE',
              message: `Module "${importPath}" is not approved for engine "${engine.id}". Allowed: ${engine.allowedImports.join(', ')}`,
              line: loc.line + 1,
              column: loc.character + 1,
              file: fileName,
              suggestedFix: `Remove "${importPath}". Slopboy cartridges cannot use unapproved npm packages.`,
            });
          }
        }
      }
    }

    // CommonJS import = require
    if (ts.isImportEqualsDeclaration(node)) {
      const loc = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      diagnostics.push({
        severity: 'error',
        code: 'COMMONJS_IMPORT_FORBIDDEN',
        message: "CommonJS 'import = require(...)' syntax is forbidden.",
        line: loc.line + 1,
        column: loc.character + 1,
        file: fileName,
        suggestedFix: "Use standard ES Module import syntax: import ... from '...';",
      });
    }

    // Dynamic import()
    if (node.kind === ts.SyntaxKind.ImportKeyword && node.parent && ts.isCallExpression(node.parent)) {
      const loc = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      diagnostics.push({
        severity: 'error',
        code: 'DYNAMIC_IMPORT_FORBIDDEN',
        message: "Dynamic 'import(...)' calls are forbidden in cartridges.",
        line: loc.line + 1,
        column: loc.character + 1,
        file: fileName,
        suggestedFix: 'Declare all imports statically at the top of the file.',
      });
    }

    // Forbidden identifiers (window, document, fetch, etc.)
    if (ts.isIdentifier(node)) {
      const name = node.text;
      const forbidden = FORBIDDEN_IDENTIFIERS_INFO[name];
      if (forbidden) {
        // Exclude property access like obj.window
        const isPropAccess = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
        if (!isPropAccess) {
          const loc = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          diagnostics.push({
            severity: 'error',
            code: forbidden.code,
            message: forbidden.desc,
            line: loc.line + 1,
            column: loc.character + 1,
            file: fileName,
            suggestedFix: forbidden.fix,
          });
        }
      }
    }

    // Export check
    if (ts.isExportAssignment(node) || ts.isExportDeclaration(node)) {
      hasExport = true;
    }
    if (ts.canHaveModifiers(node)) {
      const modifiers = ts.getModifiers(node);
      if (modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        hasExport = true;
      }
    }

    ts.forEachChild(node, walk);
  }

  walk(sourceFile);

  if (!hasExport) {
    diagnostics.push({
      severity: 'error',
      code: 'MISSING_EXPORT',
      message: 'Cartridge source must export at least one lifecycle function or default export.',
      file: fileName,
      suggestedFix: "Add 'export default createGame;' or 'export default game;' at the end of the file.",
    });
  }

  return diagnostics;
}

/**
 * Validates cartridge source and manifest, producing an actionable report for AI agents.
 */
export function validateGameSource(options: {
  engineId: string;
  sourceCode: string;
  manifest?: Partial<CartridgeManifestV2>;
}): ValidationReport {
  const desc = getEngineDescriptor(options.engineId);
  const diagnostics: AgentDiagnostic[] = [];

  if (!desc) {
    diagnostics.push({
      severity: 'error',
      code: 'UNKNOWN_ENGINE',
      message: `Unknown engine "${options.engineId}". Allowed engines: ${Object.keys(ENGINE_REGISTRY).join(', ')}`,
      suggestedFix: `Choose an approved engine: ${Object.keys(ENGINE_REGISTRY).join(', ')}.`,
    });
    return {
      valid: false,
      engineId: options.engineId,
      diagnostics,
      errorCount: 1,
      warningCount: 0,
      summary: `Validation failed: unknown engine "${options.engineId}".`,
    };
  }

  // Validate manifest if provided
  if (options.manifest) {
    try {
      validateManifestV2(options.manifest);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof ManifestError ? err.code : 'MANIFEST_INVALID';
      diagnostics.push({
        severity: 'error',
        code: `MANIFEST_${code}`,
        message: msg,
        file: 'manifest.json',
        suggestedFix: 'Ensure manifest satisfies CartridgeManifestV2 schema with immutable UUIDs and relative paths.',
      });
    }
  }

  // Validate source code
  const sourceDiagnostics = scanSourceDiagnostics(options.sourceCode, desc);
  diagnostics.push(...sourceDiagnostics);

  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  const summary = errors.length === 0
    ? `Cartridge validation succeeded for engine "${desc.name}" (${desc.version}).`
    : `Cartridge validation failed with ${errors.length} error(s) and ${warnings.length} warning(s).`;

  return {
    valid: errors.length === 0,
    engineId: desc.id,
    diagnostics,
    errorCount: errors.length,
    warningCount: warnings.length,
    summary,
  };
}
