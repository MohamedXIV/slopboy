/** Host-only durable intent; not a network worker or account authorization.
 * A trusted signed-in host must bind the real account and browser identity.
 * No cartridge access and no storage of credentials. */
import type {AtomicSaveDriver} from './save-store.ts';
import {cloudSnapshotDigest,decodeCloudSnapshot,CLOUD_SNAPSHOT_MAX_BYTES,type CloudSnapshotIdentity} from './cloud-snapshot.ts';

const FORMAT='slopboy-cloud-sync-intent-v1';
const DEVICE_KEY='slopboy-cloud-sync-device-v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PART=/^[a-zA-Z0-9._-]{1,80}$/;
const SHA=/^[a-f0-9]{64}$/;
export const SYNC_RETRY_MS=60_000;
/** At most two requests per cycle, below the existing daily request cap for ordinary sessions. */
export const SYNC_CYCLE_MS=120_000;
const MAX_RECORD_BYTES=2*CLOUD_SNAPSHOT_MAX_BYTES+4096;
const bytes=(value:string)=>new TextEncoder().encode(value).byteLength;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const timestamp=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
/** Atomic browser installation identity; never an account credential. */
export async function getCloudSyncDeviceId(driver:AtomicSaveDriver):Promise<string>{
  return driver.update(DEVICE_KEY,raw=>{
    if(raw!==undefined&&(typeof raw!=='string'||!UUID.test(raw)))throw Error('INVALID_SYNC_DEVICE');
    const value=typeof raw==='string'?raw:crypto.randomUUID();return {value,result:value};
  });
}
export type SyncLane='auto'|'pinned';
export interface SyncScope extends CloudSnapshotIdentity {accountId:string;deviceId:string}
export interface PendingSync {
  raw:string;digest:string;bytes:number;slotId:string;snapshotId:string;lastAttemptAt:number|null;
}
interface Intent {
  format:typeof FORMAT;scope:SyncScope;generation:string|null;pending:PendingSync|null;lastCycleAt?:number;
}
export interface SyncAcknowledgment {
  digest:string;bytes:number;slotId:string;snapshotId:string;
}
function scopeKey(s:SyncScope){
  if(!UUID.test(s.accountId)||!UUID.test(s.deviceId)||!UUID.test(s.gameId)||!PART.test(s.hardwareId)||!PART.test(s.hardwareVersion))throw Error('INVALID_SYNC_SCOPE');
  return [FORMAT,s.accountId,s.deviceId,s.gameId,s.hardwareId,s.hardwareVersion].join(':');
}
function empty(scope:SyncScope):Intent{return {format:FORMAT,scope,generation:null,pending:null};}
function decode(raw:unknown,scope:SyncScope):Intent{
  if(raw===undefined)return empty(scope);
  if(typeof raw!=='string'||bytes(raw)>MAX_RECORD_BYTES)throw Error('INVALID_SYNC_INTENT');
  let v:unknown;
  try{v=JSON.parse(raw);}catch{throw Error('INVALID_SYNC_INTENT');}
  if(!object(v)||v.format!==FORMAT||!object(v.scope)||Object.keys(v.scope).length!==5||
    Object.keys(scope).some(k=>v.scope===null||!object(v.scope)||v.scope[k]!==scope[k as keyof SyncScope])||
    !(v.generation===null||typeof v.generation==='string'&&UUID.test(v.generation)))
    throw Error('INVALID_SYNC_INTENT');
  if(v.lastCycleAt!==undefined&&!timestamp(v.lastCycleAt))throw Error('INVALID_SYNC_INTENT');
  const p=v.pending;
  if(p!==null&&(!object(p)||typeof p.raw!=='string'||p.bytes!==bytes(p.raw)||Number(p.bytes)>CLOUD_SNAPSHOT_MAX_BYTES||
    typeof p.digest!=='string'||!SHA.test(p.digest)||typeof p.slotId!=='string'||!UUID.test(p.slotId)||
    typeof p.snapshotId!=='string'||!UUID.test(p.snapshotId)||!(p.lastAttemptAt===null||timestamp(p.lastAttemptAt))))
    throw Error('INVALID_SYNC_INTENT');
  return v as unknown as Intent;
}
function requireGeneration(intent:Intent,generation:string){
  if(!generation||intent.generation!==generation)throw Error('SYNC_NOT_ENABLED');
}
function matches(p:PendingSync,ack:SyncAcknowledgment){
  return p.digest===ack.digest&&p.bytes===ack.bytes&&p.slotId===ack.slotId&&p.snapshotId===ack.snapshotId;
}
async function verify(p:PendingSync,scope:SyncScope){
  const snapshot=await decodeCloudSnapshot(p.raw,scope);
  if(snapshot.slotId!==p.slotId||snapshot.snapshot.id!==p.snapshotId||await cloudSnapshotDigest(p.raw)!==p.digest||
    snapshot.snapshot.kind==='legacy'||snapshot.snapshot.revisionId===null)
    throw Error('INVALID_SYNC_PAYLOAD');
}
/** At most one exact in-flight envelope per account/game/browser.
 * New local saves coalesce in the local store; never replace an unresolved
 * reservation with a different digest. Pausing retains the exact retry bytes. */
