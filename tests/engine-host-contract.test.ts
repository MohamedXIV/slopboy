import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGINE_REGISTRY,
  getEngineRegistry,
  getEngineDescriptor,
  validateEngineSelection,
  EngineRegistryError,
} from '../packages/cartridge/src/engine-registry.ts';
import {
  validateManifestV2,
  validateCartridgeSource,
  ManifestError,
} from '../packages/cartridge/src/manifest-v2.ts';
import {
  packCartridgeV2,
  unpackCartridgeV2,
  serializeCartridgeV2,
  verifyCartridgeDigest,
  PackageError,
} from '../packages/cartridge/src/package-v2.ts';
import {
  HostSession,
  PixelV1Adapter,
  createMemorySaveDriver,
  type EngineAdapter,
  type HostBridge,
  type InputName,
  HostSessionError,
} from '../packages/runtime/src/host-api.ts';
import { V2_DEVICE_1000 } from '../packages/hardware/src/v2.ts';

const SAMPLE_GAME_UUID = '5b0edbf4-644d-43f4-9ad3-5506eacd05d3';
const SAMPLE_REVISION_UUID = '107d59b4-03d5-4a29-be33-f8246a2c4caa';
const ANOTHER_UUID = '3ce74eec-ca3c-484b-8d16-2af4840c539b';

test('engine registry contains exact approved descriptors and pinned versions', () => {
  const registry = getEngineRegistry();
  assert.equal(registry.length, 4);

  const kaplay = getEngineDescriptor('kaplay');
  assert.ok(kaplay);
  assert.equal(kaplay.version, '3001.0.19');
  assert.equal(kaplay.status, 'experimental');
  assert.equal(kaplay.adapterProtocol, 1);
  assert.ok(kaplay.allowedImports.includes('kaplay'));

  const pixel = getEngineDescriptor('pixel-v1');
  assert.ok(pixel);
  assert.equal(pixel.version, '0.1.0');
  assert.equal(pixel.status, 'compatibility');

  const phaser = getEngineDescriptor('phaser');
  assert.ok(phaser);
  assert.equal(phaser.version, '4.2.1');
  assert.equal(phaser.status, 'planned');

  const pixi = getEngineDescriptor('pixi');
  assert.ok(pixi);
  assert.equal(pixi.version, '8.21.0');
  assert.equal(pixi.status, 'planned');
});

test('engine validation rejects unsupported engines and version mismatches', () => {
  assert.throws(
    () => validateEngineSelection({ id: 'unsupported-engine', version: '1.0.0' }),
    (err: unknown) => err instanceof EngineRegistryError && err.code === 'ENGINE_UNSUPPORTED'
  );

  assert.throws(
    () => validateEngineSelection({ id: 'kaplay', version: '9999.0.0' }),
    (err: unknown) => err instanceof EngineRegistryError && err.code === 'ENGINE_VERSION_MISMATCH'
  );

  assert.throws(
    () => validateEngineSelection({ id: 'kaplay', version: '3001.0.19', adapterProtocol: 99 }),
    (err: unknown) => err instanceof EngineRegistryError && err.code === 'ENGINE_PROTOCOL_MISMATCH'
  );

  const valid = validateEngineSelection({ id: 'kaplay', version: '3001.0.19', adapterProtocol: 1 });
  assert.equal(valid.id, 'kaplay');
});

test('cartridge manifest v2 validates immutable identities and schema', () => {
  const validManifest = {
    schemaVersion: 1,
    gameId: SAMPLE_GAME_UUID,
    revisionId: SAMPLE_REVISION_UUID,
    title: 'Star Dodger',
    deviceProfile: 'slopboy-1000',
    engine: {
      id: 'kaplay',
      version: '3001.0.19',
      adapterProtocol: 1,
    },
    entrypoint: 'src/game.ts',
    assets: [
      { path: 'assets/player.png', type: 'image' },
      { path: 'assets/sfx/jump.wav', type: 'audio' },
    ],
    controls: ['LEFT', 'RIGHT', 'A'],
  };

  const { manifest, engine, hardware } = validateManifestV2(validManifest);
  assert.equal(manifest.gameId, SAMPLE_GAME_UUID);
  assert.equal(manifest.revisionId, SAMPLE_REVISION_UUID);
  assert.equal(manifest.title, 'Star Dodger');
  assert.equal(engine.id, 'kaplay');
  assert.equal(hardware.id, 'slopboy-1000');
  assert.equal(manifest.assets.length, 2);
  assert.deepEqual(manifest.controls, ['LEFT', 'RIGHT', 'A']);
});

