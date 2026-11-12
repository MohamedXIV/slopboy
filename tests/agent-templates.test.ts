import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listSupportedEngines,
  getEngineCapabilities,
  recommendEngine,
  getGameTemplate,
  validateGameSource,
  scanSourceDiagnostics,
  getAgentCodingInstructions,
  validateManifestV2,
  validateCartridgeSource,
  packCartridgeV2,
  serializeCartridgeV2,
  unpackCartridgeV2,
  ENGINE_REGISTRY,
} from '../packages/cartridge/src/index.ts';

test('listSupportedEngines returns all registered engines with pinned versions and constraints', () => {
  const engines = listSupportedEngines();
  assert.equal(engines.length, 4);

  const kaplay = engines.find(e => e.id === 'kaplay');
  assert.ok(kaplay);
  assert.equal(kaplay.version, '3001.0.19');
  assert.equal(kaplay.status, 'experimental');
  assert.equal(kaplay.isProductionReady, false, 'Experimental engines must not be marked production-ready');
  assert.equal(kaplay.deviceOutput.width, 160);
  assert.equal(kaplay.deviceOutput.height, 144);
  assert.equal(kaplay.deviceOutput.colors, 4);
  assert.ok(kaplay.recommendedFor.includes('Arcade'));

  const pixel = engines.find(e => e.id === 'pixel-v1');
  assert.ok(pixel);
  assert.equal(pixel.version, '0.1.0');
  assert.equal(pixel.status, 'compatibility');
  assert.equal(pixel.isProductionReady, false);

  const phaser = engines.find(e => e.id === 'phaser');
  assert.ok(phaser);
  assert.equal(phaser.version, '4.2.1');
  assert.equal(phaser.status, 'planned');

  const pixi = engines.find(e => e.id === 'pixi');
  assert.ok(pixi);
  assert.equal(pixi.version, '8.21.0');
  assert.equal(pixi.status, 'planned');
});

test('getEngineCapabilities reports allowed imports, forbidden APIs, and hardware buttons', () => {
  const caps = getEngineCapabilities({ engineId: 'kaplay' });
  assert.equal(caps.engine.id, 'kaplay');
  assert.equal(caps.engine.version, '3001.0.19');
  assert.deepEqual(caps.allowedImports, ['kaplay', '@slopboy/sdk']);
  assert.ok(caps.forbiddenApis.includes('fetch'));
  assert.ok(caps.forbiddenApis.includes('window'));
  assert.ok(caps.forbiddenApis.includes('document'));
  assert.ok(caps.forbiddenApis.includes('localStorage'));
  assert.equal(caps.hardwareConstraints.width, 160);
  assert.equal(caps.hardwareConstraints.height, 144);
  assert.equal(caps.hardwareConstraints.buttons.length, 8);
  assert.ok(caps.hardwareConstraints.buttons.includes('A'));
  assert.ok(caps.hardwareConstraints.buttons.includes('B'));
  assert.ok(caps.hardwareConstraints.buttons.includes('LEFT'));

  assert.throws(() => {
    getEngineCapabilities({ engineId: 'unreal-engine' });
  }, /Unknown engineId/);
});

test('recommendEngine provides genre-based recommendations and alternatives', () => {
  const arcade = recommendEngine('fast 2D action arcade game with collecting items');
  assert.equal(arcade.recommendedEngine, 'kaplay');
  assert.ok(arcade.alternatives.some(a => a.engineId === 'pixel-v1'));

  const physics = recommendEngine('large RPG with complex tilemaps, physics, and multiple scenes');
  assert.equal(physics.recommendedEngine, 'phaser');

  const shader = recommendEngine('custom visual demo with WebGL shaders and filters');
  assert.equal(shader.recommendedEngine, 'pixi');

  const minimal = recommendEngine('minimal retro procedural pixel art grid');
  assert.equal(minimal.recommendedEngine, 'pixel-v1');
});

