import test from 'node:test';
import assert from 'node:assert/strict';
import {createSlotSaveStore,type SlotGame} from '../packages/runtime/src/save-slots.ts';
import {createGameSaveService,gameSlotKey,type AtomicSaveDriver} from '../packages/runtime/src/save-store.ts';
import {SLOPBOY_1000} from '../packages/hardware/src/index.ts';

function driver(){
  const records=new Map<string,string>();
  let chain:Promise<unknown>=Promise.resolve();
  const d:AtomicSaveDriver={
    get:async k=>records.get(k),put:async(k,v)=>{records.set(k,v);},delete:async k=>{records.delete(k);},
    update:<T>(k:string,change:(raw:unknown)=>{value:string;result:T})=>{
      const run=chain.then(()=>{const next=change(records.get(k));records.set(k,next.value);return next.result;});
      chain=run.catch(()=>{});return run;
    }
  };
  return {d,records};
}
const game:SlotGame={gameId:'3ce74eec-ca3c-484b-8d16-2af4840c539b',revisionId:'8b2c6f40-4684-4e6f-95d4-ce7cfca730f2',
  releaseVersion:'1.0.0',hardwareId:SLOPBOY_1000.id,hardwareVersion:SLOPBOY_1000.version,capabilities:{mode:'manual-and-auto',schemaVersion:1}};
test('named slots, manual snapshots, active head and metadata survive reopening',async()=>{
  const {d}=driver(),store=createSlotSaveStore(d,game);
  const a=await store.create(' Adventure '),b=await store.create('Second run');
  const {session}=await store.open(a);
  await store.autosave(session,'auto one');
  const manual=await store.manualSave(session,'Before boss','fresh capture');
  await store.renameSlot(a,'First run');await store.renameSnapshot(a,manual,'Boss checkpoint');
  const reopened=createSlotSaveStore(d,game),list=await reopened.list();
  assert.equal(list.selectedSlotId,a);assert.equal(list.slots[0].name,'First run');
  assert.equal(list.slots[0].snapshots[1].name,'Boss checkpoint');
  assert.equal(list.slots[0].snapshots[1].releaseVersion,'1.0.0');
  assert.equal('data' in list.slots[0].snapshots[1],false);
  assert.equal((await reopened.open(a)).data,'fresh capture');
  assert.equal((await reopened.open(b)).data,null);
});
test('fenced sessions and serialized concurrent updates never write to a newly selected slot',async()=>{
  const {d}=driver(),a=createSlotSaveStore(d,game),b=createSlotSaveStore(d,game);
  const [one,two]=await Promise.all([a.create('One'),b.create('Two')]);
  const old=(await a.open(one)).session;
  await a.autosave(old,'one');
  const current=(await b.open(two)).session;
  await assert.rejects(a.autosave(old,'stale'),/STALE_SAVE_SESSION/);
  await a.close(old);
  await Promise.all([b.autosave(current,'two'),a.renameSlot(one,'Renamed')]);
  assert.equal((await b.open(one)).data,'one');
  assert.equal((await b.open(two)).data,'two');
  assert.equal((await a.list()).slots[0].name,'Renamed');
});
test('manual captures and backups remain immutable when autosave advances; fork keeps original',async()=>{
  const {d}=driver(),store=createSlotSaveStore(d,game),slot=await store.create('Run');
  const {session}=await store.open(slot);
  await store.autosave(session,'old');const backup=await store.backupHead(session,'Old backup');
  const manual=await store.manualSave(session,'Manual','manual state');
  await store.autosave(session,'new');const fork=await store.fork(slot,backup,'Restored copy');
  assert.equal((await store.open(fork)).data,'old');
  assert.equal((await store.open(slot)).data,'new');
  const snapshots=(await store.list()).slots[0].snapshots;
  assert.equal(snapshots.filter(s=>s.kind==='auto').length,1);
  assert.ok(snapshots.some(s=>s.id===manual&&s.kind==='manual'));
  assert.ok(snapshots.some(s=>s.id===backup&&s.kind==='backup'));
});
test('no progress modes reject capture, auto-only does not fake manual capture',async()=>{
  const {d}=driver();
  for(const capabilities of [{mode:'none'},{mode:'persistent-data',schemaVersion:1}] as const)
    await assert.rejects(createSlotSaveStore(d,{...game,capabilities}).create('Not supported'),/PROGRESS_SAVE_UNSUPPORTED/);
  const auto=createSlotSaveStore(d,{...game,capabilities:{mode:'auto',schemaVersion:1}});
  const {session}=await auto.open(await auto.create('Auto'));
  await assert.rejects(auto.manualSave(session,'Fake','data'),/MANUAL_SAVE_UNSUPPORTED/);
});
test('changed schema cannot open old head; legacy import is idempotent and non-destructive',async()=>{
  const {d,records}=driver(),store=createSlotSaveStore(d,game);
  const slot=await store.create('Run'),{session}=await store.open(slot);
  await store.autosave(session,'schema one');
  const next=createSlotSaveStore(d,{...game,capabilities:{mode:'auto',schemaVersion:2}});
  await assert.rejects(next.open(slot),/INCOMPATIBLE_SAVE/);
  const old=createGameSaveService(d,SLOPBOY_1000,{gameId:game.gameId});
  await old.write('legacy');
  const key=gameSlotKey(game.gameId,SLOPBOY_1000),original=records.get(key);
  const imported=await store.importLegacy(SLOPBOY_1000);assert.ok(imported);
  assert.equal(await store.importLegacy(SLOPBOY_1000),null);assert.equal(records.get(key),original);
  const snapshot=(await store.list()).slots.find(s=>s.id===imported)!.snapshots[0];
  assert.equal(snapshot.revisionId,null);assert.equal(snapshot.createdAt,null);
  await assert.rejects(store.open(imported),/UNKNOWN_SAVE_COMPATIBILITY/);
});
test('invalid names and payloads do not alter existing data; corrupt records fail closed',async()=>{
  const {d,records}=driver(),store=createSlotSaveStore(d,game),slot=await store.create('Run');
  const {session}=await store.open(slot);await store.autosave(session,'good');
  await assert.rejects(store.renameSlot(slot,'   '),/INVALID_SAVE_NAME/);
  await assert.rejects(store.autosave(session,'x'.repeat(256*1024+1)),/INVALID_SAVE_PAYLOAD/);
  assert.equal((await store.open(slot)).data,'good');
  const key=[...records.keys()][0];records.set(key,'broken JSON');
  await assert.rejects(store.create('Do not overwrite'),/INVALID_SAVE_RECORD/);
  assert.equal(records.get(key),'broken JSON');
});
