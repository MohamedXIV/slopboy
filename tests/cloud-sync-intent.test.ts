import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudSyncIntent,SYNC_RETRY_MS,type SyncScope} from '../packages/runtime/src/cloud-sync-intent.ts';
import {encodeCloudSnapshot,CLOUD_SNAPSHOT_FORMAT,cloudSnapshotDigest} from '../packages/runtime/src/cloud-snapshot.ts';
import type {AtomicSaveDriver} from '../packages/runtime/src/save-store.ts';

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
