import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {GAMES} from '../packages/catalog/src/index.ts';
import {compileGameSource,packCartridge,validateManifest}
  from '../packages/cartridge/src/index.ts';
import {immutableCuratedPath,prepareImmutableCuratedAssets}
  from '../tools/build-curated-immutable.ts';

const root=resolve(import.meta.dirname,'..');

async function fixtureDirectory():Promise<string>{
  const sandbox=await mkdtemp(resolve(tmpdir(),'slopboy-immutable-delivery-'));
  for(const game of GAMES){
    for(const source of [game.source.manifest,game.source.game]){
      const target=resolve(sandbox,source);
      await mkdir(dirname(target),{recursive:true});
      await copyFile(resolve(root,source),target);
    }
    const manifest=validateManifest(JSON.parse(await readFile(resolve(root,game.source.manifest),'utf8'))).manifest;
    const compiled=compileGameSource(await readFile(resolve(root,game.source.game),'utf8'));
    const bundle=packCartridge({format:'slopboy-cartridge-v0',manifest,code:compiled,assets:[]});
    const path=resolve(sandbox,'apps/web/public'+game.cartridge);
    await mkdir(dirname(path),{recursive:true});
    await writeFile(path,bundle);
  }
  return sandbox;
}

test('SHA-addressed artifact paths are content-only and cannot traverse filesystem',()=>{
  assert.equal(immutableCuratedPath('a'.repeat(64)),'/cartridges/by-sha256/'+ 'a'.repeat(64)+'.slop');
  for(const bad of ['../release','A'.repeat(64),'abc','0'.repeat(63)+'/', '']){
    assert.throws(()=>immutableCuratedPath(bad),/Invalid immutable cartridge digest/);
  }
});

test('build delivers only pinned curated cartridges and verify is idempotent',async()=>{
  const sandbox=await fixtureDirectory();
  try{
    const results=await prepareImmutableCuratedAssets({rootDir:sandbox,mode:'build'});
    assert.equal(results.length,GAMES.length);
    assert.equal(new Set(results.map(a=>a.path)).size,GAMES.length);
    for(const [i,item] of results.entries()){
      const source=await readFile(resolve(sandbox,'apps/web/public'+GAMES[i].cartridge));
      const delivered=await readFile(resolve(sandbox,'apps/web/public'+item.path));
      assert.deepEqual(delivered,source);
      assert.equal(item.gameId,GAMES[i].gameId);
      assert.equal(item.revisionId,GAMES[i].revisionId);
      assert.equal(item.byteSize,source.byteLength);
      assert.equal(createHash('sha256').update(delivered).digest('hex'),item.sha256);
      assert.equal(item.path,immutableCuratedPath(item.sha256));
    }
    const verified=await prepareImmutableCuratedAssets({rootDir:sandbox,mode:'verify'});
    assert.deepEqual(verified,results);
    assert.deepEqual(await prepareImmutableCuratedAssets({rootDir:sandbox,mode:'build'}),results);
  }finally{
    await rm(sandbox,{recursive:true,force:true});
  }
});

test('verification fails closed for missing or altered immutable payload',async()=>{
  const sandbox=await fixtureDirectory();
  try{
    await assert.rejects(
      ()=>prepareImmutableCuratedAssets({rootDir:sandbox,mode:'verify'}),
      /Immutable cartridge missing/
    );
    const [first]=await prepareImmutableCuratedAssets({rootDir:sandbox,mode:'build'});
    const target=resolve(sandbox,'apps/web/public'+first.path);
    await writeFile(target,Buffer.from('substituted data'));
    await assert.rejects(
      ()=>prepareImmutableCuratedAssets({rootDir:sandbox,mode:'build'}),
      /Immutable cartridge collision or overwrite/
    );
  }finally{
    await rm(sandbox,{recursive:true,force:true});
  }
});