export function createCloudSyncIntent(driver:AtomicSaveDriver,identity:SyncScope,clock=Date.now,lane:SyncLane='auto'){
  const scope:SyncScope={accountId:identity.accountId,deviceId:identity.deviceId,gameId:identity.gameId,
    hardwareId:identity.hardwareId,hardwareVersion:identity.hardwareVersion};
  if(lane!=='auto'&&lane!=='pinned')throw Error('INVALID_SYNC_LANE');
  const key=scopeKey(scope)+(lane==='pinned'?':pinned':'');
  const allowed=(kind:string)=>lane==='auto'?kind==='auto':kind==='manual'||kind==='backup';
  const read=async()=>decode(await driver.get(key),scope);
  const change=<T>(fn:(state:Intent)=>T)=>driver.update(key,raw=>{
    const state=decode(raw,scope),result=fn(state),value=JSON.stringify(state);
    if(bytes(value)>MAX_RECORD_BYTES)throw Error('SYNC_INTENT_QUOTA');
    return {value,result};
  });
  return {
    async status(){
      const state=await read();
      return {enabled:state.generation!==null,generation:state.generation,pending:Boolean(state.pending)};
    },
    async setEnabled(enabled:boolean):Promise<string|null>{
      return change(state=>{
        if(enabled&&!state.generation)state.generation=crypto.randomUUID();
        if(!enabled)state.generation=null;
        return state.generation;
      });
    },
    /** Durable throttle, shared across tabs and retained across disable/re-enable. */
    async claimCycle(generation:string):Promise<boolean>{
      return change(state=>{
        requireGeneration(state,generation);
        const now=clock();if(!timestamp(now))throw Error('INVALID_SYNC_CLOCK');
        if(state.lastCycleAt!==undefined&&now-state.lastCycleAt<SYNC_CYCLE_MS)return false;
        state.lastCycleAt=now;return true;
      });
    },
    async stage(generation:string,raw:string):Promise<SyncAcknowledgment>{
      const snapshot=await decodeCloudSnapshot(raw,scope);
      if(!allowed(snapshot.snapshot.kind)||snapshot.snapshot.revisionId===null)throw Error('INVALID_SYNC_PAYLOAD');
      const next:PendingSync={raw,digest:await cloudSnapshotDigest(raw),bytes:bytes(raw),slotId:snapshot.slotId,
        snapshotId:snapshot.snapshot.id,lastAttemptAt:null};
      return change(state=>{
        requireGeneration(state,generation);
        if(state.pending){
          if(!matches(state.pending,next)||state.pending.raw!==raw)throw Error('SYNC_PENDING');
        }else state.pending=next;
        return {digest:next.digest,bytes:next.bytes,slotId:next.slotId,snapshotId:next.snapshotId};
      });
    },
    /** Lease is local, not a server authorization or distributed writer fence.
     * Caller must additionally verify online state, active account, server
     * capability and current consent before making any request. */
    async claimAttempt(generation:string):Promise<PendingSync|null>{
      const state=await read();requireGeneration(state,generation);
      if(!state.pending)return null;
      const candidate=state.pending;await verify(candidate,scope);
      if(!allowed((await decodeCloudSnapshot(candidate.raw,scope)).snapshot.kind))throw Error('INVALID_SYNC_PAYLOAD');
      return change(current=>{
        requireGeneration(current,generation);
        if(!current.pending||!matches(current.pending,candidate)||current.pending.raw!==candidate.raw)return null;
        const now=clock();
        if(!timestamp(now))throw Error('INVALID_SYNC_CLOCK');
        if(current.pending.lastAttemptAt!==null&&now-current.pending.lastAttemptAt<SYNC_RETRY_MS)return null;
        current.pending.lastAttemptAt=now;
        return {...current.pending};
      });
    },
    /** Only invoke after authenticated server acknowledgment of this exact
     * immutable object and verified readback, not an optimistic HTTP success. */
    async acknowledge(generation:string,ack:SyncAcknowledgment):Promise<boolean>{
      return change(state=>{
        requireGeneration(state,generation);
        if(!state.pending||state.pending.lastAttemptAt===null||!matches(state.pending,ack))return false;
        state.pending=null;return true;
      });
    },
  };
}
