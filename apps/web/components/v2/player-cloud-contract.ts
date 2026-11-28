import {cloudSnapshotDigest,decodeCloudSnapshot,type CloudSnapshotIdentity} from '../../../../packages/runtime/src/cloud-snapshot.ts';
import type {SlotListing} from '../../../../packages/runtime/src/save-slots.ts';

export type CloudRow={id:string;slotId:string;slotName:string;snapshotId:string;snapshotName:string;kind:string;
  revisionId:string|null;releaseVersion:string|null;schemaVersion:number;hardwareId:string;snapshotCreatedAt:number|null;
  payloadBytes:number;payloadDigest:string;bytes:number;digest:string;storedAt:string};
export type CloudListing={snapshots:CloudRow[];usedBytes:number;deletedSnapshotIds?:string[]};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sha=/^[a-f0-9]{64}$/;
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=160;
const int=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const maxBytes=256*1024;
export const ACCOUNT_CLOUD_BYTES=10*1024*1024;
export const CLOUD_GAME_LIMIT=5;
function isRow(v:unknown):v is CloudRow{
  return obj(v)&&typeof v.id==='string'&&uuid.test(v.id)&&typeof v.slotId==='string'&&uuid.test(v.slotId)&&
    typeof v.snapshotId==='string'&&uuid.test(v.snapshotId)&&text(v.slotName)&&text(v.snapshotName)&&
    typeof v.kind==='string'&&['auto','manual','backup','fork','legacy'].includes(v.kind)&&
    (v.revisionId===null||typeof v.revisionId==='string'&&uuid.test(v.revisionId))&&
    (v.releaseVersion===null||text(v.releaseVersion))&&int(v.schemaVersion,1,9999)&&text(v.hardwareId)&&
    (v.snapshotCreatedAt===null||int(v.snapshotCreatedAt,1,8640000000000000))&&
    int(v.payloadBytes,0,maxBytes)&&int(v.bytes,1,maxBytes)&&v.payloadBytes<=v.bytes&&
    typeof v.payloadDigest==='string'&&sha.test(v.payloadDigest)&&typeof v.digest==='string'&&sha.test(v.digest)&&
    typeof v.storedAt==='string'&&Number.isFinite(Date.parse(v.storedAt));
}
export function parseCloudListing(v:unknown):CloudListing{
  if(!obj(v)||!Array.isArray(v.snapshots)||v.snapshots.length>CLOUD_GAME_LIMIT||
    !v.snapshots.every(isRow)||!int(v.usedBytes,0,ACCOUNT_CLOUD_BYTES)||
    new Set(v.snapshots.map(row=>row.id)).size!==v.snapshots.length)throw Error('INVALID_CLOUD_RESPONSE');
  const deleted=v.deletedSnapshotIds;
  if(deleted!==undefined&&(!Array.isArray(deleted)||deleted.length>1000||!deleted.every(id=>typeof id==='string'&&uuid.test(id))||new Set(deleted).size!==deleted.length))throw Error('INVALID_CLOUD_RESPONSE');
  return {snapshots:v.snapshots,usedBytes:v.usedBytes,...(deleted===undefined?{}:{deletedSnapshotIds:deleted as string[]})};
}
export function cloudCompatibility(row:CloudRow,identity:CloudSnapshotIdentity,schema:number):'Compatible'|'Incompatible'|'Unknown compatibility'{
  if(row.hardwareId!==identity.hardwareId+'@'+identity.hardwareVersion||row.schemaVersion!==schema)return 'Incompatible';
  return row.revisionId?'Compatible':'Unknown compatibility';
}
export function exactLocalCloudMatch(row:CloudRow,local:SlotListing|null,identity:CloudSnapshotIdentity):boolean{
  if(row.hardwareId!==identity.hardwareId+'@'+identity.hardwareVersion)return false;
  const slot=local?.slots.find(s=>s.id===row.slotId);
  const s=slot?.snapshots.find(s=>s.id===row.snapshotId);
  return Boolean(slot&&s&&slot.name===row.slotName&&s.name===row.snapshotName&&s.kind===row.kind&&
    s.digest===row.payloadDigest&&s.bytes===row.payloadBytes&&s.schemaVersion===row.schemaVersion&&
    s.revisionId===row.revisionId&&s.releaseVersion===row.releaseVersion&&s.createdAt===row.snapshotCreatedAt);
}
export function localComparison(row:CloudRow,local:SlotListing|null){
  const slot=local?.slots.find(s=>s.id===row.slotId);
  if(!slot)return {status:'different-slot' as const,slot:null,head:null};
  const head=slot.snapshots.find(s=>s.id===slot.headId)??null;
  if(!head||head.id!==row.snapshotId||head.digest!==row.payloadDigest||head.schemaVersion!==row.schemaVersion||
    head.revisionId!==row.revisionId||head.kind!==row.kind||head.createdAt!==row.snapshotCreatedAt||
    head.releaseVersion!==row.releaseVersion||head.bytes!==row.payloadBytes)return {status:'conflict' as const,slot,head};
  return {status:slot.name===row.slotName&&head.name===row.snapshotName?'same' as const:'metadata-changed' as const,slot,head};
}
export async function verifyDownloadedSnapshot(value:unknown,row:CloudRow,identity:CloudSnapshotIdentity):Promise<string>{
  if(!obj(value)||typeof value.snapshot!=='string'||new TextEncoder().encode(value.snapshot).byteLength!==row.bytes||
    await cloudSnapshotDigest(value.snapshot)!==row.digest)throw Error('CLOUD_CHANGED');
  const s=await decodeCloudSnapshot(value.snapshot,identity);
  if(s.slotId!==row.slotId||s.slotName!==row.slotName||s.snapshot.id!==row.snapshotId||
    s.snapshot.name!==row.snapshotName||s.snapshot.kind!==row.kind||s.snapshot.revisionId!==row.revisionId||
    s.snapshot.releaseVersion!==row.releaseVersion||s.snapshot.schemaVersion!==row.schemaVersion||
    s.snapshot.createdAt!==row.snapshotCreatedAt||s.snapshot.bytes!==row.payloadBytes||
    s.snapshot.digest!==row.payloadDigest||s.hardwareId+'@'+s.hardwareVersion!==row.hardwareId)throw Error('CLOUD_CHANGED');
  return value.snapshot;
}
export function cloudErrorMessage(status:number,code?:string):string{
  if(status===429)return 'Cloud request limit reached. Try again later. Your local save is safe.';
  if(status===401)return 'Sign in to use cloud saves.';
  if(status===403)return 'Cloud saves are not available to this account.';
  if(status===404)return 'Cloud saves are unavailable or this save is no longer accessible.';
  if(code==='BACKUP_IN_PROGRESS')return 'A cloud upload is pending confirmation. Retry the same unchanged snapshot after a minute. Your local save is safe.';
  if(code==='BACKUP_DELETED')return 'This cloud copy was deleted. Create a new local backup to upload it again.';
  if(code==='BACKUP_CHANGED')return 'Cloud backup changed or cannot be managed. Refresh the list and try again.';
  if(code==='BACKUP_QUOTA')return 'Cloud storage limit reached. Your local save is safe.';
  if(code==='INVALID_SAVE')return 'This save cannot be uploaded in its current format.';
  return 'Cloud request failed. Your local saves remain on this device.';
}
