/**
 * Slopboy Cartridge Manifest V2 and Source Validator.
 *
 * Enforces:
 * - Server-issued immutable UUID identities (gameId and revisionId separate from title).
 * - Exact approved engine descriptor matching the Engine Registry.
 * - Device profile compatibility (logical display, aspect ratio, controls).
 * - Strict local relative paths for entrypoints and declared assets.
 * - Rejection of remote imports, CDN scripts, and forbidden runtime APIs.
 */

import ts from 'typescript';
import {
  V2_DEVICE_1000,
  type V2HardwareProfile,
  type V2Button,
} from '../../hardware/src/v2.ts';
import {
  validateEngineSelection,
  type EngineDescriptor,
} from './engine-registry.ts';

export const MANIFEST_SCHEMA_VERSION = 1;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ManifestEngineDeclaration {
  readonly id: string;
  readonly version: string;
  readonly adapterProtocol: number;
}

export interface ManifestAssetDeclaration {
  readonly path: string;
  readonly type: 'image' | 'audio' | 'text' | 'data';
  readonly size?: number;
  readonly sha256?: string;
}

export interface ManifestAchievementDeclaration {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export interface CartridgeManifestV2 {
  readonly schemaVersion: 1;
  readonly gameId: string;
  readonly revisionId: string;
  readonly title: string;
  readonly deviceProfile: string;
  readonly engine: ManifestEngineDeclaration;
  readonly entrypoint: string;
  readonly assets: readonly ManifestAssetDeclaration[];
  readonly controls?: readonly V2Button[];
  readonly achievements?: readonly ManifestAchievementDeclaration[];
}

export class ManifestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ManifestError';
    this.code = code;
  }
}

const REGISTERED_HARDWARE: Readonly<Record<string, V2HardwareProfile>> = Object.freeze({
  [V2_DEVICE_1000.id]: V2_DEVICE_1000,
});

const ENTRYPOINT_PATH = /^src\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:ts|js|mjs)$/;
const ASSET_PATH = /^assets\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.[a-zA-Z0-9]+$/;
const FORBIDDEN_IDENTIFIERS = new Set([
  'window', 'document', 'globalThis', 'self', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'Worker', 'SharedWorker', 'importScripts', 'eval', 'Function', 'localStorage',
  'sessionStorage', 'navigator', 'location', 'process', 'require', 'Deno', 'Bun'
]);

