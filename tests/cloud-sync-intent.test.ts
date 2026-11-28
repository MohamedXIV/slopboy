import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudSyncIntent,getCloudSyncDeviceId,SYNC_RETRY_MS,SYNC_CYCLE_MS,type SyncScope} from '../packages/runtime/src/cloud-sync-intent.ts';
import {encodeCloudSnapshot,CLOUD_SNAPSHOT_FORMAT,cloudSnapshotDigest} from '../packages/runtime/src/cloud-snapshot.ts';
import {runManagedSyncCycle} from '../apps/web/components/v2/managed-sync-worker.ts';
import {decodeCloudSnapshot} from '../packages/runtime/src/cloud-snapshot.ts';
import {accountSaveDriver,type AtomicSaveDriver} from '../packages/runtime/src/save-store.ts';

function driver(){
  const records=new Map<string,string>();let chain:Promise<unknown>=Promise.resolve();
  const d:AtomicSaveDriver={get:async key=>records.get(key),put:async(key,v)=>{records.set(key,v);},delete:async key=>{records.delete(key);},
    update:<T>(key:string,change:(raw:unknown)=>{value:string;result:T})=>{
      const run=chain.then(()=>{const next=change(records.get(key));records.set(key,next.value);return next.result;});
      chain=run.catch(()=>{});return run;
    }};
  return {d,records};
}
const scope:SyncScope={accountId:crypto.randomUUID(),deviceId:crypto.randomUUID(),gameId:crypto.randomUUID(),hardwareId:'slopboy-1000',hardwareVersion:'0.1.0'};
async function payload(data:string,gameId=scope.gameId){
  return encodeCloudSnapshot({format:CLOUD_SNAPSHOT_FORMAT,gameId,hardwareId:scope.hardwareId,hardwareVersion:scope.hardwareVersion,
    slotId:crypto.randomUUID(),slotName:'Run',snapshot:{id:crypto.randomUUID(),name:'Autosave',kind:'auto',revisionId:crypto.randomUUID(),
      releaseVersion:null,schemaVersion:1,createdAt:1234,data,bytes:new TextEncoder().encode(data).byteLength,digest:await cloudSnapshotDigest(data)}});
}
test('sync is off by default, exact pending bytes survive restart and coalesce by refusing another digest',async()=>{
  const {d}=driver();let now=1000;const store=createCloudSyncIntent(d,scope,()=>now),raw=await payload('first');
  assert.deepEqual(await store.status(),{enabled:false,generation:null,pending:false});
  await assert.rejects(store.stage(crypto.randomUUID(),raw),/SYNC_NOT_ENABLED/);
  const g=(await store.setEnabled(true))!,ack=await store.stage(g,raw);
  assert.deepEqual(await store.stage(g,raw),ack);
  await assert.rejects(store.stage(g,await payload('new')),/SYNC_PENDING/);
  const reopened=createCloudSyncIntent(d,scope,()=>now);
  assert.equal(await reopened.acknowledge(g,ack),false);
  const attempts=await Promise.all([store.claimAttempt(g),reopened.claimAttempt(g),reopened.claimAttempt(g)]);
  assert.equal(attempts.filter(Boolean).length,1);
  assert.equal(attempts.find(Boolean)?.raw,raw);
  assert.equal(await reopened.acknowledge(g,{...ack,bytes:ack.bytes+1}),false);
  now+=SYNC_RETRY_MS-1;assert.equal(await reopened.claimAttempt(g),null);
  now++;assert.equal((await reopened.claimAttempt(g))?.raw,raw);
  assert.equal(await reopened.acknowledge(g,ack),true);
  assert.equal((await reopened.status()).pending,false);
});
test('disable fences stale work; account, browser and game scope do not share pending intent',async()=>{
  const {d}=driver(),a=createCloudSyncIntent(d,scope),g=(await a.setEnabled(true))!,raw=await payload('private');
  const ack=await a.stage(g,raw);
  for(const changed of [{...scope,accountId:crypto.randomUUID()},{...scope,deviceId:crypto.randomUUID()},{...scope,gameId:crypto.randomUUID()}]){
    const b=createCloudSyncIntent(d,changed);
    assert.equal((await b.status()).pending,false);
    await assert.rejects(b.claimAttempt(g),/SYNC_NOT_ENABLED/);
  }
  await a.claimAttempt(g);await a.setEnabled(false);
  assert.deepEqual(await a.status(),{enabled:false,generation:null,pending:true});
  await assert.rejects(a.acknowledge(g,ack),/SYNC_NOT_ENABLED/);
  const next=(await a.setEnabled(true))!;
  assert.notEqual(next,g);
  await assert.rejects(a.claimAttempt(g),/SYNC_NOT_ENABLED/);
  assert.equal((await a.status()).pending,true);
  await assert.rejects(a.stage(next,await payload('wrong',crypto.randomUUID())),/IDENTITY_MISMATCH/);
});
test('corruption cannot silently replace a durable intent or claim tampered payload',async()=>{
  const {d,records}=driver(),a=createCloudSyncIntent(d,scope),g=(await a.setEnabled(true))!;
  await a.stage(g,await payload('private'));
  const key=[...records.keys()][0],v=JSON.parse(records.get(key)!);
  v.pending.raw=v.pending.raw.replace('private','tamper!');
  const corrupted=JSON.stringify(v);records.set(key,corrupted);
  await assert.rejects(a.claimAttempt(g));
  assert.equal(records.get(key),corrupted);
  records.set(key,'invalid');
  await assert.rejects(a.setEnabled(false),/INVALID_SYNC_INTENT/);
  assert.equal(records.get(key),'invalid');
});

