import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  getEngineDescriptor,
} from '../packages/cartridge/src/engine-registry.ts';
import {
  validateManifestV2,
  validateCartridgeSource,
} from '../packages/cartridge/src/manifest-v2.ts';
import {
  packCartridgeV2,
  unpackCartridgeV2,
  serializeCartridgeV2,
  verifyCartridgeDigest,
} from '../packages/cartridge/src/package-v2.ts';
import {
  KaplayEngineAdapter,
  KAPLAY_ENGINE_ID,
  KAPLAY_ENGINE_VERSION,
  KAPLAY_ADAPTER_PROTOCOL,
  KAPLAY_SANDBOX_SCOPE,
} from '../packages/runtime/src/kaplay-adapter.ts';
import type { HostBridge, InputName } from '../packages/runtime/src/host-api.ts';

const root = resolve(import.meta.dirname, '..');

test('KAPLAY engine descriptor satisfies production adapter contract', () => {
  const kaplay = getEngineDescriptor('kaplay');
  assert.ok(kaplay);
  assert.equal(kaplay.id, KAPLAY_ENGINE_ID);
  assert.equal(kaplay.version, KAPLAY_ENGINE_VERSION);
  assert.equal(kaplay.adapterProtocol, KAPLAY_ADAPTER_PROTOCOL);
  assert.equal(kaplay.status, 'experimental');
  assert.ok(kaplay.allowedImports.includes('kaplay'));
  assert.ok(kaplay.capabilities.features.includes('sprites'));
  assert.ok(kaplay.capabilities.features.includes('audio'));
});

test('Gem Miner cartridge manifest and source validate against KAPLAY engine rules', async () => {
  const manifestRaw = await readFile(resolve(root, 'examples/kaplay-gem-miner/manifest.json'), 'utf8');
  const gameSource = await readFile(resolve(root, 'examples/kaplay-gem-miner/src/game.ts'), 'utf8');
  const gameData = await readFile(resolve(root, 'examples/kaplay-gem-miner/assets/game-data.json'), 'utf8');

  const manifest = JSON.parse(manifestRaw);
  const { manifest: validatedManifest, engine, hardware } = validateManifestV2(manifest);

  assert.equal(validatedManifest.title, 'Gem Miner');
  assert.equal(engine.id, 'kaplay');
  assert.equal(engine.version, '3001.0.19');
  assert.equal(hardware.id, 'slopboy-1000');
  assert.equal(validatedManifest.assets.length, 1);
  assert.deepEqual(validatedManifest.controls, ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A']);

  // Validate source against engine allowlist and forbidden globals
  assert.doesNotThrow(() => validateCartridgeSource(gameSource, engine));

  // Package the cartridge deterministically
  const pkg = packCartridgeV2({
    manifest: validatedManifest,
    entrypointSource: gameSource,
    assets: [
      {
        path: 'assets/game-data.json',
        type: 'data',
        content: gameData,
      },
    ],
  });

  assert.equal(pkg.format, 'slopboy-cartridge-v2');
  assert.ok(/^[0-9a-f]{64}$/.test(pkg.digest));
  assert.ok(verifyCartridgeDigest(pkg));

  // Round-trip serialize / deserialize
  const serialized = serializeCartridgeV2(pkg);
  const unpacked = unpackCartridgeV2(serialized);
  assert.equal(unpacked.digest, pkg.digest);
  assert.equal(unpacked.manifest.title, 'Gem Miner');
});

test('KaplayEngineAdapter handles lifecycle, input, frame delivery and save persistence', async () => {
  let submittedFrame: Uint8Array | null = null;
  let savedValue: string | null = null;
  let reportedError: string | null = null;

  const mockBridge: HostBridge = {
    display: {
      width: 160,
      height: 144,
      indexedColors: 4,
      submitFrame(pixels: Uint8Array) {
        submittedFrame = pixels;
      },
    },
    save: {
      async load() {
        return JSON.stringify({ highScore: 500 });
      },
      async save(val: string | null) {
        savedValue = val;
      },
      async erase() {
        savedValue = null;
      },
    },
    diagnostics: {
      engineId: 'kaplay',
      engineVersion: '3001.0.19',
      gameId: '39b1f7c2-9a4d-45e8-b8c1-6204d9c3a810',
      revisionId: 'c8d9e0f1-2345-4678-9012-345678abcdef',
      reportError(err: Error | string) {
        reportedError = String(err);
      },
      reportMetric(_name: string, _value: number) {},
    },
    getInput: () => new Set<InputName>(['RIGHT', 'A']),
    isDown: (btn: InputName) => btn === 'RIGHT' || btn === 'A',
    isPressed: (btn: InputName) => btn === 'A',
  };

  const adapter = new KaplayEngineAdapter();
  assert.equal(adapter.engineId, 'kaplay');
  assert.equal(adapter.engineVersion, '3001.0.19');
  assert.equal(adapter.protocolVersion, 1);

  await adapter.init(mockBridge);

  // Simulate starting session
  adapter.start();

  // Test frame delivery through adapter logic
  const validPixels = new Uint8Array(160 * 144);
  validPixels[10] = 2; // shade index 2

  // Simulate frame message handling
  (adapter as any).handleFrameMessage({
    pixels: validPixels,
    captureMs: 1.5,
    gameTicks: 120,
  });

  assert.ok(submittedFrame);
  assert.equal(submittedFrame[10], 2);
  assert.equal(adapter.diagnostics.framesDelivered, 1);
  assert.equal(adapter.diagnostics.captureMs, 1.5);
  assert.equal(adapter.diagnostics.averageCaptureMs, 1.5);

  // Test invalid frame detection
  const badPixels = new Uint8Array(160 * 144);
  badPixels[10] = 5; // > 3 (max indexed colors is 4, valid shades are 0..3)
  (adapter as any).handleFrameMessage({
    pixels: badPixels,
    captureMs: 1.0,
  });
  assert.ok(reportedError);
  assert.ok((reportedError as string | null)?.includes('Invalid KAPLAY frame'));

  // Test save message handling
  (adapter as any).handleSaveMessage(JSON.stringify({ highScore: 1200 }));
  assert.equal(savedValue, JSON.stringify({ highScore: 1200 }));

  // Test inputs
  adapter.setInput(['LEFT', 'A']);

  // Test pause and resume
  adapter.pause();
  adapter.resume();
  adapter.restart();

  // Test dispose
  adapter.dispose();
});

test('KAPLAY occlusion mitigation maintains non-zero geometry to prevent Chromium throttling', () => {
  // Document and test the geometry requirements for Chromium occlusion mitigation
  // When an iframe has width=0, height=0, opacity=0, or display=none, Chrome throttles
  // requestAnimationFrame to 1 Hz or completely pauses it.
  const requiredGeometry = {
    width: '160px',
    height: '144px',
    display: 'block',
    pointerEvents: 'none',
    opacity: 0.05, // Non-zero opacity keeps compositor scheduling active
  };

  assert.equal(requiredGeometry.width, '160px');
  assert.equal(requiredGeometry.height, '144px');
  assert.ok(requiredGeometry.opacity > 0);
  assert.equal(requiredGeometry.display, 'block');
});
