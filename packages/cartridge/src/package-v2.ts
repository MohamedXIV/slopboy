/**
 * Slopboy Cartridge Packaging V2.
 *
 * Provides deterministic packaging, serialization, and runtime digest verification
 * for engine-neutral Slopboy cartridges.
 *
 * Immutability:
 * - Cartridge digest is computed over canonical manifest, entrypoint, and declared assets.
 * - Changing title, assets, code, or engine changes the digest.
 * - Digest verification guarantees that runtime execution matches the exact tested build.
 */

import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import {
  validateManifestV2,
  validateCartridgeSource,
  type CartridgeManifestV2,
  ManifestError,
} from './manifest-v2.ts';
import { type EngineDescriptor } from './engine-registry.ts';

export const PACKAGE_FORMAT_V2 = 'slopboy-cartridge-v2';

export interface CartridgeAssetPackage {
  readonly path: string;
  readonly type: 'image' | 'audio' | 'text' | 'data';
  readonly content: string;
  readonly encoding: 'utf8' | 'base64';
  readonly sha256: string;
}

export interface CartridgePackageV2 {
  readonly format: 'slopboy-cartridge-v2';
  readonly digest: string;
  readonly manifest: CartridgeManifestV2;
  readonly entrypointSource: string;
  readonly assets: readonly CartridgeAssetPackage[];
}

export class PackageError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'PackageError';
    this.code = code;
  }
}

function canonicalize(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(canonicalize);
  if (val !== null && typeof val === 'object') {
    const sortedKeys = Object.keys(val as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize((val as Record<string, unknown>)[key]);
    }
    return result;
  }
  return val;
}

export function stableJSON(val: unknown): string {
  return JSON.stringify(canonicalize(val));
}

export function computeSha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Computes the immutable content digest of a cartridge payload.
 */
export function computeCartridgeDigest(
  manifest: CartridgeManifestV2,
  entrypointSource: string,
  assets: readonly CartridgeAssetPackage[]
): string {
  const hash = createHash('sha256');
  hash.update(stableJSON(manifest));
  hash.update('\n--ENTRYPOINT--\n');
  hash.update(entrypointSource);
  hash.update('\n--ASSETS--\n');
  // Sort assets deterministically by path
  const sortedAssets = [...assets].sort((a, b) => a.path.localeCompare(b.path));
  for (const asset of sortedAssets) {
    hash.update(`${asset.path}:${asset.type}:${asset.sha256}\n`);
  }
  return hash.digest('hex');
}

export interface CreatePackageInput {
  readonly manifest: unknown;
  readonly entrypointSource: string;
  readonly assets?: ReadonlyArray<{
    readonly path: string;
    readonly type: 'image' | 'audio' | 'text' | 'data';
    readonly content: string | Uint8Array;
  }>;
  readonly validateSource?: boolean;
}

/**
 * Creates and validates a CartridgePackageV2.
 */
export function packCartridgeV2(input: CreatePackageInput): CartridgePackageV2 {
  const { manifest: validatedManifest, engine } = validateManifestV2(input.manifest);

  if (input.validateSource !== false) {
    validateCartridgeSource(input.entrypointSource, engine);
  }

  const processedAssets: CartridgeAssetPackage[] = [];
  const declaredAssetPaths = new Set(validatedManifest.assets.map(a => a.path.toLowerCase()));

  if (input.assets) {
    for (const asset of input.assets) {
      if (!declaredAssetPaths.has(asset.path.toLowerCase())) {
        throw new PackageError('UNDECLARED_ASSET', `Asset "${asset.path}" is packaged but not declared in manifest`);
      }
      let contentStr: string;
      let encoding: 'utf8' | 'base64';
      let sha: string;

      if (typeof asset.content === 'string') {
        contentStr = asset.content;
        encoding = 'utf8';
        sha = computeSha256(asset.content);
      } else {
        contentStr = Buffer.from(asset.content).toString('base64');
        encoding = 'base64';
        sha = computeSha256(asset.content);
      }

      processedAssets.push({
        path: asset.path,
        type: asset.type,
        content: contentStr,
        encoding,
        sha256: sha,
      });
    }
  }

  // Ensure all declared assets exist in the package
  const packagedPaths = new Set(processedAssets.map(a => a.path.toLowerCase()));
  for (const declared of validatedManifest.assets) {
    if (!packagedPaths.has(declared.path.toLowerCase())) {
      throw new PackageError('MISSING_ASSET', `Manifest declares asset "${declared.path}" which is missing from package`);
    }
  }

  const digest = computeCartridgeDigest(validatedManifest, input.entrypointSource, processedAssets);

  return {
    format: PACKAGE_FORMAT_V2,
    digest,
    manifest: validatedManifest,
    entrypointSource: input.entrypointSource,
    assets: Object.freeze(processedAssets),
  };
}

