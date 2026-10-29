/** v0 deterministic packer and validator. DOES NOT execute game code. */
import { gzipSync, gunzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import ts from 'typescript';
import { getHardware, type HardwareProfile } from '../../hardware/src/index.ts';

export interface Manifest {
  id: string;
  title: string;
  hardware: { id: string; version: string };
  controls: string[];
  achievements: { id: string; title: string; description: string }[];
}
export interface Asset { path: string; type: 'sprite' | 'text'; content: string }
export interface Cartridge {
  format: 'slopboy-cartridge-v0';
  manifest: Manifest;
  code: string;
  assets: Asset[];
}
export class CartridgeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(code + ': ' + message);
    this.name = 'CartridgeError';
    this.code = code;
  }
}
const FORMAT = 'slopboy-cartridge-v0';
const MAX_COMPRESSED = 512 * 1024;
const MAX_EXPANDED = 2 * 1024 * 1024;
const ASSET_PATH = /^assets\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.[a-zA-Z0-9]+$/;
const FORBIDDEN = new Set([
  'window','document','globalThis','self','fetch','XMLHttpRequest','WebSocket',
  'Worker','SharedWorker','importScripts','eval','Function','localStorage',
  'sessionStorage','navigator','location','process','require','Deno','Bun'
]);
function check(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new CartridgeError(code, message);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function onlyKeys(obj: Record<string,unknown>, allowed: string[], where: string): void {
  check(Object.keys(obj).every(k => allowed.includes(k)), 'SCHEMA', where + ' has unknown fields');
}
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (isRecord(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
  return v;
}
function stableJSON(v: unknown): string { return JSON.stringify(canonical(v)); }

export function validateManifest(value: unknown): {manifest: Manifest; hardware: HardwareProfile} {
  check(isRecord(value), 'SCHEMA', 'manifest must be an object');
  onlyKeys(value, ['id','title','hardware','controls','achievements'], 'manifest');
  check(typeof value.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id) && value.id.length <= 64, 'SCHEMA', 'invalid id');
  check(typeof value.title === 'string' && value.title.trim().length > 0 && value.title.length <= 80, 'SCHEMA', 'invalid title');
  check(isRecord(value.hardware), 'SCHEMA', 'missing hardware');
  onlyKeys(value.hardware, ['id','version'], 'hardware');
  check(typeof value.hardware.id === 'string' && typeof value.hardware.version === 'string', 'SCHEMA', 'invalid hardware');
  const hardware = getHardware(value.hardware.id, value.hardware.version);
  check(hardware, 'HARDWARE', 'unknown hardware ID or version');
  check(Array.isArray(value.controls) && value.controls.length <= hardware.input.buttons.length &&
    value.controls.every((v: unknown) => typeof v === 'string' && hardware.input.buttons.includes(v as never)), 'INPUT', 'unsupported controls');
  check(new Set(value.controls).size === value.controls.length, 'INPUT', 'duplicate control');
  check(Array.isArray(value.achievements) && value.achievements.length <= 24, 'SCHEMA', 'too many achievements');
  const ids = new Set<string>();
  for (const ach of value.achievements) {
    check(isRecord(ach), 'SCHEMA', 'invalid achievement');
    onlyKeys(ach, ['id','title','description'], 'achievement');
    check(typeof ach.id === 'string' && /^[a-z0-9-]{1,40}$/.test(ach.id), 'SCHEMA', 'invalid achievement id');
    check(typeof ach.title === 'string' && ach.title.length > 0 && ach.title.length <= 60, 'SCHEMA', 'invalid achievement title');
    check(typeof ach.description === 'string' && ach.description.length <= 160, 'SCHEMA', 'invalid achievement description');
    check(!ids.has(ach.id), 'SCHEMA', 'duplicate achievement');
    ids.add(ach.id);
  }
  return {manifest: value as unknown as Manifest, hardware};
}

function inspect(code: string, bytesLimit: number): void {
  check(Buffer.byteLength(code, 'utf8') <= bytesLimit, 'CODE_SIZE', 'code budget exceeded');
  const ast = ts.createSourceFile('game.js', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const parseErrors = (ast as ts.SourceFile & {parseDiagnostics?: readonly ts.Diagnostic[]}).parseDiagnostics || [];
  check(parseErrors.length === 0, 'CODE_PARSE', 'invalid JavaScript');
  let hasDefault = false;
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node) || node.kind === ts.SyntaxKind.ImportKeyword) {
      throw new CartridgeError('CODE_IMPORT', 'runtime imports and re-exports forbidden');
    }
    if (ts.isIdentifier(node) && FORBIDDEN.has(node.text)) throw new CartridgeError('CODE_API', node.text + ' is forbidden');
    if (ts.isExportAssignment(node) && !node.isExportEquals) hasDefault = true;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  check(hasDefault, 'CODE_ENTRY', 'default export required');
}

