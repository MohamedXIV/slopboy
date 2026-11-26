import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCloudInventory} from '../tools/cloud-storage-audit.ts';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',game='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const capture='2026-11-26T12:00:00Z',old='2026-11-26T11:00:00Z',recent='2026-11-26T11:59:00Z';
function row(n:number,status:'ready'|'pending'='ready',lane:'legacy'|'named'='named'){
  const id='cccccccc-cccc-4ccc-8ccc-'+String(n).padStart(12,'0'),digest='a'.repeat(64);
  return {lane,id,accountId:account,gameId:game,key:'backups/'+account+'/'+game+'/'+id+'/'+digest+'.json',
    bytes:20,digest,status,createdAt:old,readyAt:status==='ready'?old:null,lastAttemptAt:null};
}
function object(key:string,Size=20,LastModified=old){return {Key:key,Size,LastModified};}
function metadata(rows:unknown[]){return {capturedAt:capture,complete:true,rows};}
function storage(Contents:unknown[]){return {Prefix:'backups/',KeyCount:Contents.length,IsTruncated:false,Contents};}
test('offline audit classifies both lanes without exposing keys or inferring integrity',()=>{
  const rows=[row(1),row(2,'ready','legacy'),row(3),row(4,'pending'),row(5,'pending','legacy'),row(6,'pending'),
    {...row(7,'pending'),lastAttemptAt:recent}];
  const objects=[object(rows[0].key),object(rows[2].key,19),object(rows[3].key),
    object(rows[5].key,21),object(row(8).key),object(row(9).key,20,recent),object('backups/unexpected')];
  const report=compareCloudInventory(metadata(rows),storage(objects),capture);
  assert.deepEqual(report.counts,{'ready-size-match':1,'ready-missing':1,'ready-size-mismatch':1,'pending-stale-present':1,
    'pending-stale-missing':1,'pending-stale-size-mismatch':1,'pending-recent':1,'orphan-stale':1,'orphan-recent':1,'unexpected-key':1});
  assert.equal(report.integrityVerified,false);assert.equal(report.reservedBytes,140);assert.equal(report.observedObjectBytes,140);
  assert.ok(!JSON.stringify(report).includes(account));assert.ok(!JSON.stringify(report).includes('backups/'));
  assert.ok(report.entries.every(e=>/^[a-f0-9]{64}$/.test(e.keyRef)));
});
test('incomplete, cross-time, duplicate and invalid observations refuse classification',()=>{
  const r=row(1),m=metadata([r]),s=storage([object(r.key)]);
  for(const [db,objects,captured] of [
    [{...m,complete:false},s,capture],[m,{...s,IsTruncated:true},capture],
    [m,{...s,ContinuationToken:'previous'},capture],[m,{...s,KeyCount:2},capture],
    [metadata([r,r]),s,capture],[m,storage([object(r.key),object(r.key)]),capture],
    [metadata([{...r,key:row(2).key}]),s,capture],[m,s,'2026-11-26T12:06:00Z'],
  ] as const)assert.throws(()=>compareCloudInventory(db,objects,captured));
});
test('empty complete inventory is a valid observation, not a cleanup authorization',()=>{
  const report=compareCloudInventory(metadata([]),storage([]),capture);
  assert.deepEqual(report.counts,{});assert.equal(report.storageObjects,0);
  assert.equal(report.mode,'read-only-observations');
});
