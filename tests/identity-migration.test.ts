import test from 'node:test';
import assert from 'node:assert/strict';
import {GAMES} from '../packages/catalog/src/index.ts';
import {SLOPBOY_1000} from '../packages/hardware/src/index.ts';
import {slotKey,gameSlotKey,createSaveService,createGameSaveService,validSave,
  type SaveDriver} from '../packages/runtime/src/save-store.ts';
import {localSnapshotKey,readLocalSnapshot,listSnapshots,saveSnapshot,restoreSnapshot,deleteSnapshot}
  from '../apps/web/components/v2/local-save-slots.ts';

const makeDriver=()=>{
  const values=new Map<string,unknown>();
  const driver:SaveDriver={
    get:async key=>values.get(key),
    put:async(key,value)=>{values.set(key,value);},
    delete:async key=>{values.delete(key);}
  };
  return {driver,values};
};

test('each curated fixture imports an old raw autosave into a stable UUID namespace',async()=>{
  for(const game of GAMES){
    const {driver,values}=makeDriver();
    const source=createSaveService(driver,SLOPBOY_1000,game.legacySlug);
    const legacy='{"progress":7,"demo":"'+game.legacySlug+'"}';
    await source.write(legacy);
    const target=createGameSaveService(driver,SLOPBOY_1000,game);
    assert.equal(await target.read(),legacy);
    assert.equal(await target.read(),legacy);
    assert.equal(await source.read(),legacy);
    const next=values.get(gameSlotKey(game.gameId,SLOPBOY_1000));
    assert.equal(JSON.parse(String(next)).gameId,game.gameId);
    const snapshot=[...values.entries()];
    await target.read();
    assert.deepEqual([...values.entries()],snapshot,'second migration should not write or delete anything');
    assert.notEqual(slotKey(game.legacySlug,SLOPBOY_1000),gameSlotKey(game.gameId,SLOPBOY_1000));
    // New autosaves must not overwrite or corrupt V1 rollback data.
    await target.write('updated progress');
    assert.equal(await target.read(),'updated progress');
    assert.equal(await source.read(),legacy);
    const afterReload=createGameSaveService(driver,SLOPBOY_1000,game);
    assert.equal(await afterReload.read(),'updated progress');
  }
});
test('explicit deletion does not resurrect a legacy autosave',async()=>{
  const game=GAMES[0],{driver}=makeDriver();
  await createSaveService(driver,SLOPBOY_1000,game.legacySlug).write('old');
  const service=createGameSaveService(driver,SLOPBOY_1000,game);
  assert.equal(await service.read(),'old');
  await service.write(null);
  assert.equal(await service.read(),null);
  assert.equal(await createSaveService(driver,SLOPBOY_1000,game.legacySlug).read(),'old');
});
test('interrupted migration still reads original and safely retries later',async()=>{
  const game=GAMES[1],{driver,values}=makeDriver();
  const old=slotKey(game.legacySlug,SLOPBOY_1000);
  const next=gameSlotKey(game.gameId,SLOPBOY_1000);
  values.set(old,'safe');
  let shouldFail=true;
  driver.copyIfAbsent=async(from,to,transform)=>{
    if(shouldFail)throw Error('transaction aborted');
    if(values.has(to))return false;
    const value=transform(values.get(from));
    if(value===undefined)return false;
    values.set(to,value);return true;
  };
  assert.equal(await createGameSaveService(driver,SLOPBOY_1000,game).read(),'safe');
  assert.equal(values.has(next),false);
  shouldFail=false;
  assert.equal(await createGameSaveService(driver,SLOPBOY_1000,game).read(),'safe');
  assert.equal(values.has(next),true);
  assert.equal(values.get(old),'safe');
  assert.equal(await createGameSaveService(driver,SLOPBOY_1000,game).read(),'safe');
});
test('corrupted UUID or legacy data is never executed or overwritten by migration',async()=>{
  const game=GAMES[2],{driver,values}=makeDriver();
  const next=gameSlotKey(game.gameId,SLOPBOY_1000);
  values.set(next,'{not-json');
  values.set(slotKey(game.legacySlug,SLOPBOY_1000),'valid old save');
  const service=createGameSaveService(driver,SLOPBOY_1000,game);
  assert.equal(await service.read(),'valid old save');
  assert.equal(values.get(next),'{not-json','corrupt destination preserved for rollback inspection');
  values.set(slotKey(game.legacySlug,SLOPBOY_1000),{privileged:true});
  assert.equal(await service.read(),null);
  values.delete(next);
  assert.equal(await service.read(),null);
  assert.equal(validSave(undefined,SLOPBOY_1000),false);
});
test('legacy backup snapshots are recovered, copied once and remain restorable',async()=>{
  const game=GAMES[0],{driver,values}=makeDriver();
  const old=localSnapshotKey(game.gameId,2,true);
  const snapshot=JSON.stringify({createdAt:5555,save:'level 4'});
  values.set(old,snapshot);
  assert.deepEqual(await readLocalSnapshot(driver,game.gameId,2),{createdAt:5555,save:'level 4'});
  assert.equal(values.get(localSnapshotKey(game.gameId,2)),snapshot);
  assert.equal((await listSnapshots(driver,game.gameId)).length,1);
  await restoreSnapshot(driver,game.gameId,2);
  assert.equal(await createGameSaveService(driver,SLOPBOY_1000,game).read(),'level 4');
  const saved=await saveSnapshot(driver,game.gameId,7777);
  assert.equal(saved.slot,1);
  assert.equal((await listSnapshots(driver,game.gameId)).length,2);
  await deleteSnapshot(driver,game.gameId,2);
  assert.equal(await readLocalSnapshot(driver,game.gameId,2),null);
  assert.equal(values.get(old),snapshot,'historic backup still available for rollback');
  assert.equal((await listSnapshots(driver,game.gameId)).length,1);
});
test('invalid backup data is ignored without deleting or importing it',async()=>{
  const game=GAMES[1],{driver,values}=makeDriver();
  const old=localSnapshotKey(game.gameId,1,true);
  values.set(old,'{"createdAt":"tomorrow","save":true}');
  assert.equal(await readLocalSnapshot(driver,game.gameId,1),null);
  assert.equal(values.has(localSnapshotKey(game.gameId,1)),false);
  await assert.rejects(restoreSnapshot(driver,game.gameId,1),/missing or invalid/);
  assert.equal(values.get(old),'{"createdAt":"tomorrow","save":true}');
});
test('interrupted backup copy falls back, and repeated migration preserves selected slot',async()=>{
  const game=GAMES[2],{driver,values}=makeDriver();
  const old=localSnapshotKey(game.gameId,5,true);
  const next=localSnapshotKey(game.gameId,5);
  const payload=JSON.stringify({createdAt:44,save:'game'});
  values.set(old,payload);
  driver.copyIfAbsent=async()=>{throw Error('aborted');};
  assert.equal((await readLocalSnapshot(driver,game.gameId,5))?.save,'game');
  assert.equal(values.has(next),false);
  delete driver.copyIfAbsent;
  assert.equal((await readLocalSnapshot(driver,game.gameId,5))?.save,'game');
  assert.equal(values.get(next),payload);
  await readLocalSnapshot(driver,game.gameId,5);
  assert.equal(values.get(next),payload);
});