function check(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ManifestError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(obj: Record<string, unknown>, allowed: string[], context: string): void {
  const unexpected = Object.keys(obj).filter(k => !allowed.includes(k));
  if (unexpected.length > 0) {
    throw new ManifestError('SCHEMA', `${context} contains unexpected fields: ${unexpected.join(', ')}`);
  }
}

export function validateManifestV2(value: unknown): {
  manifest: CartridgeManifestV2;
  engine: EngineDescriptor;
  hardware: V2HardwareProfile;
} {
  check(isRecord(value), 'SCHEMA', 'Cartridge manifest must be a JSON object');
  onlyKeys(value, [
    'schemaVersion', 'gameId', 'revisionId', 'title', 'deviceProfile',
    'engine', 'entrypoint', 'assets', 'controls', 'achievements'
  ], 'Cartridge manifest');

  // Schema version
  check(value.schemaVersion === MANIFEST_SCHEMA_VERSION, 'SCHEMA',
    `Unsupported schemaVersion "${String(value.schemaVersion)}". Expected ${MANIFEST_SCHEMA_VERSION}`);

  // Game UUID
  check(typeof value.gameId === 'string' && UUID_PATTERN.test(value.gameId),
    'IDENTITY', 'gameId must be an immutable UUID v4 string');

  // Revision UUID
  check(typeof value.revisionId === 'string' && UUID_PATTERN.test(value.revisionId),
    'IDENTITY', 'revisionId must be an immutable UUID v4 string');

  check(value.gameId !== value.revisionId, 'IDENTITY',
    'gameId and revisionId must be distinct immutable UUIDs');

  // Title
  check(typeof value.title === 'string' && value.title.trim().length > 0 && value.title.length <= 80,
    'TITLE', 'title must be a non-empty string between 1 and 80 characters');

  // Device profile
  check(typeof value.deviceProfile === 'string', 'DEVICE', 'deviceProfile must be a string');
  const hardware = REGISTERED_HARDWARE[value.deviceProfile];
  check(hardware, 'DEVICE', `Unknown deviceProfile "${value.deviceProfile}". Registered profiles: ${Object.keys(REGISTERED_HARDWARE).join(', ')}`);

  // Engine specification
  check(isRecord(value.engine), 'SCHEMA', 'engine must be an object');
  onlyKeys(value.engine, ['id', 'version', 'adapterProtocol'], 'engine');
  check(typeof value.engine.id === 'string', 'ENGINE', 'engine.id must be a string');
  check(typeof value.engine.version === 'string', 'ENGINE', 'engine.version must be a string');
  check(typeof value.engine.adapterProtocol === 'number' && Number.isInteger(value.engine.adapterProtocol),
    'ENGINE', 'engine.adapterProtocol must be an integer');

  const engine = validateEngineSelection({
    id: value.engine.id,
    version: value.engine.version,
    adapterProtocol: value.engine.adapterProtocol,
  });

  // Entrypoint
  check(typeof value.entrypoint === 'string', 'ENTRYPOINT', 'entrypoint must be a string');
  check(!value.entrypoint.includes('..') && !value.entrypoint.startsWith('/') && !value.entrypoint.includes(':'),
    'ENTRYPOINT', 'entrypoint cannot traverse directories or include URL protocols');
  check(ENTRYPOINT_PATH.test(value.entrypoint), 'ENTRYPOINT',
    'entrypoint must be a relative path in src/ (e.g. "src/game.ts" or "src/game.js")');
  const extensionMatch = value.entrypoint.match(/\.[a-zA-Z0-9]+$/);
  const ext = extensionMatch ? extensionMatch[0] : '';
  check(engine.entrypointExtensions.includes(ext), 'ENTRYPOINT',
    `Engine "${engine.id}" does not accept entrypoint extension "${ext}". Allowed: ${engine.entrypointExtensions.join(', ')}`);

  // Assets
  check(Array.isArray(value.assets), 'ASSETS', 'assets must be an array');
  const assetPaths = new Set<string>();
  const validatedAssets: ManifestAssetDeclaration[] = [];

  for (const item of value.assets) {
    check(isRecord(item), 'ASSETS', 'Each asset must be an object');
    onlyKeys(item, ['path', 'type', 'size', 'sha256'], 'asset');
    check(typeof item.path === 'string', 'ASSET_PATH', 'Asset path must be a string');
    check(!item.path.includes('..') && !item.path.startsWith('/') && !item.path.includes(':'),
      'ASSET_PATH', 'Asset path cannot traverse directories or include URL schemes');
    check(ASSET_PATH.test(item.path), 'ASSET_PATH',
      'Asset path must be relative in assets/ (e.g. "assets/player.png")');

    const lowerPath = item.path.toLowerCase();
    check(!assetPaths.has(lowerPath), 'ASSET_PATH', `Duplicate asset path: "${item.path}"`);
    assetPaths.add(lowerPath);

    check(typeof item.type === 'string' && ['image', 'audio', 'text', 'data'].includes(item.type),
      'ASSETS', `Invalid asset type "${String(item.type)}". Allowed: image, audio, text, data`);

    if (item.size !== undefined) {
      check(typeof item.size === 'number' && Number.isInteger(item.size) && item.size >= 0,
        'ASSETS', 'Asset size must be a non-negative integer');
    }
    if (item.sha256 !== undefined) {
      check(typeof item.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(item.sha256),
        'ASSETS', 'Asset sha256 must be a 64-character hexadecimal string');
    }

    validatedAssets.push({
      path: item.path,
      type: item.type as ManifestAssetDeclaration['type'],
      size: item.size as number | undefined,
      sha256: item.sha256 as string | undefined,
    });
  }

  // Controls (optional)
  let controls: V2Button[] | undefined = undefined;
  if (value.controls !== undefined) {
    check(Array.isArray(value.controls), 'CONTROLS', 'controls must be an array of buttons');
    const seenButtons = new Set<string>();
    controls = [];
    for (const btn of value.controls) {
      check(typeof btn === 'string' && (hardware.inputs as readonly string[]).includes(btn),
        'CONTROLS', `Button "${String(btn)}" is not supported by deviceProfile "${hardware.id}"`);
      check(!seenButtons.has(btn), 'CONTROLS', `Duplicate button in controls: "${btn}"`);
      seenButtons.add(btn);
      controls.push(btn as V2Button);
    }
  }

  // Achievements (optional)
  let achievements: ManifestAchievementDeclaration[] | undefined = undefined;
  if (value.achievements !== undefined) {
    check(Array.isArray(value.achievements), 'ACHIEVEMENTS', 'achievements must be an array');
    check(value.achievements.length <= 24, 'ACHIEVEMENTS', 'Maximum 24 achievements allowed per cartridge');
    const seenAch = new Set<string>();
    achievements = [];
    for (const ach of value.achievements) {
      check(isRecord(ach), 'ACHIEVEMENTS', 'Each achievement must be an object');
      onlyKeys(ach, ['id', 'title', 'description'], 'achievement');
      check(typeof ach.id === 'string' && /^[a-z0-9_-]{1,40}$/.test(ach.id),
        'ACHIEVEMENTS', 'Achievement ID must be alphanumeric/hyphens/underscores up to 40 characters');
      check(!seenAch.has(ach.id), 'ACHIEVEMENTS', `Duplicate achievement ID: "${ach.id}"`);
      seenAch.add(ach.id);
      check(typeof ach.title === 'string' && ach.title.trim().length > 0 && ach.title.length <= 60,
        'ACHIEVEMENTS', 'Achievement title must be between 1 and 60 characters');
      check(typeof ach.description === 'string' && ach.description.length <= 160,
        'ACHIEVEMENTS', 'Achievement description cannot exceed 160 characters');
      achievements.push({
        id: ach.id,
        title: ach.title,
        description: ach.description,
      });
    }
  }

  const manifest: CartridgeManifestV2 = {
    schemaVersion: 1,
    gameId: value.gameId,
    revisionId: value.revisionId,
    title: value.title.trim(),
    deviceProfile: value.deviceProfile,
    engine: {
      id: engine.id,
      version: engine.version,
      adapterProtocol: engine.adapterProtocol,
    },
    entrypoint: value.entrypoint,
    assets: Object.freeze(validatedAssets),
    controls: controls ? Object.freeze(controls) : undefined,
    achievements: achievements ? Object.freeze(achievements) : undefined,
  };

  return { manifest, engine, hardware };
}

/**
 * Validates cartridge source code against engine import rules and forbidden runtime globals.
 * Framework validation is an authoring and packaging gate, NOT a security sandbox.
 */
export function validateCartridgeSource(source: string, engine: EngineDescriptor): void {
  check(typeof source === 'string' && source.trim().length > 0, 'CODE_PARSE', 'Game source cannot be empty');
  const ast = ts.createSourceFile('game.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const parseErrors = (ast as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics || [];
  check(parseErrors.length === 0, 'CODE_PARSE', 'Game source contains syntax errors');

  let hasExport = false;
  const allowedSet = new Set(engine.allowedImports);

  function walk(node: ts.Node): void {
    // Check imports
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const importPath = moduleSpecifier.text;
        // Disallow remote imports (http:, https:, etc.)
        if (importPath.includes(':') || importPath.startsWith('//')) {
          throw new ManifestError('CODE_IMPORT', `Remote import "${importPath}" is forbidden`);
        }
        // Allow relative internal imports or allowed framework modules
        const isRelative = importPath.startsWith('./') || importPath.startsWith('../');
        if (!isRelative && !allowedSet.has(importPath)) {
          throw new ManifestError(
            'CODE_IMPORT',
            `Import "${importPath}" is not allowed for engine "${engine.id}". Allowed: ${engine.allowedImports.join(', ')}`
          );
        }
      }
    }

    if (ts.isImportEqualsDeclaration(node)) {
      throw new ManifestError('CODE_IMPORT', 'import = requires is forbidden');
    }

    // Dynamic import keyword check
    if (node.kind === ts.SyntaxKind.ImportKeyword && node.parent && ts.isCallExpression(node.parent)) {
      throw new ManifestError('CODE_IMPORT', 'Dynamic import() is forbidden in cartridge code');
    }

    // Forbidden identifiers (window, fetch, etc.)
    if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIERS.has(node.text)) {
      // Don't trip on property access like `foo.window`
      const isPropertyAccess = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
      if (!isPropertyAccess) {
        throw new ManifestError('CODE_API', `Direct access to "${node.text}" is forbidden in game cartridges`);
      }
    }

    // Check for exports
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

  walk(ast);
  check(hasExport, 'CODE_ENTRY', 'Cartridge source must export at least one lifecycle function or default export');
}
