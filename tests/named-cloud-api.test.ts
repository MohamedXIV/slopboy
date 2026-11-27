import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GAMES} from '../packages/catalog/src/index.ts';
import {encodeCloudSnapshot,cloudSnapshotDigest,CLOUD_SNAPSHOT_FORMAT} from '../packages/runtime/src/cloud-snapshot.ts';
import {handleNamedCloud,namedCloudEnabled,managedCloudEnabled,type NamedCloudDependencies} from '../apps/web/server/named-cloud-api.ts';

const game=GAMES[2],a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const url='https://slopboy.test/api/account/games/'+game.gameId+'/cloud-snapshots';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function envelope(){
  return {format:CLOUD_SNAPSHOT_FORMAT,gameId:game.gameId,hardwareId:game.hardware.id,hardwareVersion:game.hardware.version,
    slotId:id,slotName:'Adventure',snapshot:{id,name:'Checkpoint',kind:'auto',revisionId:game.revisionId,
      releaseVersion:null,schemaVersion:1,createdAt:1234,data:'progress',bytes:8,digest:await cloudSnapshotDigest('progress')}};
}
function harness(){
  let actor:string|null=a,role='admin',verified=true,enabled=true,failUpload=false,failConfirm=false,corrupt=false,allow=true,retry=false;
  let stored:Uint8Array|null=null,ready=false,digest='',size=0,owner='',uploads=0,reserves=0;
  const key='backups/private-object.json';
  const deps:NamedCloudDependencies={
    enabled:()=>enabled,subject:async()=>actor?{id:actor,emailVerified:verified}:null,role:async()=>role,
    game:async()=>game,consumeRequest:async()=>allow,
    list:async account=>({snapshots:ready&&owner===account?[{id,storageKey:key,slotName:'Adventure'}]:[],usedBytes:owner===account?size:0}),
    reserve:async(account,_game,d,n,meta)=>{
      reserves++;assert.equal(meta.slotName,'Adventure');assert.equal('data' in meta,false);
      if(owner===account&&digest===d)return ready?{outcome:'replayed',snapshots:[{id}],usedBytes:size}:retry?{outcome:'resumed',backupId:id,storageKey:key}:{outcome:'in_progress'};
      owner=account;digest=d;size=n;return {outcome:'reserved',backupId:id,storageKey:key};
    },
    confirm:async()=>{if(failConfirm)throw Error('lost');ready=true;return {outcome:'stored',snapshots:[{id}],usedBytes:size};},
    lookup:async(account,_game,backup)=>ready&&owner===account&&backup===id?{id,storageKey:key,digest,bytes:size}:null,
    upload:async(_key,account,_game,_id,d,bytes)=>{uploads++;if(failUpload)throw Error('storage');assert.equal(account,a);assert.equal(hash(bytes),d);stored=bytes;},
    download:async()=>corrupt?new TextEncoder().encode('wrong'):stored!,
  };
  return {deps,setActor:(x:string|null)=>actor=x,setRole:(x:string)=>role=x,setVerified:(x:boolean)=>verified=x,
    setEnabled:(x:boolean)=>enabled=x,failUpload:()=>failUpload=true,failConfirm:()=>failConfirm=true,corrupt:()=>corrupt=true,
    allow:(x:boolean)=>allow=x,retry:()=>{retry=true;failUpload=false;failConfirm=false;},
    counts:()=>({uploads,reserves}),ready:()=>ready};
}
const post=(raw:string,origin='https://slopboy.test')=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:raw});
const get=(backup?:string)=>new Request(url+(backup?'?backupId='+backup:''));
test('named cloud is separately opt-in and denies unauthorized requests before writes',async()=>{
  assert.equal(namedCloudEnabled({}),false);assert.equal(namedCloudEnabled({CLOUD_NAMED_SNAPSHOTS_ENABLED:'1'}),true);
  const h=harness(),raw=await encodeCloudSnapshot(await envelope());
  const run=(req:Request)=>handleNamedCloud(req,game.gameId,h.deps);
  h.setEnabled(false);assert.equal((await run(post(raw))).status,404);h.setEnabled(true);
  h.setActor(null);assert.equal((await run(post(raw))).status,401);h.setActor(a);
  h.setVerified(false);assert.equal((await run(post(raw))).status,403);h.setVerified(true);
  h.setRole('player');assert.equal((await run(post(raw))).status,404);h.setRole('admin');
  assert.equal((await run(post(raw,'https://other.test'))).status,403);
  assert.equal((await run(new Request(url+'?accountId='+b))).status,400);
  assert.equal((await run(post(raw+' '))).status,400);
  assert.equal((await run(post(raw.replace('progress','tampered')))).status,400);
  assert.equal((await run(post(await encodeCloudSnapshot({...await envelope(),snapshot:{...(await envelope()).snapshot,kind:'manual'}})))).status,400);
  assert.deepEqual(h.counts(),{uploads:0,reserves:0});
});
test('verified upload, idempotent retry, private listing and cross-account restore',async()=>{
  const h=harness(),raw=await encodeCloudSnapshot(await envelope());
  const run=(req:Request)=>handleNamedCloud(req,game.gameId,h.deps);
  assert.equal((await run(post(raw))).status,201);
  assert.equal((await run(post(raw))).status,200);assert.equal(h.counts().uploads,1);
  const list=await run(get());assert.equal(list.headers.get('cache-control'),'private, no-store');
  assert.equal(JSON.stringify(await list.json()).includes('storageKey'),false);
  assert.deepEqual(await (await run(get(id))).json(),{snapshot:raw});
  h.setActor(b);assert.equal((await run(get(id))).status,404);
  assert.deepEqual((await (await run(get())).json()).snapshots,[]);
  h.setActor(a);h.corrupt();assert.equal((await run(get(id))).status,503);
});
test('unconfirmed upload never reports success or becomes restorable',async()=>{
  const raw=await encodeCloudSnapshot(await envelope());
  for(const failure of ['upload','confirm']){
    const h=harness();if(failure==='upload')h.failUpload();else h.failConfirm();
    assert.equal((await handleNamedCloud(post(raw),game.gameId,h.deps)).status,503);
    assert.equal(h.ready(),false);
    assert.equal((await handleNamedCloud(get(id),game.gameId,h.deps)).status,404);
    assert.equal((await handleNamedCloud(post(raw),game.gameId,h.deps)).status,409);
    h.retry();assert.equal((await handleNamedCloud(post(raw),game.gameId,h.deps)).status,201);
    assert.equal(h.ready(),true);
    assert.deepEqual(await (await handleNamedCloud(get(id),game.gameId,h.deps)).json(),{snapshot:raw});
  }
});

