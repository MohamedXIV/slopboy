import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GAMES,getCatalogGame} from '../packages/catalog/src/index.ts';
import {getHardware} from '../packages/hardware/src/index.ts';
import {compileGameSource,packCartridge,unpackCartridge,validateManifest} from '../packages/cartridge/src/index.ts';
test('catalog identifiers and approved cartridge paths are unique and closed',()=>{
  assert.equal(GAMES.length,3);
  assert.equal(new Set(GAMES.map(game=>game.id)).size,GAMES.length);
  for(const game of GAMES){
    assert.equal(game.cartridge,`/cartridges/${game.id}.slop`);
    assert.equal(game.status,'curated');
    assert.equal(getCatalogGame(game.id),game);
    assert.ok(getHardware(game.hardware.id,game.hardware.version));
  }
  assert.equal(getCatalogGame('../../private'),undefined);
});
test('each independent game source matches its hardware manifest',async()=>{
  for(const game of GAMES){
    const manifest=JSON.parse(await readFile(new URL('../'+game.source.manifest,import.meta.url),'utf8'));
    const contract=validateManifest(manifest);
    assert.equal(contract.manifest.id,game.id);
    assert.equal(contract.manifest.title,game.title);
    assert.deepEqual(contract.manifest.hardware,game.hardware);
    assert.deepEqual(contract.manifest.controls,game.controls);
    const source=await readFile(new URL('../'+game.source.game,import.meta.url),'utf8');
    const code=compileGameSource(source);
    const a=packCartridge({format:'slopboy-cartridge-v0',manifest,code,assets:[]});
    const b=packCartridge({format:'slopboy-cartridge-v0',manifest,code,assets:[]});
    assert.deepEqual(a,b);
    assert.equal(unpackCartridge(a).manifest.id,game.id);
    assert.ok(a.byteLength <= contract.hardware.budgets.compressedBytes);
  }
});
test('publishing requires a catalog entry; no direct path interpolation',()=>{
  const ids=['tiny-catcher','star-patrol','circuit-slide'];
  assert.deepEqual(GAMES.map(game=>game.id),ids);
  for(const id of ['unlisted','evil.js','../tiny-catcher','']){
    assert.equal(getCatalogGame(id),undefined);
  }
});
