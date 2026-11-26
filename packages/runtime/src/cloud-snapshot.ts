/** Private transport envelope, separate from legacy raw autosave bytes.
 * No session tokens, account credentials, or arbitrary storage keys. */
import type {SlotSnapshot} from './save-slots.ts';

export const CLOUD_SNAPSHOT_FORMAT='slopboy-cloud-snapshot-v1';
/** Existing cloud quota counts the complete encoded object, including metadata. */
export const CLOUD_SNAPSHOT_MAX_BYTES=256*1024;
const encoder=new TextEncoder();
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const KEY_PART=/^[a-zA-Z0-9._-]{1,80}$/;
const SHA256=/^[a-f0-9]{64}$/;
const kinds=['auto','manual','backup','fork','legacy'];
const validId=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v);
const validName=(v:unknown):v is string=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=80&&!/[\u0000-\u001f\u007f]/.test(v);
const validTime=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const validKey=(v:unknown):v is string=>typeof v==='string'&&KEY_PART.test(v);
function exact(v:unknown,keys:string[]):v is Record<string,unknown>{
  return v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
}
export interface CloudSnapshot {
  format:typeof CLOUD_SNAPSHOT_FORMAT;
  gameId:string;
  hardwareId:string;
  hardwareVersion:string;
  slotId:string;
  slotName:string;
  snapshot:SlotSnapshot;
}
export type CloudSnapshotIdentity=Pick<CloudSnapshot,'gameId'|'hardwareId'|'hardwareVersion'>;
export async function cloudSnapshotDigest(data:string):Promise<string>{
  const hash=await crypto.subtle.digest('SHA-256',encoder.encode(data));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
function checked(value:unknown,expected?:CloudSnapshotIdentity):CloudSnapshot{
  if(!exact(value,['format','gameId','hardwareId','hardwareVersion','slotId','slotName','snapshot'])||
     value.format!==CLOUD_SNAPSHOT_FORMAT||!validId(value.gameId)||!validKey(value.hardwareId)||
     !validKey(value.hardwareVersion)||!validId(value.slotId)||!validName(value.slotName))
    throw Error('INVALID_CLOUD_SNAPSHOT');
  if(expected&&(value.gameId!==expected.gameId||value.hardwareId!==expected.hardwareId||value.hardwareVersion!==expected.hardwareVersion))
    throw Error('CLOUD_SNAPSHOT_IDENTITY_MISMATCH');
  const s=value.snapshot;
  if(!exact(s,['id','name','kind','revisionId','releaseVersion','schemaVersion','createdAt','data','bytes','digest'])||
    !validId(s.id)||!validName(s.name)||typeof s.kind!=='string'||!kinds.includes(s.kind)||
    !(s.revisionId===null||validId(s.revisionId))||
    !(s.releaseVersion===null||validName(s.releaseVersion))||
    typeof s.schemaVersion!=='number'||!Number.isSafeInteger(s.schemaVersion)||s.schemaVersion<1||s.schemaVersion>9999||
    !(s.createdAt===null||validTime(s.createdAt))||typeof s.data!=='string'||s.data.includes('\0')||
    s.bytes!==encoder.encode(s.data).byteLength||typeof s.digest!=='string'||!SHA256.test(s.digest))
    throw Error('INVALID_CLOUD_SNAPSHOT');
  if(s.kind==='legacy'&&(s.revisionId!==null||s.releaseVersion!==null||s.createdAt!==null))
    throw Error('INVALID_CLOUD_SNAPSHOT');
  if((s.kind==='auto'||s.kind==='manual')&&(s.revisionId===null||s.createdAt===null))
    throw Error('INVALID_CLOUD_SNAPSHOT');
  // Fixed order gives deterministic object bytes for retry/idempotency.
  return {format:CLOUD_SNAPSHOT_FORMAT,gameId:value.gameId,hardwareId:value.hardwareId,
    hardwareVersion:value.hardwareVersion,slotId:value.slotId,slotName:value.slotName,
    snapshot:{id:s.id,name:s.name,kind:s.kind as SlotSnapshot['kind'],revisionId:s.revisionId,
      releaseVersion:s.releaseVersion,schemaVersion:s.schemaVersion,createdAt:s.createdAt,data:s.data,bytes:s.bytes as number,digest:s.digest}};
}
export async function encodeCloudSnapshot(value:unknown,expected?:CloudSnapshotIdentity):Promise<string>{
  const envelope=checked(value,expected),raw=JSON.stringify(envelope);
  if(encoder.encode(raw).byteLength>CLOUD_SNAPSHOT_MAX_BYTES)throw Error('CLOUD_SNAPSHOT_TOO_LARGE');
  if(await cloudSnapshotDigest(envelope.snapshot.data)!==envelope.snapshot.digest)throw Error('SAVE_DIGEST_MISMATCH');
  return raw;
}
export async function decodeCloudSnapshot(raw:unknown,expected?:CloudSnapshotIdentity):Promise<CloudSnapshot>{
  if(typeof raw!=='string'||encoder.encode(raw).byteLength>CLOUD_SNAPSHOT_MAX_BYTES)throw Error('CLOUD_SNAPSHOT_TOO_LARGE');
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{throw Error('INVALID_CLOUD_SNAPSHOT');}
  const envelope=checked(parsed,expected);
  // Reject duplicate keys, noncanonical encodings, and trailing data. A server
  // must store/hash precisely the same canonical UTF-8 object the client sends.
  if(await encodeCloudSnapshot(envelope,expected)!==raw)throw Error('NONCANONICAL_CLOUD_SNAPSHOT');
  return envelope;
}
/** Compare exact immutable snapshot identity and payload, not timestamps.
 * Labels can change independently of gameplay; no automatic winner. */
export function compareCloudSnapshot(local:CloudSnapshot,remote:CloudSnapshot):'different-slot'|'same'|'metadata-changed'|'conflict'{
  if(local.gameId!==remote.gameId||local.hardwareId!==remote.hardwareId||local.hardwareVersion!==remote.hardwareVersion||local.slotId!==remote.slotId)
    return 'different-slot';
  const a=local.snapshot,b=remote.snapshot;
  if(a.id!==b.id||a.digest!==b.digest||a.schemaVersion!==b.schemaVersion||a.revisionId!==b.revisionId||
     a.kind!==b.kind||a.createdAt!==b.createdAt||a.releaseVersion!==b.releaseVersion||a.bytes!==b.bytes)return 'conflict';
  return local.slotName===remote.slotName&&a.name===b.name?'same':'metadata-changed';
}
