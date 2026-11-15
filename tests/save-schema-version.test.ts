import test from 'node:test';
import assert from 'node:assert/strict';
import {GAMES} from '../packages/catalog/src/index.ts';
import {SLOPBOY_1000} from '../packages/hardware/src/index.ts';
import {
  createGameSaveService,gameSlotKey,LEGACY_SAVE_SCHEMA_VERSION,
  MAX_SAVE_SCHEMA_VERSION,type SaveDriver,
} from '../packages/runtime/src/save-store.ts';
import {validateManifestV2,ManifestError}
  from '../packages/cartridge/src/manifest-v2.ts';

const game=GAMES[0];
const driverFixture=()=>{
  const map=new Map<string,unknown>();
  const driver:SaveDriver={
    get:async key=>map.get(key),
    put:async(key,value)=>{map.set(key,value);},
    delete:async key=>{map.delete(key);}
  };
  return {map,driver};
};

test('default save schema 1 keeps all historical UUID keys unchanged',async()=>{
  const {driver,map}=driverFixture();
  const old=createGameSaveService(driver,SLOPBOY_1000,game);
  const original='{"progress":10}';
  await old.write(original);
  const key=gameSlotKey(game.gameId,SLOPBOY_1000);
  assert.equal(key,'save-v2:slopboy-1000@0.1.0:'+game.gameId);
  assert.equal(gameSlotKey(game.gameId,SLOPBOY_1000,LEGACY_SAVE_SCHEMA_VERSION),key);
  assert.equal(JSON.parse(String(map.get(key))).saveSchemaVersion,undefined);
  assert.equal(await old.read(),original);
});

test('incompatible save schemas have isolated keys and do not overwrite older progress',async()=>{
  const {driver,map}=driverFixture();
  const old=createGameSaveService(driver,SLOPBOY_1000,game);
  const next=createGameSaveService(driver,SLOPBOY_1000,{
    gameId:game.gameId,legacySlug:game.legacySlug,saveSchemaVersion:2
  });
  await old.write('old-format-progress');
  assert.equal(await next.read(),null,'Do not automatically pass incompatible old state to a new revision');
  await next.write('new-format-progress');
  assert.equal(await old.read(),'old-format-progress');
  assert.equal(await next.read(),'new-format-progress');
  assert.equal(map.size,2);
  await next.write(null);
  assert.equal(await next.read(),null);
  assert.equal(await old.read(),'old-format-progress','Deleting a v2 lane must not delete v1 data');
  const previous=createGameSaveService(driver,SLOPBOY_1000,{
    gameId:game.gameId,saveSchemaVersion:1
  });
  assert.equal(await previous.read(),'old-format-progress','Rollback to older revision restores old data');
});

test('an incompatible schema never imports a historical slug save',async()=>{
  const {driver,map}=driverFixture();
  await driver.put('save-v1:slopboy-1000@0.1.0:'+game.legacySlug,'legacy-only');
  const next=createGameSaveService(driver,SLOPBOY_1000,{
    gameId:game.gameId,legacySlug:game.legacySlug,saveSchemaVersion:2
  });
  assert.equal(await next.read(),null);
  assert.equal(map.has(gameSlotKey(game.gameId,SLOPBOY_1000,2)),false);
  assert.equal(map.get('save-v1:slopboy-1000@0.1.0:'+game.legacySlug),'legacy-only');
});

test('invalid schema identities fail closed, including NaN and unsupported versions',()=>{
  for(const value of [0,-1,1.25,Number.NaN,Number.POSITIVE_INFINITY,MAX_SAVE_SCHEMA_VERSION+1]){
    assert.throws(()=>gameSlotKey(game.gameId,SLOPBOY_1000,value),/Invalid save schema version/);
    assert.throws(()=>createGameSaveService(driverFixture().driver,SLOPBOY_1000,{
      gameId:game.gameId,saveSchemaVersion:value}),/Invalid save schema version/);
  }
  assert.notEqual(gameSlotKey(game.gameId,SLOPBOY_1000,2),gameSlotKey(game.gameId,SLOPBOY_1000,3));
});

test('V2 manifests declare and validate the same explicit save schema boundary',()=>{
  const base={
    schemaVersion:1,gameId:game.gameId,revisionId:game.revisionId,
    title:game.title,deviceProfile:'slopboy-1000',
    engine:{id:'kaplay',version:'3001.0.19',adapterProtocol:1},
    entrypoint:'src/game.ts',assets:[]
  };
  assert.equal(validateManifestV2(base).manifest.saveSchemaVersion,undefined);
  assert.equal(validateManifestV2({...base,saveSchemaVersion:2}).manifest.saveSchemaVersion,2);
  for(const bad of [0,-1,'2',1.5,Number.NaN,MAX_SAVE_SCHEMA_VERSION+1]){
    assert.throws(
      ()=>validateManifestV2({...base,saveSchemaVersion:bad}),
      (e:unknown)=>e instanceof ManifestError&&e.code==='SAVE_SCHEMA'
    );
  }
});