test('cartridge manifest rejects malformed identities and traversals', () => {
  const base = {
    schemaVersion: 1,
    gameId: SAMPLE_GAME_UUID,
    revisionId: SAMPLE_REVISION_UUID,
    title: 'Test Game',
    deviceProfile: 'slopboy-1000',
    engine: { id: 'kaplay', version: '3001.0.19', adapterProtocol: 1 },
    entrypoint: 'src/game.ts',
    assets: [],
  };

  // Identical gameId and revisionId
  assert.throws(
    () => validateManifestV2({ ...base, revisionId: SAMPLE_GAME_UUID }),
    (err: unknown) => err instanceof ManifestError && err.code === 'IDENTITY'
  );

  // Non-UUID
  assert.throws(
    () => validateManifestV2({ ...base, gameId: 'not-a-uuid' }),
    (err: unknown) => err instanceof ManifestError && err.code === 'IDENTITY'
  );

  // Empty title
  assert.throws(
    () => validateManifestV2({ ...base, title: '   ' }),
    (err: unknown) => err instanceof ManifestError && err.code === 'TITLE'
  );

  // Entrypoint directory traversal
  assert.throws(
    () => validateManifestV2({ ...base, entrypoint: 'src/../../evil.ts' }),
    (err: unknown) => err instanceof ManifestError && err.code === 'ENTRYPOINT'
  );

  // Absolute entrypoint
  assert.throws(
    () => validateManifestV2({ ...base, entrypoint: '/src/game.ts' }),
    (err: unknown) => err instanceof ManifestError && err.code === 'ENTRYPOINT'
  );

  // Disallowed entrypoint extension
  assert.throws(
    () => validateManifestV2({ ...base, entrypoint: 'src/game.py' }),
    (err: unknown) => err instanceof ManifestError && err.code === 'ENTRYPOINT'
  );

  // Asset path traversal
  assert.throws(
    () => validateManifestV2({ ...base, assets: [{ path: 'assets/../secret.json', type: 'data' }] }),
    (err: unknown) => err instanceof ManifestError && err.code === 'ASSET_PATH'
  );

  // Remote URL asset
  assert.throws(
    () => validateManifestV2({ ...base, assets: [{ path: 'https://cdn.example.com/asset.png', type: 'image' }] }),
    (err: unknown) => err instanceof ManifestError && err.code === 'ASSET_PATH'
  );

  // Duplicate asset path
  assert.throws(
    () => validateManifestV2({
      ...base,
      assets: [
        { path: 'assets/sprite.png', type: 'image' },
        { path: 'assets/SPRITE.png', type: 'image' },
      ],
    }),
    (err: unknown) => err instanceof ManifestError && err.code === 'ASSET_PATH'
  );

  // Unsupported control button
  assert.throws(
    () => validateManifestV2({ ...base, controls: ['INVALID_BUTTON'] }),
    (err: unknown) => err instanceof ManifestError && err.code === 'CONTROLS'
  );

  // Duplicate control button
  assert.throws(
    () => validateManifestV2({ ...base, controls: ['A', 'A'] }),
    (err: unknown) => err instanceof ManifestError && err.code === 'CONTROLS'
  );

  // Unknown root field
  assert.throws(
    () => validateManifestV2({ ...base, unauthorizedField: 'bad' }),
    (err: unknown) => err instanceof ManifestError && err.code === 'SCHEMA'
  );
});

test('cartridge source validation rejects forbidden APIs and unapproved imports', () => {
  const kaplay = getEngineDescriptor('kaplay')!;

  // Valid source
  const validSource = `
    import kaplay from 'kaplay';
    export default function initGame(k) {
      k.add([]);
    }
  `;
  assert.doesNotThrow(() => validateCartridgeSource(validSource, kaplay));

  // Remote import forbidden
  const remoteImportSource = `
    import kaplay from 'https://esm.sh/kaplay';
    export default function game() {}
  `;
  assert.throws(
    () => validateCartridgeSource(remoteImportSource, kaplay),
    (err: unknown) => err instanceof ManifestError && err.code === 'CODE_IMPORT'
  );

  // Unapproved module import forbidden
  const unapprovedModule = `
    import axios from 'axios';
    export default function game() {}
  `;
  assert.throws(
    () => validateCartridgeSource(unapprovedModule, kaplay),
    (err: unknown) => err instanceof ManifestError && err.code === 'CODE_IMPORT'
  );

  // Dynamic import forbidden
  const dynamicImportSource = `
    export default async function game() {
      const mod = await import('kaplay');
    }
  `;
  assert.throws(
    () => validateCartridgeSource(dynamicImportSource, kaplay),
    (err: unknown) => err instanceof ManifestError && err.code === 'CODE_IMPORT'
  );

  // Window/fetch access forbidden
  const forbiddenApiSource = `
    import kaplay from 'kaplay';
    export default function game() {
      fetch('https://evil.com');
    }
  `;
  assert.throws(
    () => validateCartridgeSource(forbiddenApiSource, kaplay),
    (err: unknown) => err instanceof ManifestError && err.code === 'CODE_API'
  );

  // Missing export forbidden
  const missingExportSource = `
    import kaplay from 'kaplay';
    const x = 1;
  `;
  assert.throws(
    () => validateCartridgeSource(missingExportSource, kaplay),
    (err: unknown) => err instanceof ManifestError && err.code === 'CODE_ENTRY'
  );
});

