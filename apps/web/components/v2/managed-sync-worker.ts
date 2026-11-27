/** One bounded, foreground managed-autosave sync cycle.
 * The host must supply trusted signed-in scope, capability and current consent.
 * No timers, account discovery, UI or automatic activation here. */
import {cloudSnapshotDigest,decodeCloudSnapshot} from '../../../../packages/runtime/src/cloud-snapshot.ts';
import {type createCloudSyncIntent,type SyncScope,type SyncAcknowledgment} from '../../../../packages/runtime/src/cloud-sync-intent.ts';
import {parseCloudListing,type CloudListing} from './player-cloud-contract.ts';

type Intent=ReturnType<typeof createCloudSyncIntent>;
type Result='disabled'|'offline'|'throttled'|'idle'|'synced'|'pending'|'quota'|'rate-limited'|'unavailable'|'retired'|'cancelled';
interface CycleDependencies {
  scope:SyncScope;intent:Intent;signal:AbortSignal;
  isActive:()=>boolean;online:()=>boolean;
  latestAutosave:()=>Promise<string|null>;
  request:(url:string,init:RequestInit)=>Promise<Response>;
}
class SyncResponseError extends Error{constructor(readonly status:number,readonly code:unknown){super('SYNC_RESPONSE');}}
function exactAck(list:CloudListing,ack:SyncAcknowledgment){
  return list.snapshots.some(row=>row.kind==='auto'&&row.slotId===ack.slotId&&row.snapshotId===ack.snapshotId&&row.digest===ack.digest&&row.bytes===ack.bytes);
}
export async function runManagedSyncCycle(deps:CycleDependencies):Promise<Result>{
  const {intent,scope,signal}=deps;
  const active=()=>!signal.aborted&&deps.isActive();
  if(!active())return 'cancelled';
  if(!deps.online())return 'offline';
  try{
    const status=await intent.status(),generation=status.generation;
    if(!generation)return 'disabled';
    const check=async()=>{
      signal.throwIfAborted();
      if(!deps.isActive()||!deps.online()||(await intent.status()).generation!==generation)throw Error('SYNC_CANCELLED');
      signal.throwIfAborted();
      if(!deps.isActive()||!deps.online())throw Error('SYNC_CANCELLED');
    };
    if(!await intent.claimCycle(generation))return 'throttled';
    const endpoint='/api/account/games/'+encodeURIComponent(scope.gameId)+'/cloud-autosaves';
    const request=async(raw?:string)=>{
      await check();
      const headers:Record<string,string>={'x-slopboy-sync-account':scope.accountId,'x-slopboy-sync-device':scope.deviceId};
      if(raw!==undefined)headers['Content-Type']='application/json';
      const response=await deps.request(endpoint,{method:raw===undefined?'GET':'POST',headers,body:raw,
        credentials:'same-origin',cache:'no-store',redirect:'error',signal});
      const value:unknown=await response.json().catch(()=>null);
      await check();
      if(!response.ok)throw new SyncResponseError(response.status,value&&typeof value==='object'&&'error' in value?value.error:undefined);
      return parseCloudListing(value);
    };
    if(!status.pending){
      const raw=await deps.latestAutosave();
      if(raw===null)return 'idle';
      const value=await decodeCloudSnapshot(raw,scope);
      if(value.snapshot.kind!=='auto'||!value.snapshot.revisionId)throw Error('INVALID_SYNC_PAYLOAD');
      const ack={digest:await cloudSnapshotDigest(raw),bytes:new TextEncoder().encode(raw).byteLength,slotId:value.slotId,snapshotId:value.snapshot.id};
      // Avoid staging on a disabled backend, and avoid repeatedly uploading the newest acknowledged autosave.
      const listing=await request();
      if(exactAck(listing,ack))return 'idle';
      await check();
      await intent.stage(generation,raw);
    }
    const pending=await intent.claimAttempt(generation);
    if(!pending)return 'pending';
    const value=await decodeCloudSnapshot(pending.raw,scope);
    if(value.snapshot.kind!=='auto')throw Error('INVALID_SYNC_PAYLOAD');
    const listing=await request(pending.raw);
    if(!exactAck(listing,pending))throw Error('SYNC_ACK_MISMATCH');
    await check();
    return await intent.acknowledge(generation,pending)?'synced':'pending';
  }catch(error){
    if(!active()||error instanceof Error&&['SYNC_CANCELLED','SYNC_NOT_ENABLED'].includes(error.message))return 'cancelled';
    if(!deps.online())return 'offline';
    if(error instanceof SyncResponseError){
      if(error.status===429)return 'rate-limited';
      if(error.code==='BACKUP_QUOTA')return 'quota';
      if(error.code==='BACKUP_IN_PROGRESS')return 'pending';
      if(error.code==='AUTOSAVE_RETIRED')return 'retired';
    }
    return 'unavailable';
  }
}
