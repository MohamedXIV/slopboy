import test from 'node:test';
import assert from 'node:assert/strict';
import {managedRestoreTransport} from '../apps/web/components/v2/managed-restore-transport.ts';
import {encodeCloudSnapshot,decodeCloudSnapshot,cloudSnapshotDigest,CLOUD_SNAPSHOT_FORMAT} from '../packages/runtime/src/cloud-snapshot.ts';
const account=crypto.randomUUID(),device=crypto.randomUUID(),gameId=crypto.randomUUID();
const identity={gameId,hardwareId:'slopboy-1000',hardwareVersion:'0.1.0'};
test('managed restore uses the selected source only for GETs and verifies the exact envelope',async()=>{
 const data='progress',raw=await encodeCloudSnapshot({format:CLOUD_SNAPSHOT_FORMAT,...identity,slotId:crypto.randomUUID(),slotName:'Run',
 snapshot:{id:crypto.randomUUID(),name:'Autosave',kind:'auto',revisionId:crypto.randomUUID(),releaseVersion:null,schemaVersion:1,createdAt:1234,data,bytes:8,digest:await cloudSnapshotDigest(data)}});
 const v=await decodeCloudSnapshot(raw,identity),s=v.snapshot;
 const row={id:crypto.randomUUID(),slotId:v.slotId,slotName:v.slotName,snapshotId:s.id,snapshotName:s.name,kind:s.kind,revisionId:s.revisionId,releaseVersion:s.releaseVersion,schemaVersion:s.schemaVersion,
 hardwareId:identity.hardwareId+'@'+identity.hardwareVersion,snapshotCreatedAt:s.createdAt,payloadBytes:s.bytes,payloadDigest:s.digest,bytes:new TextEncoder().encode(raw).byteLength,digest:await cloudSnapshotDigest(raw),storedAt:new Date().toISOString()};
 let calls=0,corrupt=false;
 const transport=managedRestoreTransport(account,identity,async(input,init)=>{
   calls++;const headers=new Headers(init?.headers);assert.equal(init?.method,'GET');assert.equal(headers.get('x-slopboy-sync-account'),account);
   if(String(input).endsWith('/cloud-autosave-devices')){assert.equal(headers.get('x-slopboy-sync-device'),null);return Response.json({devices:[{deviceId:device,count:1,lastSavedAt:row.storedAt}]});}
   assert.equal(headers.get('x-slopboy-sync-device'),device);
   if(String(input).includes('?backupId=')){assert.ok(String(input).endsWith(row.id));return Response.json({snapshot:corrupt?raw+' ':raw});}
   return Response.json({snapshots:[row],usedBytes:row.bytes});
 });
 const signal=new AbortController().signal;
 assert.equal((await transport.devices(signal))[0].deviceId,device);
 const list=await transport.listing(device,signal);assert.equal(list.snapshots.length,1);
 assert.equal(await transport.restore(device,list.snapshots[0],signal),raw);
 corrupt=true;await assert.rejects(transport.restore(device,row,signal),/CLOUD_CHANGED/);
 await assert.rejects(transport.listing('invalid',signal),/INVALID_RESTORE_SCOPE/);
 const stopped=new AbortController();stopped.abort();await assert.rejects(transport.devices(stopped.signal));assert.equal(calls,4);
});