test('rate denial precedes game/storage access and fails closed',async()=>{
  const h=harness(),raw=await encodeCloudSnapshot(await envelope());
  h.allow(false);
  for(const req of [get(),get(id),post(raw)]){
    const result=await handleNamedCloud(req,game.gameId,h.deps);
    assert.equal(result.status,429);assert.deepEqual(await result.json(),{error:'CLOUD_RATE_LIMIT'});
  }
  assert.deepEqual(h.counts(),{uploads:0,reserves:0});
  h.deps.consumeRequest=async()=>{throw Error('database unavailable');};
  assert.equal((await handleNamedCloud(post(raw),game.gameId,h.deps)).status,503);
  assert.deepEqual(h.counts(),{uploads:0,reserves:0});
});

test('managed autosave requests bind the active authenticated account before reservation or listing',async()=>{
  assert.equal(managedCloudEnabled({}),false);
  assert.equal(managedCloudEnabled({CLOUD_MANAGED_AUTOSAVES_ENABLED:'1'}),true);
  const h=harness(),raw=await encodeCloudSnapshot(await envelope()),scope={expectedAccount:a,deviceId:id};
  const run=(request:Request)=>handleNamedCloud(request,game.gameId,h.deps,scope);
  h.setActor(b);
  assert.equal((await run(post(raw))).status,403);
  assert.equal((await run(get())).status,403);
  assert.deepEqual(h.counts(),{uploads:0,reserves:0});
  h.setActor(a);
  assert.equal((await handleNamedCloud(post(raw),game.gameId,h.deps,{...scope,deviceId:'invalid'})).status,403);
  const backup=await envelope();backup.snapshot.kind='backup';
  assert.equal((await run(post(await encodeCloudSnapshot(backup)))).status,400);
  assert.equal((await run(post(raw))).status,201);
  assert.equal((await run(post(raw))).status,200);
  assert.deepEqual(await (await run(get(id))).json(),{snapshot:raw});
  h.deps.reserve=async()=>({outcome:'retired'});
  assert.deepEqual(await (await run(post(raw))).json(),{error:'AUTOSAVE_RETIRED'});
});