test('getGameTemplate generates valid, typed, and packable KAPLAY cartridge starter', () => {
  const tpl = getGameTemplate({
    engineId: 'kaplay',
    title: 'Star Gem Collector',
    gameId: '11111111-1111-4111-8111-111111111111',
    revisionId: '22222222-2222-4222-8222-222222222222',
  });

  assert.equal(tpl.engineId, 'kaplay');
  assert.equal(tpl.engineVersion, '3001.0.19');
  assert.equal(tpl.manifest.title, 'Star Gem Collector');
  assert.equal(tpl.manifest.gameId, '11111111-1111-4111-8111-111111111111');
  assert.equal(tpl.manifest.revisionId, '22222222-2222-4222-8222-222222222222');
  assert.ok(tpl.licenseNotice.includes('MIT License'));

  assert.ok(tpl.files['manifest.json']);
  assert.ok(tpl.files['src/game.ts']);
  assert.ok(tpl.files['README.md']);

  // Validate manifest schema
  const { manifest, engine, hardware } = validateManifestV2(tpl.manifest);
  assert.equal(manifest.title, 'Star Gem Collector');
  assert.equal(engine.id, 'kaplay');
  assert.equal(hardware.display.width, 160);

  // Validate AST source rules
  validateCartridgeSource(tpl.files['src/game.ts'], engine);

  // Validate via agent diagnostic validator
  const report = validateGameSource({
    engineId: 'kaplay',
    sourceCode: tpl.files['src/game.ts'],
    manifest: tpl.manifest,
  });
  assert.equal(report.valid, true);
  assert.equal(report.errorCount, 0);

  // Package deterministically and unpack
  const pkg = packCartridgeV2({
    manifest: tpl.manifest,
    entrypointSource: tpl.files['src/game.ts'],
  });
  const serialized = serializeCartridgeV2(pkg);
  const unpacked = unpackCartridgeV2(serialized);
  assert.equal(unpacked.manifest.title, 'Star Gem Collector');
  assert.equal(unpacked.manifest.gameId, '11111111-1111-4111-8111-111111111111');
});

test('getGameTemplate generates valid Pixel-V1 cartridge starter', () => {
  const tpl = getGameTemplate({
    engineId: 'pixel-v1',
    title: 'Retro Coin Rush',
  });

  assert.equal(tpl.engineId, 'pixel-v1');
  assert.equal(tpl.engineVersion, '0.1.0');
  assert.ok(tpl.files['src/game.ts']);

  const report = validateGameSource({
    engineId: 'pixel-v1',
    sourceCode: tpl.files['src/game.ts'],
    manifest: tpl.manifest,
  });
  assert.equal(report.valid, true);
  assert.equal(report.errorCount, 0);
});

test('validateGameSource returns actionable diagnostics on remote imports', () => {
  const badCode = `
import kaplay from 'https://esm.sh/kaplay@3001.0.19';
export default function setup(k) {}
`;
  const report = validateGameSource({
    engineId: 'kaplay',
    sourceCode: badCode,
  });

  assert.equal(report.valid, false);
  assert.ok(report.errorCount >= 1);
  const diag = report.diagnostics.find(d => d.code === 'REMOTE_IMPORT_FORBIDDEN');
  assert.ok(diag, 'Should diagnose remote import');
  assert.equal(diag.line, 2);
  assert.ok(diag.message.includes('https://esm.sh/kaplay@3001.0.19'));
  assert.ok(diag.suggestedFix?.includes('Remove remote import'));
});

test('validateGameSource returns actionable diagnostics on unapproved npm modules', () => {
  const badCode = `
import axios from 'axios';
import kaplay from 'kaplay';
export default function setup() {}
`;
  const report = validateGameSource({
    engineId: 'kaplay',
    sourceCode: badCode,
  });

  assert.equal(report.valid, false);
  const diag = report.diagnostics.find(d => d.code === 'UNAPPROVED_MODULE');
  assert.ok(diag);
  assert.equal(diag.line, 2);
  assert.ok(diag.message.includes('axios'));
  assert.ok(diag.suggestedFix?.includes('Remove "axios"'));
});