function validateAssets(raw: unknown, hardware: HardwareProfile): Asset[] {
  check(Array.isArray(raw) && raw.length <= hardware.budgets.maxFiles, 'ASSETS', 'too many asset files');
  const paths = new Set<string>();
  let total = 0;
  for (const asset of raw) {
    check(isRecord(asset), 'ASSETS', 'asset must be an object');
    onlyKeys(asset, ['path','type','content'], 'asset');
    check(typeof asset.path === 'string' && ASSET_PATH.test(asset.path), 'ASSET_PATH', 'invalid or traversing path');
    check(!paths.has(asset.path.toLowerCase()), 'ASSET_PATH', 'duplicate case-insensitive path');
    paths.add(asset.path.toLowerCase());
    check((asset.type === 'sprite' || asset.type === 'text') && typeof asset.content === 'string', 'ASSETS', 'unsupported asset type');
    total += Buffer.byteLength(asset.content, 'utf8');
    check(total <= hardware.budgets.extractedBytes, 'ASSETS', 'asset bytes exceeded');
    if (asset.type === 'sprite') {
      check(asset.path.endsWith('.json'), 'ASSETS', 'sprite must be JSON');
      let sprite: unknown;
      try { sprite = JSON.parse(asset.content); } catch { throw new CartridgeError('ASSETS', 'invalid sprite JSON'); }
      check(isRecord(sprite) && Number.isInteger(sprite.width) && Number.isInteger(sprite.height) &&
        (sprite.width as number) > 0 && (sprite.width as number) <= 64 &&
        (sprite.height as number) > 0 && (sprite.height as number) <= 64, 'ASSETS', 'invalid sprite dimensions');
      check(Array.isArray(sprite.pixels) &&
        sprite.pixels.length === (sprite.width as number) * (sprite.height as number), 'ASSETS', 'pixel count mismatch');
      check(sprite.pixels.every((v: unknown) => Number.isInteger(v) && (v as number) >= 0 &&
        (v as number) < hardware.display.indexedColors), 'PALETTE', 'sprite exceeds color budget');
    } else {
      check(asset.path.endsWith('.txt') && Buffer.byteLength(asset.content,'utf8') <= 16*1024, 'ASSETS', 'invalid text asset');
    }
  }
  return raw as Asset[];
}

export function validateCartridge(value: unknown): Cartridge {
  check(isRecord(value), 'SCHEMA', 'cartridge must be an object');
  onlyKeys(value, ['format','manifest','code','assets'], 'cartridge');
  check(value.format === FORMAT, 'FORMAT', 'unknown cartridge version');
  const {manifest,hardware} = validateManifest(value.manifest);
  check(typeof value.code === 'string', 'CODE_PARSE', 'missing game code');
  inspect(value.code, hardware.budgets.codeBytes);
  const assets = validateAssets(value.assets, hardware);
  check(Buffer.byteLength(stableJSON(value),'utf8') <= hardware.budgets.extractedBytes, 'EXPANDED_SIZE', 'unpacked data exceeds profile');
  return {format: FORMAT,manifest,code:value.code,assets};
}

export function packCartridge(value: unknown): Buffer {
  const validated = validateCartridge(value);
  const data = Buffer.from(stableJSON(validated),'utf8');
  const compressed = gzipSync(data, {level:9,mtime:0} as any);
  check(compressed.byteLength <= MAX_COMPRESSED, 'COMPRESSED_SIZE', 'package too large');
  return compressed;
}

export function unpackCartridge(data: Uint8Array): Cartridge {
  check(data.byteLength > 0 && data.byteLength <= MAX_COMPRESSED, 'COMPRESSED_SIZE', 'invalid package length');
  let uncompressed: Buffer;
  try { uncompressed = gunzipSync(data, {maxOutputLength:MAX_EXPANDED+1}); }
  catch { throw new CartridgeError('EXPANDED_SIZE', 'corrupt or excessively expanded archive'); }
  check(uncompressed.byteLength <= MAX_EXPANDED, 'EXPANDED_SIZE', 'archive too large after decompressing');
  let value: unknown;
  try { value = JSON.parse(uncompressed.toString('utf8')); }
  catch { throw new CartridgeError('FORMAT', 'invalid package JSON'); }
  const validated = validateCartridge(value);
  const hardware = getHardware(validated.manifest.hardware.id,validated.manifest.hardware.version)!;
  check(data.byteLength <= hardware.budgets.compressedBytes, 'COMPRESSED_SIZE', 'hardware package limit exceeded');
  return validated;
}

/** Source compiler for prototype authoring, not an execution sandbox or TypeScript type checker. */
export function compileGameSource(source: string): string {
  const ast = ts.createSourceFile('game.ts',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
  const errors = (ast as ts.SourceFile & {parseDiagnostics?: readonly ts.Diagnostic[]}).parseDiagnostics || [];
  check(errors.length === 0, 'CODE_PARSE', 'invalid TypeScript source');
  function scan(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const target = node.moduleSpecifier;
      check(!!node.importClause?.isTypeOnly && ts.isStringLiteral(target) && target.text === '@slopboy/sdk',
        'CODE_IMPORT','only type imports from @slopboy/sdk allowed');
    }
    if (ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node) || node.kind === ts.SyntaxKind.ImportKeyword) {
      throw new CartridgeError('CODE_IMPORT','runtime imports and re-exports forbidden');
    }
    if (ts.isIdentifier(node) && FORBIDDEN.has(node.text)) throw new CartridgeError('CODE_API',node.text+' is forbidden');
    ts.forEachChild(node,scan);
  }
  scan(ast);
  const result = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,removeComments:true,newLine:ts.NewLineKind.LineFeed},fileName:'game.ts',reportDiagnostics:true});
  check(!result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error), 'CODE_PARSE','TypeScript transpile failed');
  inspect(result.outputText,64*1024);
  return result.outputText;
}