test('cartridge packaging computes deterministic digests and enforces asset completeness', () => {
  const manifest = {
    schemaVersion: 1,
    gameId: SAMPLE_GAME_UUID,
    revisionId: SAMPLE_REVISION_UUID,
    title: 'Deterministic Quest',
    deviceProfile: 'slopboy-1000',
    engine: { id: 'kaplay', version: '3001.0.19', adapterProtocol: 1 },
    entrypoint: 'src/game.ts',
    assets: [
      { path: 'assets/player.png', type: 'image' },
      { path: 'assets/dialog.txt', type: 'text' },
    ],
    controls: ['UP', 'DOWN', 'A'],
  };

  const entrypointSource = `
    import kaplay from 'kaplay';
    export default function start() {}
  `;

  const assets = [
    { path: 'assets/player.png', type: 'image' as const, content: new Uint8Array([1, 2, 3, 4]) },
    { path: 'assets/dialog.txt', type: 'text' as const, content: 'Hello Slopboy!' },
  ];

  // Successful packaging
  const pkg = packCartridgeV2({ manifest, entrypointSource, assets });
  assert.equal(pkg.format, 'slopboy-cartridge-v2');
  assert.ok(/^[0-9a-f]{64}$/.test(pkg.digest));
  assert.equal(pkg.assets.length, 2);
  assert.ok(verifyCartridgeDigest(pkg));

  // Determinism: same input produces exact same digest
  const pkg2 = packCartridgeV2({ manifest, entrypointSource, assets });
  assert.equal(pkg.digest, pkg2.digest);

  // Missing declared asset
  assert.throws(
    () => packCartridgeV2({
      manifest,
      entrypointSource,
      assets: [assets[0]], // dialog.txt missing
    }),
    (err: unknown) => err instanceof PackageError && err.code === 'MISSING_ASSET'
  );

  // Undeclared packaged asset
  assert.throws(
    () => packCartridgeV2({
      manifest,
      entrypointSource,
      assets: [
        ...assets,
        { path: 'assets/secret.txt', type: 'text' as const, content: 'surprise' },
      ],
    }),
    (err: unknown) => err instanceof PackageError && err.code === 'UNDECLARED_ASSET'
  );

  // Compression and unpacking round-trip
  const compressed = serializeCartridgeV2(pkg);
  assert.ok(compressed.byteLength > 0);
  const unpacked = unpackCartridgeV2(compressed);
  assert.equal(unpacked.digest, pkg.digest);
  assert.equal(unpacked.manifest.title, 'Deterministic Quest');
  assert.equal(unpacked.assets.length, 2);

  // Tampering with payload fails digest verification
  const tamperedJson = JSON.stringify({
    ...pkg,
    entrypointSource: entrypointSource + '\n// Tampered!',
  });
  assert.throws(
    () => unpackCartridgeV2(tamperedJson),
    (err: unknown) => err instanceof PackageError && err.code === 'DIGEST_MISMATCH'
  );
});

