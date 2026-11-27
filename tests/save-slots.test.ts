import test from 'node:test';
import assert from 'node:assert/strict';
import {createSlotSaveStore,LOCAL_SLOT_POLICY,type SlotGame} from '../packages/runtime/src/save-slots.ts';
import {createGameSaveService,gameSlotKey,type AtomicSaveDriver} from '../packages/runtime/src/save-store.ts';
import {SLOPBOY_1000} from '../packages/hardware/src/index.ts';
import {decodeCloudSnapshot,encodeCloudSnapshot,compareCloudSnapshot,CLOUD_SNAPSHOT_MAX_BYTES} from '../packages/runtime/src/cloud-snapshot.ts';

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
  assert.equal(snapshots.filter(s=>s.kind==='auto').length,2);
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

test('named cloud snapshot transfers exact metadata and keeps both local playthroughs without activation',async()=>{
  const a=createSlotSaveStore(driver().d,game);
  const original=await a.create('Original run'),{session}=await a.open(original);
  const snapshotId=await a.manualSave(session,'Before boss','live state');
  const raw=await a.exportCloudSnapshot(original,snapshotId);
  const envelope=await decodeCloudSnapshot(raw,game);
  assert.equal(envelope.slotName,'Original run');assert.equal(envelope.snapshot.name,'Before boss');
  assert.equal(envelope.snapshot.revisionId,game.revisionId);assert.equal(envelope.snapshot.data,'live state');
  assert.equal(await encodeCloudSnapshot(envelope,game),raw);
  assert.equal(raw.includes(session.token),false);
  const b=createSlotSaveStore(driver().d,game);
  const local=await b.create('Other device'),active=(await b.open(local)).session;
  await b.autosave(active,'local progress');
  const copy=await b.importCloudCopy(raw,'Cloud copy');
  assert.notEqual(copy,original);
  assert.equal((await b.list()).selectedSlotId,local);
  assert.equal((await b.open(copy)).data,'live state');
  assert.equal((await b.open(local)).data,'local progress');
  assert.equal((await b.list()).slots.find(s=>s.id===copy)!.snapshots[0].revisionId,game.revisionId);
});
test('cloud import rejects corruption and wrong game; incompatible data is preserved but cannot load',async()=>{
  const a=createSlotSaveStore(driver().d,game),slot=await a.create('Source'),{session}=await a.open(slot);
  const snap=await a.manualSave(session,'Capture','original');
  const raw=await a.exportCloudSnapshot(slot,snap),value=await decodeCloudSnapshot(raw);
  const b=createSlotSaveStore(driver().d,{...game,capabilities:{mode:'auto',schemaVersion:2}});
  await assert.rejects(b.importCloudCopy(raw.replace('original','tampered'),'Invalid'),/SAVE_DIGEST_MISMATCH/);
  await assert.rejects(b.importCloudCopy(raw.replace(game.gameId,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'Wrong'),/IDENTITY_MISMATCH/);
  await assert.rejects(b.importCloudCopy(raw+' ','Extra'),/NONCANONICAL/);
  assert.equal((await b.list()).slots.length,0);
  const copy=await b.importCloudCopy(raw,'Old schema');
  await assert.rejects(b.open(copy),/INCOMPATIBLE_SAVE/);
  assert.equal((await b.list()).slots[0].snapshots[0].schemaVersion,1);
  assert.equal(compareCloudSnapshot(value,{...value,slotName:'Renamed'}),'metadata-changed');
  assert.equal(compareCloudSnapshot(value,{...value,snapshot:{...value.snapshot,id:crypto.randomUUID()}}),'conflict');
  assert.equal(compareCloudSnapshot(value,{...value,slotId:crypto.randomUUID()}),'different-slot');
  assert.equal(compareCloudSnapshot(value,value),'same');
});
test('cloud envelope has a bounded canonical encoding and cannot contain extra secrets',async()=>{
  const a=createSlotSaveStore(driver().d,game),slot=await a.create('Source'),{session}=await a.open(slot);
  const snap=await a.manualSave(session,'Capture','x'.repeat(CLOUD_SNAPSHOT_MAX_BYTES));
  await assert.rejects(a.exportCloudSnapshot(slot,snap),/CLOUD_SNAPSHOT_TOO_LARGE/);
  const small=await a.manualSave(session,'Small','value');
  const raw=await a.exportCloudSnapshot(slot,small);
  await assert.rejects(encodeCloudSnapshot({...JSON.parse(raw),sessionToken:session.token}),/INVALID_CLOUD_SNAPSHOT/);
  await assert.rejects(decodeCloudSnapshot(raw.replace('"format":','"format":"ignored","format":')),/NONCANONICAL/);
  assert.equal((await a.list()).slots[0].snapshots.length,2);
});

test('five autosaves rotate in transaction order across the game, never evict manual or backed-up progress',async()=>{
  const {d}=driver(),store=createSlotSaveStore(d,game);
  const one=await store.create('First'),two=await store.create('Second');
  const a=(await store.open(one)).session;
  const first=await store.autosave(a,'one');
  const kept=await store.backupSnapshot(one,first,'Keep first');
  const manual=await store.manualSave(a,'Manual','manual');
  const second=await store.autosave(a,'two');
  const b=(await store.open(two)).session;
  const later:string[]=[];
  for(let i=3;i<=7;i++)later.push(await store.autosave(b,String(i)));
  const reopened=createSlotSaveStore(d,game),listing=await reopened.list();
  const all=listing.slots.flatMap(s=>s.snapshots);
  assert.deepEqual(all.filter(s=>s.kind==='auto').map(s=>s.id),later);
  assert.equal(all.filter(s=>s.kind==='auto').length,LOCAL_SLOT_POLICY.maxAutosaves);
  assert.ok(all.some(s=>s.id===kept&&s.kind==='backup'));
  assert.ok(all.some(s=>s.id===manual&&s.kind==='manual'));
  assert.equal(all.some(s=>s.id===second),false);
  assert.equal(listing.slots[0].headId,manual);
  assert.equal((await reopened.open(two)).data,'7');
  assert.equal((await reopened.open(one)).data,'manual');
  assert.equal((await decodeCloudSnapshot(await reopened.exportCloudSnapshot(one,kept))).snapshot.data,'one');
  await assert.rejects(reopened.backupSnapshot(one,first,'Already rotated'),/SAVE_SNAPSHOT_NOT_FOUND/);
  await assert.rejects(reopened.backupSnapshot(one,manual,'Not auto'),/NOT_AUTOSAVE/);
});
test('historical autosave backup preserves source time, digest and head without activation',async()=>{
  const {d}=driver(),store=createSlotSaveStore(d,game),slot=await store.create('Run');
  const {session}=await store.open(slot),old=await store.autosave(session,'old');
  const latest=await store.autosave(session,'latest');
  const before=(await store.list()).slots[0].snapshots.find(s=>s.id===old)!;
  const copy=await store.backupSnapshot(slot,old,'Keep it');
  const after=(await store.list()).slots[0];
  const saved=after.snapshots.find(s=>s.id===copy)!;
  assert.equal(after.headId,latest);
  assert.equal(saved.createdAt,before.createdAt);
  assert.equal(saved.digest,before.digest);
  assert.equal(saved.kind,'backup');
  assert.equal((await store.list()).selectedSlotId,slot);
});
test('legacy per-slot records upgrade on first autosave without discarding existing payloads beyond five',async()=>{
  const {d,records}=driver(),store=createSlotSaveStore(d,game);
  // Assemble authentic old-format per-slot snapshots from independent stores.
  await store.create('Placeholder');
  const key=[...records.keys()][0],old=JSON.parse(records.get(key)!);
  old.slots=[];old.active=null;old.format='slopboy-save-slots-v1';delete old.autoOrder;
  for(let i=0;i<6;i++){
    const isolated=driver(),oldStore=createSlotSaveStore(isolated.d,game);
    const oldSlot=await oldStore.create('Old '+i),opened=await oldStore.open(oldSlot);
    await oldStore.autosave(opened.session,'old '+i);
    const raw=JSON.parse([...isolated.records.values()][0]);
    old.slots.push(raw.slots[0]);
  }
  records.set(key,JSON.stringify(old));
  assert.equal((await store.list()).slots.flatMap(s=>s.snapshots).filter(s=>s.kind==='auto').length,6);
  const slot=await store.create('New'),{session}=await store.open(slot);
  await store.autosave(session,'new');
  const after=(await store.list()).slots.flatMap(s=>s.snapshots);
  assert.equal(after.filter(s=>s.kind==='auto').length,5);
  assert.equal(after.filter(s=>s.name==='Recovered autosave').length,2);
  assert.equal(after.filter(s=>s.kind==='backup').length,2);
  assert.equal(after.length,7);
  const migrated=JSON.parse(records.get(key)!);
  assert.equal(migrated.format,'slopboy-save-slots-v2');
  assert.equal(migrated.autoOrder.length,5);
});
test('invalid persisted auto order fails closed',async()=>{
  const {d,records}=driver(),store=createSlotSaveStore(d,game),slot=await store.create('Run');
  const {session}=await store.open(slot);await store.autosave(session,'good');
  const key=[...records.keys()][0],raw=JSON.parse(records.get(key)!);
  raw.autoOrder=[crypto.randomUUID()];const corrupted=JSON.stringify(raw);records.set(key,corrupted);
  await assert.rejects(store.list(),/INVALID_SAVE_RECORD/);
  await assert.rejects(store.autosave(session,'new'),/INVALID_SAVE_RECORD/);
  assert.equal(records.get(key),corrupted);
});

test('load chosen save directly, fence old session, and keep both manual and autosave data',async()=>{
  const {d}=driver(),store=createSlotSaveStore(d,game),slot=await store.create('Run');
  const {session}=await store.open(slot);
  const first=await store.autosave(session,'first');
  const manual=await store.manualSave(session,'Keep','manual');
  const last=await store.autosave(session,'last');
  const loaded=await store.openSnapshot(slot,first);
  assert.equal(loaded.data,'first');
  assert.equal((await store.list()).slots[0].headId,first);
  assert.equal((await store.list()).slots.length,1);
  await assert.rejects(store.autosave(session,'stale'),/STALE_SAVE_SESSION/);
  await store.autosave(loaded.session,'continued');
  const entries=(await store.list()).slots[0].snapshots;
  for(const id of [first,manual,last])assert.ok(entries.some(s=>s.id===id));
  assert.equal((await store.openSnapshot(slot,manual)).data,'manual');
});