test('managed cycle checks opt-in, online state, exact ack and account/device headers; retains lost upload bytes',async()=>{
  const {d}=driver();let now=1000,online=false,active=true,fail=false,requests=0;
  const intent=createCloudSyncIntent(d,scope,()=>now),first=await payload('first'),second=await payload('second');
  let latest=first,rows:unknown[]=[],sent:string[]=[];
  const deps={scope,intent,signal:new AbortController().signal,isActive:()=>active,online:()=>online,
    latestAutosave:async()=>latest,request:async(url:string,init:RequestInit)=>{
      requests++;
      assert.ok(url.endsWith('/cloud-autosaves'));
      const headers=new Headers(init.headers);
      assert.equal(headers.get('x-slopboy-sync-account'),scope.accountId);
      assert.equal(headers.get('x-slopboy-sync-device'),scope.deviceId);
      if(init.method==='POST'){
        const raw=String(init.body);sent.push(raw);
        const v=await decodeCloudSnapshot(raw,scope),s=v.snapshot;
        rows=[{id:crypto.randomUUID(),slotId:v.slotId,slotName:v.slotName,snapshotId:s.id,snapshotName:s.name,
          kind:s.kind,revisionId:s.revisionId,releaseVersion:s.releaseVersion,schemaVersion:s.schemaVersion,
          hardwareId:v.hardwareId+'@'+v.hardwareVersion,snapshotCreatedAt:s.createdAt,payloadBytes:s.bytes,payloadDigest:s.digest,
          bytes:new TextEncoder().encode(raw).byteLength,digest:await cloudSnapshotDigest(raw),storedAt:new Date().toISOString()}];
        if(fail)throw Error('lost response');
      }
      return Response.json({snapshots:rows,usedBytes:1000});
    }};
  const run=()=>runManagedSyncCycle(deps);
  assert.equal(await run(),'offline');online=true;
  assert.equal(await run(),'disabled');assert.equal(requests,0);
  await intent.setEnabled(true);fail=true;
  assert.equal(await run(),'unavailable');assert.equal((await intent.status()).pending,true);
  latest=second;fail=false;now+=SYNC_CYCLE_MS-1;
  assert.equal(await run(),'throttled');
  now++;assert.equal(await run(),'synced');assert.deepEqual(sent,[first,first]);
  now+=SYNC_CYCLE_MS;assert.equal(await run(),'synced');assert.deepEqual(sent,[first,first,second]);
  now+=SYNC_CYCLE_MS;assert.equal(await run(),'idle');assert.equal(sent.length,3);
  active=false;assert.equal(await run(),'cancelled');
});
test('managed cycle rejects wrong acknowledgment and fences opt-out during request',async()=>{
  const {d}=driver();let now=1000;const intent=createCloudSyncIntent(d,scope,()=>now),raw=await payload('private');
  await intent.setEnabled(true);
  const deps={scope,intent,signal:new AbortController().signal,isActive:()=>true,online:()=>true,latestAutosave:async()=>raw,
    request:async()=>Response.json({snapshots:[],usedBytes:0})};
  assert.equal(await runManagedSyncCycle(deps),'unavailable');
  assert.equal((await intent.status()).pending,true);
  now+=SYNC_CYCLE_MS;
  assert.equal(await runManagedSyncCycle({...deps,request:async()=>{await intent.setEnabled(false);return Response.json({snapshots:[],usedBytes:0});}}),'cancelled');
  assert.equal((await intent.status()).pending,true);
});