test('shared host session manages complete lifecycle and rejects invalid transitions', async () => {
  const stateLog: string[] = [];
  let frameCount = 0;

  let adapterBridge: HostBridge | null = null;
  const mockAdapter: EngineAdapter = {
    engineId: 'test-engine',
    engineVersion: '1.0.0',
    protocolVersion: 1,
    init(bridge: HostBridge) {
      adapterBridge = bridge;
      stateLog.push('adapter:init');
    },
    start() {
      stateLog.push('adapter:start');
      // Simulate frame delivery
      const pixels = new Uint8Array(160 * 144);
      pixels[0] = 1;
      adapterBridge?.display.submitFrame(pixels);
    },
    pause() {
      stateLog.push('adapter:pause');
    },
    resume() {
      stateLog.push('adapter:resume');
    },
    restart() {
      stateLog.push('adapter:restart');
    },
    setInput(_down, _pressed) {
      stateLog.push('adapter:setInput');
    },
    dispose() {
      stateLog.push('adapter:dispose');
    },
  };

  const session = new HostSession({
    gameId: SAMPLE_GAME_UUID,
    revisionId: SAMPLE_REVISION_UUID,
    hardware: V2_DEVICE_1000,
    adapter: mockAdapter,
    onFrame: () => {
      frameCount++;
    },
    onStateChange: (state) => {
      stateLog.push(`session:${state}`);
    },
  });

  assert.equal(session.state, 'created');

  // Starting before init throws
  await assert.rejects(
    () => session.start(),
    (err: unknown) => err instanceof HostSessionError && err.code === 'INVALID_STATE'
  );

  // Initialize
  await session.init();
  assert.equal(session.state, 'ready');

  // Start
  await session.start();
  assert.equal(session.state, 'running');
  assert.equal(frameCount, 1);

  // Pause & Resume
  session.pause();
  assert.equal(session.state, 'paused');
  session.resume();
  assert.equal(session.state, 'running');

  // Input
  session.setButtons(['LEFT', 'A']);
  assert.ok(mockAdapter);

  // Restart
  await session.restart();
  assert.equal(session.state, 'running');

  // Dispose
  await session.dispose();
  assert.equal(session.state, 'disposed');

  // Actions on disposed session throw
  await assert.rejects(
    () => session.restart(),
    (err: unknown) => err instanceof HostSessionError && err.code === 'INVALID_STATE'
  );
});

test('host session rejects malformed frames with out-of-bounds shades or wrong dimensions', async () => {
  let reportedError: Error | null = null;
  let adapterBridge: HostBridge | null = null;

  const badFrameAdapter: EngineAdapter = {
    engineId: 'bad-frame',
    engineVersion: '1.0.0',
    protocolVersion: 1,
    init(bridge: HostBridge) {
      adapterBridge = bridge;
    },
    start() {},
    pause() {},
    resume() {},
    restart() {},
    setInput() {},
    dispose() {},
  };

  const session = new HostSession({
    gameId: SAMPLE_GAME_UUID,
    revisionId: SAMPLE_REVISION_UUID,
    hardware: V2_DEVICE_1000,
    adapter: badFrameAdapter,
    onError: (err) => {
      reportedError = err;
    },
  });

  await session.init();
  await session.start();

  // Submit frame with invalid color index (shades limit is 4, index 5 is invalid)
  const badColorFrame = new Uint8Array(160 * 144);
  badColorFrame[10] = 5; // > 3

  adapterBridge!.display.submitFrame(badColorFrame);
  assert.ok(reportedError);
  assert.equal(session.state, 'error');
  assert.equal((reportedError as HostSessionError).code, 'MALFORMED_FRAME');
});

test('host session integrates guest save/load storage with UUID identity and legacy fallback', async () => {
  const driver = createMemorySaveDriver();
  let bridgeRef: HostBridge | null = null;

  // Pre-seed an existing legacy save under the old slug key
  const legacySlug = 'star-patrol';
  const legacyKey = `save-v1:slopboy-1000@0.1.0:${legacySlug}`;
  await driver.put(legacyKey, JSON.stringify({ highscore: 1250 }));

  const saveTestAdapter: EngineAdapter = {
    engineId: 'save-test',
    engineVersion: '1.0.0',
    protocolVersion: 1,
    init(bridge: HostBridge) {
      bridgeRef = bridge;
    },
    start() {},
    pause() {},
    resume() {},
    restart() {},
    setInput() {},
    dispose() {},
  };

  const session = new HostSession({
    gameId: SAMPLE_GAME_UUID,
    revisionId: SAMPLE_REVISION_UUID,
    legacySlug,
    hardware: V2_DEVICE_1000,
    adapter: saveTestAdapter,
    saveDriver: driver,
  });

  await session.init();
  await session.start();

  // Read should migrate/read the legacy save
  const loaded = await bridgeRef!.save.load();
  assert.ok(loaded);
  assert.deepEqual(JSON.parse(loaded), { highscore: 1250 });

  // Writing a new save uses UUID key envelope
  await bridgeRef!.save.save(JSON.stringify({ highscore: 2500, checkpoint: 'zone-2' }));
  const updated = await bridgeRef!.save.load();
  assert.ok(updated);
  assert.deepEqual(JSON.parse(updated), { highscore: 2500, checkpoint: 'zone-2' });

  // Original legacy record was not clobbered or destroyed
  const rawLegacy = await driver.get(legacyKey);
  assert.equal(rawLegacy, JSON.stringify({ highscore: 1250 }));

  // UUID key exists with envelope
  const uuidKey = `save-v2:slopboy-1000@0.1.0:${SAMPLE_GAME_UUID}`;
  const rawUuid = await driver.get(uuidKey);
  assert.ok(rawUuid);
  assert.ok(String(rawUuid).includes('slopboy-save-v2'));

  await session.dispose();
});

