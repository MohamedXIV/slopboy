import test from 'node:test';
import assert from 'node:assert/strict';
import {mapPlayableCatalogRow} from '../apps/web/server/playable-catalog.ts';
import {gameSaveIdentity} from '../apps/web/components/v2/game-save-identity.ts';
import {createGameSaveService,slotKey,type SaveDriver} from '../packages/runtime/src/save-store.ts';
import {SLOPBOY_1000} from '../packages/hardware/src/index.ts';

const digest='a'.repeat(64);
const row={id:'c260881a-647d-43c1-bf24-81e7a5902908',revision_id:'7400f98c-e2f8-49a9-9c40-400923705580',
  title:'Reviewed game',genre:'Arcade',tagline:null,description:null,content_digest:digest,
  storage_key:'static-public-v1:/cartridges/by-sha256/'+digest+'.slop',
  manifest:{id:'tiny-catcher',hardware:{id:'slopboy-1000',version:'0.1.0'},controls:['LEFT','RIGHT','A']}};
test('only validated immutable public artifact metadata is exposed',()=>{
  const game=mapPlayableCatalogRow(row);assert.ok(game);
  assert.equal(game.cartridge,'/cartridges/by-sha256/'+digest+'.slop');
  assert.equal(game.gameId,row.id);assert.equal(game.revisionId,row.revision_id);
  assert.equal('manifest' in game,false);assert.equal('storage_key' in game,false);
});
test('malformed IDs, paths, manifest, controls and hardware fail closed',()=>{
  for(const invalid of [
    {...row,id:'not-a-uuid'}, {...row,revision_id:'bad'}, {...row,content_digest:'../private'},
    {...row,storage_key:'static-public-v1:/cartridges/other.slop'},
    {...row,manifest:{...row.manifest,id:'../../private'}},
    {...row,manifest:{...row.manifest,controls:['MOUSE']}},
    {...row,manifest:{...row.manifest,hardware:{id:'other',version:'1'}}},
    {...row,manifest:{...row.manifest,controls:[]}},
  ])assert.equal(mapPlayableCatalogRow(invalid),null);
});
test('games sharing a cartridge manifest cannot inherit each other’s legacy saves',async()=>{
  const original=mapPlayableCatalogRow({...row,legacy_slug:'tiny-catcher'});
  const other=mapPlayableCatalogRow({...row,id:'5b0edbf4-644d-43f4-9ad3-5506eacd05d3',legacy_slug:null});
  assert.ok(original&&other);
  const values=new Map<string,unknown>([[slotKey('tiny-catcher',SLOPBOY_1000),'original save']]);
  const driver:SaveDriver={get:async key=>values.get(key),put:async(key,value)=>{values.set(key,value);},delete:async key=>{values.delete(key);}};
  assert.equal(await createGameSaveService(driver,SLOPBOY_1000,gameSaveIdentity(other)).read(),null);
  assert.equal(await createGameSaveService(driver,SLOPBOY_1000,gameSaveIdentity(original)).read(),'original save');
});