test('validateGameSource returns actionable diagnostics on forbidden DOM and network APIs', () => {
  const badCode = `
import kaplay from 'kaplay';
export default function setup() {
  const data = fetch('https://api.example.com/scores');
  window.alert('Game started!');
  document.body.style.backgroundColor = 'red';
  localStorage.setItem('score', '100');
}
`;
  const report = validateGameSource({
    engineId: 'kaplay',
    sourceCode: badCode,
  });

  assert.equal(report.valid, false);
  const codes = report.diagnostics.map(d => d.code);
  assert.ok(codes.includes('NETWORK_ACCESS_FORBIDDEN'), 'Must flag fetch');
  assert.ok(codes.includes('DOM_ACCESS_FORBIDDEN'), 'Must flag window/document');
  assert.ok(codes.includes('DIRECT_STORAGE_FORBIDDEN'), 'Must flag localStorage');

  const fetchDiag = report.diagnostics.find(d => d.code === 'NETWORK_ACCESS_FORBIDDEN');
  assert.ok(fetchDiag?.suggestedFix?.includes('offline-first'));

  const storageDiag = report.diagnostics.find(d => d.code === 'DIRECT_STORAGE_FORBIDDEN');
  assert.ok(storageDiag?.suggestedFix?.includes('Host Storage API'));
});

test('validateGameSource returns actionable diagnostics on missing export', () => {
  const noExport = `
import kaplay from 'kaplay';
const playerX = 10;
`;
  const report = validateGameSource({
    engineId: 'kaplay',
    sourceCode: noExport,
  });

  assert.equal(report.valid, false);
  const diag = report.diagnostics.find(d => d.code === 'MISSING_EXPORT');
  assert.ok(diag);
  assert.ok(diag.suggestedFix?.includes('export default'));
});

test('validateGameSource returns actionable diagnostics on TypeScript syntax errors', () => {
  const syntaxErr = `
import kaplay from 'kaplay';
export default function broken( {
`;
  const report = validateGameSource({
    engineId: 'kaplay',
    sourceCode: syntaxErr,
  });

  assert.equal(report.valid, false);
  const diag = report.diagnostics.find(d => d.code === 'SYNTAX_ERROR');
  assert.ok(diag);
  assert.ok(diag.line !== undefined);
  assert.ok(diag.column !== undefined);
});

test('validateGameSource validates manifest when provided and reports manifest errors', () => {
  const validCode = `
import kaplay from 'kaplay';
export default function setup() {}
`;
  const invalidManifest = {
    schemaVersion: 1,
    gameId: 'not-a-uuid',
    revisionId: 'also-not-a-uuid',
    title: 'Test Game',
    deviceProfile: 'slopboy-1000',
    engine: {
      id: 'kaplay',
      version: '3001.0.19',
      adapterProtocol: 1,
    },
    entrypoint: 'src/game.ts',
    assets: [],
  };

  const report = validateGameSource({
    engineId: 'kaplay',
    sourceCode: validCode,
    manifest: invalidManifest as never,
  });

  assert.equal(report.valid, false);
  const manifestDiag = report.diagnostics.find(d => d.code.startsWith('MANIFEST_'));
  assert.ok(manifestDiag);
  assert.equal(manifestDiag.file, 'manifest.json');
});

test('getAgentCodingInstructions provides concise instructions with hardware and security rules', () => {
  const instructions = getAgentCodingInstructions('kaplay');
  assert.ok(instructions.includes('160 x 144 pixels strictly'));
  assert.ok(instructions.includes('4 indexed colors only'));
  assert.ok(instructions.includes('NO DOM access'));
  assert.ok(instructions.includes('NO Network access'));
  assert.ok(instructions.includes('Persistence'));
});