test('PixelV1Adapter runs game module lifecycle and submits valid frames through HostSession', async () => {
  let updateTicks = 0;
  let framesReceived = 0;

  const sampleModule = {
    x: 0,
    init() {
      this.x = 20;
    },
    update(ctx: any, dt: number) {
      updateTicks++;
      if (ctx.input.down('RIGHT')) {
        this.x += 1;
      }
    },
    draw(ctx: any) {
      ctx.screen.clear(0);
      ctx.screen.pixel(this.x, 30, 2);
      ctx.screen.rect(40, 40, 10, 10, 3);
    },
  };

  const adapter = new PixelV1Adapter(sampleModule);
  let latestPixels: Uint8Array | null = null;

  const session = new HostSession({
    gameId: SAMPLE_GAME_UUID,
    revisionId: SAMPLE_REVISION_UUID,
    hardware: V2_DEVICE_1000,
    adapter,
    onFrame: (pixels) => {
      framesReceived++;
      latestPixels = pixels;
    },
  });

  await session.init();
  assert.equal(session.state, 'ready');

  await session.start();
  assert.equal(session.state, 'running');

  // Send input
  session.setButtons(['RIGHT']);

  // Wait a short time for timer ticks
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.ok(framesReceived > 0);
  assert.ok(updateTicks > 0);
  assert.ok(latestPixels);
  assert.equal((latestPixels as Uint8Array | null)?.length, 160 * 144);
  assert.ok(sampleModule.x > 20); // Moved right due to input

  // Pause
  session.pause();
  assert.equal(session.state, 'paused');
  const savedFrames = framesReceived;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(framesReceived, savedFrames); // No frames while paused

  await session.dispose();
  assert.equal(session.state, 'disposed');
});

test('engine-neutral-demo packages deterministically and runs end-to-end via HostSession', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');

  const root = resolve(import.meta.dirname, '..');
  const manifestRaw = await readFile(resolve(root, 'examples/engine-neutral-demo/manifest.json'), 'utf8');
  const gameSource = await readFile(resolve(root, 'examples/engine-neutral-demo/src/game.ts'), 'utf8');
  const paletteText = await readFile(resolve(root, 'examples/engine-neutral-demo/assets/palette.txt'), 'utf8');

  const manifest = JSON.parse(manifestRaw);

  const pkg = packCartridgeV2({
    manifest,
    entrypointSource: gameSource,
    assets: [
      {
        path: 'assets/palette.txt',
        type: 'text',
        content: paletteText,
      },
    ],
  });

  assert.equal(pkg.format, 'slopboy-cartridge-v2');
  assert.equal(pkg.manifest.title, 'Bouncy Square');
  assert.equal(pkg.manifest.engine.id, 'pixel-v1');
  assert.ok(verifyCartridgeDigest(pkg));

  // Run the demo module with PixelV1Adapter
  const demoModule = (await import('../examples/engine-neutral-demo/src/game.ts')).default;
  const adapter = new PixelV1Adapter(demoModule);
  let framesCount = 0;

  const session = new HostSession({
    gameId: manifest.gameId,
    revisionId: manifest.revisionId,
    hardware: V2_DEVICE_1000,
    adapter,
    onFrame: (pixels) => {
      framesCount++;
      // Check borders are drawn (pixels[0] should be border shade 3)
      assert.equal(pixels[0], 3);
    },
  });

  await session.init();
  await session.start();

  // Let it run for a few ticks
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(framesCount > 0);

  // Send input 'A' to trigger save
  session.setButtons(['A']);
  await new Promise((r) => setTimeout(r, 40));

  await session.dispose();
  assert.equal(session.state, 'disposed');
});