test('browser installation identity is atomic, stable across tabs and refuses corruption',async()=>{
  const {d,records}=driver();const ids=await Promise.all([getCloudSyncDeviceId(d),getCloudSyncDeviceId(d),getCloudSyncDeviceId(d)]);
  assert.equal(new Set(ids).size,1);assert.equal(await getCloudSyncDeviceId(d),ids[0]);
  records.set([...records.keys()][0],'bad-device');await assert.rejects(getCloudSyncDeviceId(d),/INVALID_SYNC_DEVICE/);
});

test('account save drivers isolate all local reads, writes, atomic updates and deletion from guests and other accounts',async()=>{
  const {d}=driver(),a=accountSaveDriver(d,scope.accountId),b=accountSaveDriver(d,crypto.randomUUID());
  await d.put('slot','guest');await a.put('slot','first');await b.put('slot','second');
  assert.equal(await a.get('slot'),'first');assert.equal(await b.get('slot'),'second');assert.equal(await d.get('slot'),'guest');
  await a.update('slot',raw=>{assert.equal(raw,'first');return {value:'updated',result:true};});
  assert.equal(await accountSaveDriver(d,scope.accountId).get('slot'),'updated');
  await a.delete('slot');assert.equal(await a.get('slot'),undefined);assert.equal(await d.get('slot'),'guest');assert.equal(await b.get('slot'),'second');
  assert.throws(()=>accountSaveDriver(d,'invalid'),/INVALID_SAVE_ACCOUNT/);
});

test('pinned sync has separate opt-in and pending bytes, never sends autosaves to named lane',async()=>{
  const {d}=driver();let now=1000;
  const auto=createCloudSyncIntent(d,scope,()=>now),pinned=createCloudSyncIntent(d,scope,()=>now,'pinned');
  const g=(await pinned.setEnabled(true))!,raw=await payload('manual backup');
  assert.equal((await auto.status()).enabled,false);
  await assert.rejects(pinned.stage(g,raw),/INVALID_SYNC_PAYLOAD/);
  const value=await decodeCloudSnapshot(raw,scope);value.snapshot.kind='backup';
  const backup=await encodeCloudSnapshot(value),sent:string[]=[];let rows:unknown[]=[],fail=true;
  const deps={scope,intent:pinned,signal:new AbortController().signal,isActive:()=>true,online:()=>true,nextPinnedSave:async()=>backup,
    request:async(url:string,init:RequestInit)=>{
      assert.ok(url.endsWith('/cloud-snapshots'));const headers=new Headers(init.headers);
      assert.equal(headers.get('x-slopboy-sync-account'),scope.accountId);assert.equal(headers.get('x-slopboy-sync-device'),null);
      if(init.method==='POST'){
        const raw=String(init.body);sent.push(raw);const v=await decodeCloudSnapshot(raw,scope),s=v.snapshot;
        rows=[{id:crypto.randomUUID(),slotId:v.slotId,slotName:v.slotName,snapshotId:s.id,snapshotName:s.name,kind:s.kind,revisionId:s.revisionId,
          releaseVersion:s.releaseVersion,schemaVersion:s.schemaVersion,hardwareId:v.hardwareId+'@'+v.hardwareVersion,snapshotCreatedAt:s.createdAt,payloadBytes:s.bytes,payloadDigest:s.digest,
          bytes:new TextEncoder().encode(raw).byteLength,digest:await cloudSnapshotDigest(raw),storedAt:new Date().toISOString()}];
        if(fail)throw Error('lost response');
      }
      return Response.json({snapshots:rows,usedBytes:1000});
    }};
  assert.equal(await runManagedSyncCycle(deps),'unavailable');assert.equal((await pinned.status()).pending,true);assert.equal((await auto.status()).pending,false);
  now+=SYNC_CYCLE_MS;fail=false;assert.equal(await runManagedSyncCycle(deps),'synced');assert.deepEqual(sent,[backup,backup]);
  now+=SYNC_CYCLE_MS;assert.equal(await runManagedSyncCycle(deps),'idle');assert.equal(sent.length,2);
});
