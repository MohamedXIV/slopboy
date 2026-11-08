import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GAMES,getCatalogGame,getLegacyCatalogGame,resolveCatalogGame,isGameUuid}
  from '../packages/catalog/src/index.ts';
import {getHardware} from '../packages/hardware/src/index.ts';
import {compileGameSource,packCartridge,unpackCartridge,validateManifest} from '../packages/cartridge/src/index.ts';

test('curated UUID game/revision identities are unique, explicit, and independent of legacy paths',()=>{
  assert.equal(GAMES.length,3);
  assert.equal(new Set(GAMES.map(g=>g.gameId)).size,GAMES.length);
  assert.equal(new Set(GAMES.map(g=>g.revisionId)).size,GAMES.length);
  assert.equal(new Set(GAMES.map(g=>g.legacySlug)).size,GAMES.length);
  for(const game of GAMES){
    assert.ok(isGameUuid(game.gameId)&&isGameUuid(game.revisionId));
    assert.notEqual(game.gameId,game.revisionId);
    assert.equal(game.cartridge,`/cartridges/${game.legacySlug}.slop`);
    assert.equal(game.status,'curated');
    assert.equal(getCatalogGame(game.gameId),game);
    assert.equal(getLegacyCatalogGame(game.legacySlug),game);
    assert.equal(resolveCatalogGame(game.gameId),game);
    assert.equal(resolveCatalogGame(game.legacySlug),game);
    assert.ok(getHardware(game.hardware.id,game.hardware.version));
    assert.equal({...game,title:'A completely different title'}.gameId,game.gameId);
    assert.equal({...game,revisionId:'another-revision'}.gameId,game.gameId);
  }
  assert.equal(getCatalogGame('tiny-catcher'),undefined);
  assert.equal(resolveCatalogGame('../../private'),undefined);
});
test('fixture UUID mapping is not generated from titles, manifests or runtime state',()=>{
  assert.deepEqual(GAMES.map(g=>[g.legacySlug,g.gameId,g.revisionId]),[
    ['tiny-catcher','5b0edbf4-644d-43f4-9ad3-5506eacd05d3','107d59b4-03d5-4a29-be33-f8246a2c4caa'],
    ['star-patrol','f8067e25-7c16-4e9d-b496-69b1b8fe7ccc','38ecff6f-6b60-40d1-81ab-c07ad0dc928e'],
    ['circuit-slide','3ce74eec-ca3c-484b-8d16-2af4840c539b','8b2c6f40-4684-4e6f-95d4-ce7cfca730f2']
  ]);
});
test('curated legacy pixel-v1 source and cartridge bytes remain untouched',async()=>{
  for(const game of GAMES){
    const manifest=JSON.parse(await readFile(new URL('../'+game.source.manifest,import.meta.url),'utf8'));
    const contract=validateManifest(manifest);
    assert.equal(contract.manifest.id,game.legacySlug);
    assert.equal(typeof contract.manifest.title,'string'); // Historical title belongs to legacy bytes.
    assert.deepEqual(contract.manifest.hardware,game.hardware);
    assert.deepEqual(contract.manifest.controls,game.controls);
    const source=await readFile(new URL('../'+game.source.game,import.meta.url),'utf8');
    const code=compileGameSource(source);
    const a=packCartridge({format:'slopboy-cartridge-v0',manifest,code,assets:[]});
    const b=packCartridge({format:'slopboy-cartridge-v0',manifest,code,assets:[]});
    assert.deepEqual(a,b);
    assert.equal(unpackCartridge(a).manifest.id,game.legacySlug);
    assert.ok(a.byteLength<=contract.hardware.budgets.compressedBytes);
  }
});
test('unknown, malformed, or unlisted aliases never resolve',()=>{
  assert.deepEqual(GAMES.map(game=>game.legacySlug),['tiny-catcher','star-patrol','circuit-slide']);
  for(const id of ['unlisted','evil.js','../tiny-catcher','', 'Tiny Catcher']){
    assert.equal(resolveCatalogGame(id),undefined);
  }
});
