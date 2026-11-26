import test from 'node:test';
import assert from 'node:assert/strict';
import {GAMES} from '../packages/catalog/src/index.ts';
import {encodeCloudSnapshot,cloudSnapshotDigest,CLOUD_SNAPSHOT_FORMAT} from '../packages/runtime/src/cloud-snapshot.ts';
import {parseCloudListing,cloudCompatibility,localComparison,verifyDownloadedSnapshot,cloudErrorMessage,type CloudRow} from '../apps/web/components/v2/player-cloud-contract.ts';
const game=GAMES[2],identity={gameId:game.gameId,hardwareId:game.hardware.id,hardwareVersion:game.hardware.version};
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',snap='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('cloud listing and restore compare metadata without trusting timestamps or replacing local state',async()=>{
  const snapshot={id:snap,name:'Checkpoint',kind:'auto' as const,revisionId:game.revisionId,releaseVersion:null,schemaVersion:1,
    createdAt:1234,data:'position',bytes:8,digest:await cloudSnapshotDigest('position')};
  const raw=await encodeCloudSnapshot({format:CLOUD_SNAPSHOT_FORMAT,...identity,slotId:id,slotName:'Adventure',snapshot});
  const row:CloudRow={id,slotId:id,slotName:'Adventure',snapshotId:snap,snapshotName:'Checkpoint',kind:'auto',
    revisionId:game.revisionId,releaseVersion:null,schemaVersion:1,hardwareId:identity.hardwareId+'@'+identity.hardwareVersion,
    snapshotCreatedAt:1234,payloadBytes:8,payloadDigest:snapshot.digest,bytes:new TextEncoder().encode(raw).byteLength,
    digest:await cloudSnapshotDigest(raw),storedAt:'2026-11-26T12:00:00Z'};
  assert.deepEqual(parseCloudListing({snapshots:[row],usedBytes:row.bytes}).snapshots,[row]);
  assert.throws(()=>parseCloudListing({snapshots:[row,row],usedBytes:row.bytes}));
  assert.throws(()=>parseCloudListing({snapshots:[{...row,digest:'bad'}],usedBytes:row.bytes}));
  assert.equal(cloudCompatibility(row,identity,1),'Compatible');
  assert.equal(cloudCompatibility(row,identity,2),'Incompatible');
  assert.equal(cloudCompatibility({...row,revisionId:null},identity,1),'Unknown compatibility');
  const local={selectedSlotId:id,slots:[{id,name:'Adventure',createdAt:1,headId:snap,snapshots:[snapshot]}]};
  assert.equal(localComparison(row,local).status,'same');
  assert.equal(localComparison({...row,slotName:'Renamed'},local).status,'metadata-changed');
  assert.equal(localComparison({...row,payloadDigest:'c'.repeat(64)},local).status,'conflict');
  assert.equal(localComparison(row,null).status,'different-slot');
  assert.equal(await verifyDownloadedSnapshot({snapshot:raw},row,identity),raw);
  await assert.rejects(verifyDownloadedSnapshot({snapshot:raw+' '},row,identity));
  await assert.rejects(verifyDownloadedSnapshot({snapshot:raw},{...row,slotName:'Changed'},identity));
  assert.match(cloudErrorMessage(409,'BACKUP_IN_PROGRESS'),/pending/);
});