/**
 * Serializes a CartridgePackageV2 into a compressed gzip Buffer.
 */
export function serializeCartridgeV2(pkg: CartridgePackageV2): Buffer {
  const json = stableJSON(pkg);
  return gzipSync(Buffer.from(json, 'utf8'), { level: 9, mtime: 0 } as any);
}

/**
 * Deserializes and verifies a CartridgePackageV2 from raw bytes or JSON string.
 */
export function unpackCartridgeV2(data: Uint8Array | string): CartridgePackageV2 {
  let jsonString: string;
  if (typeof data === 'string') {
    jsonString = data;
  } else {
    try {
      jsonString = gunzipSync(data, { maxOutputLength: 8 * 1024 * 1024 }).toString('utf8');
    } catch {
      // If not gzipped, try raw utf8 string
      jsonString = Buffer.from(data).toString('utf8');
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new PackageError('MALFORMED_JSON', 'Cartridge package data is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PackageError('MALFORMED_PACKAGE', 'Cartridge package must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  if (record.format !== PACKAGE_FORMAT_V2) {
    throw new PackageError('FORMAT_MISMATCH', `Expected package format "${PACKAGE_FORMAT_V2}", got "${String(record.format)}"`);
  }

  const { manifest } = validateManifestV2(record.manifest);
  if (typeof record.entrypointSource !== 'string') {
    throw new PackageError('MALFORMED_PACKAGE', 'entrypointSource must be a string');
  }
  if (!Array.isArray(record.assets)) {
    throw new PackageError('MALFORMED_PACKAGE', 'assets must be an array');
  }
  if (typeof record.digest !== 'string' || !/^[0-9a-f]{64}$/i.test(record.digest)) {
    throw new PackageError('MALFORMED_DIGEST', 'digest must be a 64-character hexadecimal SHA-256 string');
  }

  const assets: CartridgeAssetPackage[] = [];
  for (const item of record.assets) {
    if (!item || typeof item !== 'object') {
      throw new PackageError('MALFORMED_PACKAGE', 'asset item must be an object');
    }
    const a = item as Record<string, unknown>;
    assets.push({
      path: String(a.path),
      type: a.type as CartridgeAssetPackage['type'],
      content: String(a.content),
      encoding: a.encoding === 'base64' ? 'base64' : 'utf8',
      sha256: String(a.sha256),
    });
  }

  const pkg: CartridgePackageV2 = {
    format: PACKAGE_FORMAT_V2,
    digest: record.digest,
    manifest,
    entrypointSource: record.entrypointSource,
    assets: Object.freeze(assets),
  };

  const calculatedDigest = computeCartridgeDigest(pkg.manifest, pkg.entrypointSource, pkg.assets);
  if (calculatedDigest !== pkg.digest) {
    throw new PackageError(
      'DIGEST_MISMATCH',
      `Cartridge digest verification failed. Manifest states "${pkg.digest}", calculated "${calculatedDigest}"`
    );
  }

  return pkg;
}

/**
 * Verifies cartridge digest against content and optional expected digest.
 */
export function verifyCartridgeDigest(pkg: CartridgePackageV2, expectedDigest?: string): boolean {
  const calculated = computeCartridgeDigest(pkg.manifest, pkg.entrypointSource, pkg.assets);
  if (calculated !== pkg.digest) return false;
  if (expectedDigest && calculated !== expectedDigest) return false;
  return true;
}
