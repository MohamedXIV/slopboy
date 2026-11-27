/** Host-side named save HTTP contract. Dependency injection keeps auth/storage
 * behavior testable without connecting to a hosted database or bucket. */
import {createHash} from 'node:crypto';
import {isGameUuid} from '../../../packages/catalog/src/index.ts';
import {decodeCloudSnapshot,CLOUD_SNAPSHOT_MAX_BYTES,type CloudSnapshot} from '../../../packages/runtime/src/cloud-snapshot.ts';
import {reviewedPixelSaveCapabilities,supportsProgressSave,supportsAutosave,supportsManualSave} from '../../../packages/runtime/src/save-capabilities.ts';
import {sameOriginMutation} from '../lib/auth/auth-contract.ts';
import {readBoundedBytes} from './bounded-json.ts';
import {completeCloudBackup} from './cloud-backup-storage.ts';

export interface CloudGame {
  gameId:string;revisionId:string;hardware:{id:string;version:string};
}
type Listing={snapshots:unknown[];usedBytes:number};
type Reservation=Partial<Listing>&{outcome:string;backupId?:string;storageKey?:string};
type ReadyObject={id:string;storageKey:string;digest:string;bytes:number};
export interface NamedCloudDependencies {
  enabled():boolean;
  subject():Promise<{id:string;emailVerified:boolean}|null>;
  role(actor:{id:string;emailVerified:boolean}):Promise<unknown>;
  game(gameId:string):Promise<CloudGame|null>;
  consumeRequest(account:string):Promise<boolean>;
  list(account:string,game:string):Promise<Listing|null>;
  reserve(account:string,game:string,digest:string,bytes:number,meta:ReturnType<typeof snapshotMetadata>):Promise<Reservation|null>;
  confirm(account:string,game:string,id:string):Promise<Reservation|null>;
  lookup(account:string,game:string,id:string):Promise<ReadyObject|null>;
  upload(key:string,account:string,game:string,id:string,digest:string,bytes:Uint8Array):Promise<void>;
  download(key:string,account:string,game:string,id:string,digest:string,bytes:number):Promise<Uint8Array>;
}
export function namedCloudEnabled(env:Readonly<Record<string,string|undefined>>):boolean {
  return env.CLOUD_NAMED_SNAPSHOTS_ENABLED==='1';
}
const json=(body:object,status=200)=>Response.json(body,{status,headers:{
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
}});
const error=(code:string,status:number)=>json({error:code},status);
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function listing(value:Partial<Listing>|null,status=200){
  if(!value||!Array.isArray(value.snapshots)||!Number.isSafeInteger(value.usedBytes)||value.usedBytes!<0)
    return error('UNAVAILABLE',503);
  // Only public metadata fields, even if SQL gains additional internal fields.
  const snapshots=value.snapshots.map(item=>{
    const s=item as Record<string,unknown>;
    const keys=['id','slotId','slotName','snapshotId','snapshotName','kind','revisionId','releaseVersion',
      'schemaVersion','hardwareId','snapshotCreatedAt','payloadBytes','payloadDigest','bytes','digest','storedAt'];
    return Object.fromEntries(keys.map(key=>[key,s[key]]));
  });
  return json({snapshots,usedBytes:value.usedBytes},status);
}
export function snapshotMetadata(value:CloudSnapshot){
  const s=value.snapshot;
  return {slotId:value.slotId,slotName:value.slotName,snapshotId:s.id,snapshotName:s.name,kind:s.kind,
    revisionId:s.revisionId,releaseVersion:s.releaseVersion,schemaVersion:s.schemaVersion,
    hardwareId:value.hardwareId+'@'+value.hardwareVersion,snapshotCreatedAt:s.createdAt,payloadBytes:s.bytes,payloadDigest:s.digest};
}
/** Conservative first rollout: only exact reviewed Pixel-v1 capabilities.
 * Unknown source revisions are not promoted to known provenance. */
