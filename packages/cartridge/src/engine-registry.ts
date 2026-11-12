/**
 * Slopboy Engine Registry.
 *
 * Defines approved, version-pinned game engines and their capabilities.
 * Framework validation is not a security sandbox; it provides deterministic,
 * versioned API and lifecycle boundaries for AI-generated and human-authored cartridges.
 *
 * Device hardware limits (logical resolution, indexed colors, aspect ratio, controls)
 * are separate from engine capabilities and host storage quotas.
 */

export type EngineId = 'kaplay' | 'phaser' | 'pixi' | 'pixel-v1';
export type EngineStatus = 'approved' | 'experimental' | 'planned' | 'compatibility';

export interface EngineCapabilities {
  readonly renderer: 'webgl' | 'webgl2' | 'canvas2d';
  readonly inputProtocol: 'actions-v1';
  readonly saveProtocol: 'envelope-v2';
  readonly maxDisplayWidth: number;
  readonly maxDisplayHeight: number;
  readonly supportedColorDepths: readonly number[];
  readonly features: readonly string[];
}

export interface EngineDescriptor {
  readonly id: EngineId;
  readonly name: string;
  readonly version: string;
  readonly adapterProtocol: number;
  readonly status: EngineStatus;
  readonly description: string;
  readonly entrypointExtensions: readonly string[];
  readonly allowedImports: readonly string[];
  readonly capabilities: EngineCapabilities;
}

export class EngineRegistryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'EngineRegistryError';
    this.code = code;
  }
}

/** Pinned engine versions as specified in ADR-004. Floating versions or arbitrary npm dependencies are forbidden. */
export const ENGINE_REGISTRY: Readonly<Record<EngineId, EngineDescriptor>> = Object.freeze({
  kaplay: Object.freeze({
    id: 'kaplay',
    name: 'KAPLAY',
    version: '3001.0.19',
    adapterProtocol: 1,
    status: 'experimental',
    description: 'Lightweight 2D arcade and action engine for accessible game creation',
    entrypointExtensions: ['.ts', '.js', '.mjs'] as const,
    allowedImports: ['kaplay', '@slopboy/sdk'] as const,
    capabilities: Object.freeze({
      renderer: 'webgl',
      inputProtocol: 'actions-v1',
      saveProtocol: 'envelope-v2',
      maxDisplayWidth: 512,
      maxDisplayHeight: 512,
      supportedColorDepths: [4] as const,
      features: ['2d', 'sprites', 'audio', 'keyboard-input', 'touch-input'] as const,
    }),
  }),
  phaser: Object.freeze({
    id: 'phaser',
    name: 'Phaser 4',
    version: '4.2.1',
    adapterProtocol: 1,
    status: 'planned',
    description: 'Comprehensive 2D engine with physics, tilemaps, particle systems, and scenes',
    entrypointExtensions: ['.ts', '.js'] as const,
    allowedImports: ['phaser', '@slopboy/sdk'] as const,
    capabilities: Object.freeze({
      renderer: 'webgl',
      inputProtocol: 'actions-v1',
      saveProtocol: 'envelope-v2',
      maxDisplayWidth: 512,
      maxDisplayHeight: 512,
      supportedColorDepths: [4] as const,
      features: ['2d', 'physics', 'tilemaps', 'particles', 'scenes', 'audio'] as const,
    }),
  }),
  pixi: Object.freeze({
    id: 'pixi',
    name: 'PixiJS 8',
    version: '8.21.0',
    adapterProtocol: 1,
    status: 'planned',
    description: 'High-performance 2D rendering library requiring custom gameplay kit',
    entrypointExtensions: ['.ts', '.js'] as const,
    allowedImports: ['pixi.js', '@slopboy/sdk'] as const,
    capabilities: Object.freeze({
      renderer: 'webgl2',
      inputProtocol: 'actions-v1',
      saveProtocol: 'envelope-v2',
      maxDisplayWidth: 512,
      maxDisplayHeight: 512,
      supportedColorDepths: [4] as const,
      features: ['2d-render', 'custom-shaders'] as const,
    }),
  }),
  'pixel-v1': Object.freeze({
    id: 'pixel-v1',
    name: 'Slopboy Pixel V1 Runtime',
    version: '0.1.0',
    adapterProtocol: 1,
    status: 'compatibility',
    description: 'Curated pixel-drawing runtime preserving original three games and guest saves',
    entrypointExtensions: ['.ts', '.js'] as const,
    allowedImports: ['@slopboy/sdk'] as const,
    capabilities: Object.freeze({
      renderer: 'canvas2d',
      inputProtocol: 'actions-v1',
      saveProtocol: 'envelope-v2',
      maxDisplayWidth: 160,
      maxDisplayHeight: 144,
      supportedColorDepths: [4] as const,
      features: ['pixel-drawing', 'procedural'] as const,
    }),
  }),
});

export function getEngineRegistry(): readonly EngineDescriptor[] {
  return Object.values(ENGINE_REGISTRY);
}

export function getEngineDescriptor(id: string, version?: string): EngineDescriptor | undefined {
  if (!Object.hasOwn(ENGINE_REGISTRY, id)) return undefined;
  const desc = ENGINE_REGISTRY[id as EngineId];
  if (version && desc.version !== version) return undefined;
  return desc;
}

export function isEngineApproved(id: string, version: string): boolean {
  const desc = getEngineDescriptor(id, version);
  return desc?.status === 'approved';
}

export function isEngineSupported(id: string, version?: string): boolean {
  return getEngineDescriptor(id, version) !== undefined;
}

export function validateEngineSelection(engine: {
  id: string;
  version: string;
  adapterProtocol?: number;
}): EngineDescriptor {
  if (!engine || typeof engine !== 'object') {
    throw new EngineRegistryError('ENGINE_INVALID', 'Engine specification must be an object');
  }
  if (!Object.hasOwn(ENGINE_REGISTRY, engine.id)) {
    throw new EngineRegistryError(
      'ENGINE_UNSUPPORTED',
      `Unsupported engine "${engine.id}". Allowed engines: ${Object.keys(ENGINE_REGISTRY).join(', ')}`
    );
  }
  const desc = ENGINE_REGISTRY[engine.id as EngineId];
  if (engine.version !== desc.version) {
    throw new EngineRegistryError(
      'ENGINE_VERSION_MISMATCH',
      `Engine "${engine.id}" requires exact pinned version "${desc.version}", got "${engine.version}"`
    );
  }
  if (engine.adapterProtocol !== undefined && engine.adapterProtocol !== desc.adapterProtocol) {
    throw new EngineRegistryError(
      'ENGINE_PROTOCOL_MISMATCH',
      `Engine "${engine.id}" requires adapter protocol ${desc.adapterProtocol}, got ${engine.adapterProtocol}`
    );
  }
  return desc;
}