export function eligibleSnapshot(value:CloudSnapshot,game:CloudGame):boolean {
  const current=reviewedPixelSaveCapabilities(game.gameId,game.revisionId);
  if(!supportsProgressSave(current)||value.gameId!==game.gameId||
    value.hardwareId!==game.hardware.id||value.hardwareVersion!==game.hardware.version)return false;
  const s=value.snapshot;
  if(s.revisionId===null)return !['auto','manual'].includes(s.kind)&&s.releaseVersion===null;
  const source=reviewedPixelSaveCapabilities(game.gameId,s.revisionId);
  return supportsProgressSave(source)&&source?.schemaVersion===s.schemaVersion&&
    (s.kind!=='auto'||supportsAutosave(source))&&(s.kind!=='manual'||supportsManualSave(source));
}
export type ManagedCloudScope={expectedAccount:string;deviceId:string};
export function managedCloudEnabled(env:Readonly<Record<string,string|undefined>>):boolean{return env.CLOUD_MANAGED_AUTOSAVES_ENABLED==='1';}
export async function handleNamedCloud(request:Request,gameId:string,deps:NamedCloudDependencies,managed?:ManagedCloudScope):Promise<Response>{
  try{
    if(!deps.enabled())return error('NOT_FOUND',404);
    const create=request.method==='POST';
    if(!create&&request.method!=='GET')return error('METHOD_NOT_ALLOWED',405);
    if(create&&!sameOriginMutation(request.headers.get('origin'),request.url,
      request.headers.get('sec-fetch-site'),request.headers.get('host')))return error('INVALID_ORIGIN',403);
    if(!create&&['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??''))
      return error('INVALID_ORIGIN',403);
    const actor=await deps.subject();
    if(!actor)return error('UNAUTHENTICATED',401);
    if(!actor.emailVerified)return error('FORBIDDEN',403);
    if(!isGameUuid(gameId)||!isGameUuid(actor.id))return error('NOT_FOUND',404);
    const account=actor.id.toLowerCase(),gameKey=gameId.toLowerCase();
    if(managed&&(!isGameUuid(managed.expectedAccount)||!isGameUuid(managed.deviceId)||managed.expectedAccount.toLowerCase()!==account))
      return error('SYNC_SCOPE_MISMATCH',403);
    if(await deps.role(actor)!=='admin')return error('NOT_FOUND',404);
    if(!await deps.consumeRequest(account))return Response.json({error:'CLOUD_RATE_LIMIT'},{status:429,headers:{
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    }});
    const game=await deps.game(gameKey);
    if(!game||game.gameId!==gameKey||!supportsProgressSave(reviewedPixelSaveCapabilities(game.gameId,game.revisionId)))
      return error('NOT_FOUND',404);
    const identity={gameId:gameKey,hardwareId:game.hardware.id,hardwareVersion:game.hardware.version};
    const query=new URL(request.url).searchParams;
    const ids=query.getAll('backupId');
    if([...query.keys()].some(key=>key!=='backupId')||ids.length>1||(create&&ids.length))
      return error('INVALID_QUERY',400);
    if(!create){
      if(!ids.length){
        const result=await deps.list(account,gameKey);
        return result?listing(result):error('NOT_FOUND',404);
      }
      const id=ids[0].toLowerCase();
      if(!isGameUuid(id))return error('NOT_FOUND',404);
      const row=await deps.lookup(account,gameKey,id);
      if(!row)return error('NOT_FOUND',404);
      if(row.id!==id||row.bytes<1||row.bytes>CLOUD_SNAPSHOT_MAX_BYTES||!Number.isSafeInteger(row.bytes)||
        !/^[a-f0-9]{64}$/.test(row.digest))return error('UNAVAILABLE',503);
      const bytes=await deps.download(row.storageKey,account,gameKey,id,row.digest,row.bytes);
      if(bytes.byteLength!==row.bytes||hash(bytes)!==row.digest)return error('UNAVAILABLE',503);
      const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      await decodeCloudSnapshot(raw,identity);
      // Restore only transfers verified bytes; the host owns explicit local import.
      return json({snapshot:raw});
    }
    if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')
      return error('EXPECTED_JSON',415);
    let value:CloudSnapshot,bytes:Uint8Array;
    try{
      bytes=await readBoundedBytes(request,CLOUD_SNAPSHOT_MAX_BYTES);
      const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      value=await decodeCloudSnapshot(raw,identity);
      if(!eligibleSnapshot(value,game)||(managed&&value.snapshot.kind!=='auto'))throw Error('UNREVIEWED_SAVE');
    }catch{return error('INVALID_SAVE',400);}
    const digest=hash(bytes);
    const reserved=await deps.reserve(account,gameKey,digest,bytes.byteLength,snapshotMetadata(value));
    if(!reserved)return error('UNAVAILABLE',503);
    if(reserved.outcome==='not_found')return error('NOT_FOUND',404);
    if(reserved.outcome==='invalid')return error('INVALID_SAVE',400);
    if(reserved.outcome==='quota')return error('BACKUP_QUOTA',409);
    if(reserved.outcome==='in_progress')return error('BACKUP_IN_PROGRESS',409);
    if(managed&&reserved.outcome==='retired')return error('AUTOSAVE_RETIRED',409);
    if(reserved.outcome==='replayed')return listing(reserved);
    if(!['reserved','resumed'].includes(reserved.outcome)||!reserved.backupId||!reserved.storageKey)return error('UNAVAILABLE',503);
    const {storageKey,backupId}=reserved;
    const confirmed=await completeCloudBackup(
      ()=>deps.upload(storageKey,account,gameKey,backupId,digest,bytes),
      ()=>deps.confirm(account,gameKey,backupId),
    );
    if(!confirmed||!['stored','replayed'].includes(confirmed.outcome))return error('UNAVAILABLE',503);
    return listing(confirmed,confirmed.outcome==='stored'?201:200);
  }catch{
    // No speculative cleanup or success if confirmation was ambiguous.
    return error('UNAVAILABLE',503);
  }
}
