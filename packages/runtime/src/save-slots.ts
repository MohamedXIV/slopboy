/** Host-owned named playthroughs. No game code receives this store or its session token. */
import type {HardwareProfile} from '../../hardware/src/index.ts';
import {createGameSaveService,type AtomicSaveDriver} from './save-store.ts';
import {CLOUD_SNAPSHOT_FORMAT,encodeCloudSnapshot,decodeCloudSnapshot} from './cloud-snapshot.ts';
import {parseSaveCapabilities,supportsProgressSave,supportsAutosave,supportsManualSave,type SaveCapabilities} from './save-capabilities.ts';

const LEGACY_FORMAT='slopboy-save-slots-v1';
const FORMAT='slopboy-save-slots-v2';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_PART=/^[a-zA-Z0-9._-]{1,80}$/;
// Host storage policies, not imaginary device limits. Reject, never evict named saves.
export const LOCAL_SLOT_POLICY=Object.freeze({maxPayloadBytes:256*1024,maxRecordBytes:10*1024*1024,maxLabelLength:80,maxAutosaves:5});
const encoder=new TextEncoder();
const bytes=(s:string)=>encoder.encode(s).byteLength;
const id=()=>crypto.randomUUID();
const validId=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v);
const positiveTime=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const validSchema=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=9999;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validLabel=(v:unknown):v is string=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=LOCAL_SLOT_POLICY.maxLabelLength&&!/[\u0000-\u001f\u007f]/.test(v);
function label(v:string):string {const result=v.trim();if(!validLabel(result))throw Error('INVALID_SAVE_NAME');return result;}
function payload(v:unknown):v is string{return typeof v==='string'&&!v.includes('\0')&&bytes(v)<=LOCAL_SLOT_POLICY.maxPayloadBytes;}
async function digest(data:string):Promise<string>{
  const hash=await crypto.subtle.digest('SHA-256',encoder.encode(data));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}

export interface SlotGame {
  readonly gameId:string;readonly revisionId:string;readonly releaseVersion:string|null;
  readonly hardwareId:string;readonly hardwareVersion:string;readonly capabilities:SaveCapabilities;
}
type Kind='auto'|'manual'|'legacy'|'fork'|'backup';
export interface SlotSnapshot {
  id:string;name:string;kind:Kind;revisionId:string|null;releaseVersion:string|null;
  schemaVersion:number;createdAt:number|null;data:string;bytes:number;digest:string;
}
export interface SaveSlot {
  id:string;name:string;createdAt:number;headId:string|null;snapshots:SlotSnapshot[];
}
/** Exact identity observed by the player before destructive local confirmation. */
export interface ConfirmedSaveTarget {
  readonly slotId:string;readonly snapshotId:string;readonly digest:string;
  readonly snapshotName:string;readonly slotName:string;
}
export interface SaveSession {
  readonly slotId:string;readonly token:string;readonly revisionId:string;readonly schemaVersion:number;
}
interface SlotRecord {
  format:typeof FORMAT|typeof LEGACY_FORMAT;gameId:string;hardwareId:string;hardwareVersion:string;
  slots:SaveSlot[];active:SaveSession|null;legacyImported:boolean;
  /** Old records omit this; once written, IDs are in atomic insertion order. */
  autoOrder?:string[];
}
type SnapshotInfo=Omit<SlotSnapshot,'data'>;
export interface SlotListing {
  slots:Array<Omit<SaveSlot,'snapshots'>&{snapshots:SnapshotInfo[]}>;
  /** Last locally selected slot, not proof a game is still running. */
  selectedSlotId:string|null;
}
function slotRecordKey(game:SlotGame):string{
  if(!validId(game.gameId)||!validId(game.revisionId)||!KEY_PART.test(game.hardwareId)||!KEY_PART.test(game.hardwareVersion)||
    !(game.releaseVersion===null||typeof game.releaseVersion==='string'&&game.releaseVersion.length<=80))throw Error('INVALID_SAVE_IDENTITY');
  return LEGACY_FORMAT+':'+game.hardwareId+'@'+game.hardwareVersion+':'+game.gameId;
}
function empty(game:SlotGame):SlotRecord{
  return {format:FORMAT,gameId:game.gameId,hardwareId:game.hardwareId,hardwareVersion:game.hardwareVersion,
    slots:[],active:null,legacyImported:false,autoOrder:[]};
}
function decode(raw:unknown,game:SlotGame):SlotRecord{
  if(raw===undefined)return empty(game);
  // Never replace a corrupt/newer record with an empty one.
  if(typeof raw!=='string'||bytes(raw)>LOCAL_SLOT_POLICY.maxRecordBytes)throw Error('INVALID_SAVE_RECORD');
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw Error('INVALID_SAVE_RECORD');}
  if(!record(value)||(value.format!==FORMAT&&value.format!==LEGACY_FORMAT)||value.gameId!==game.gameId||value.hardwareId!==game.hardwareId||
    value.hardwareVersion!==game.hardwareVersion||!Array.isArray(value.slots)||typeof value.legacyImported!=='boolean')
    throw Error('INVALID_SAVE_RECORD');
  if((value.format===FORMAT)!==Object.hasOwn(value,'autoOrder'))throw Error('INVALID_SAVE_RECORD');
  const slots=new Set<string>(),snapshots=new Set<string>(),autos=new Set<string>();
  for(const slot of value.slots){
    if(!record(slot)||!validId(slot.id)||slots.has(slot.id)||!validLabel(slot.name)||!positiveTime(slot.createdAt)||
      !Array.isArray(slot.snapshots))throw Error('INVALID_SAVE_RECORD');
    slots.add(slot.id);
    let autoCount=0;
    for(const s of slot.snapshots){
      if(!record(s)||!validId(s.id)||snapshots.has(s.id)||!validLabel(s.name)||
        !['auto','manual','legacy','fork','backup'].includes(String(s.kind))||
        !(s.revisionId===null||validId(s.revisionId))||
        !(s.releaseVersion===null||typeof s.releaseVersion==='string'&&s.releaseVersion.length<=80)||
        !validSchema(s.schemaVersion)||!(s.createdAt===null||positiveTime(s.createdAt))||
        !payload(s.data)||s.bytes!==bytes(s.data)||typeof s.digest!=='string'||!/^[a-f0-9]{64}$/.test(s.digest))
        throw Error('INVALID_SAVE_RECORD');
      if(s.kind==='auto'){
        if(!Object.hasOwn(value,'autoOrder')&&++autoCount>1)throw Error('INVALID_SAVE_RECORD');
        autos.add(s.id);
      }
      snapshots.add(s.id);
    }
    if(slot.headId!==null&&(!validId(slot.headId)||!slot.snapshots.some(s=>s.id===slot.headId)))throw Error('INVALID_SAVE_RECORD');
  }
  if(Object.hasOwn(value,'autoOrder')){
    if(!Array.isArray(value.autoOrder)||value.autoOrder.length>LOCAL_SLOT_POLICY.maxAutosaves||
      value.autoOrder.length!==autos.size||new Set(value.autoOrder).size!==autos.size||
      !value.autoOrder.every(entry=>typeof entry==='string'&&autos.has(entry)))throw Error('INVALID_SAVE_RECORD');
  }
  if(value.active!==null){
    const a=value.active;
    if(!record(a)||!validId(a.slotId)||!slots.has(a.slotId)||!validId(a.token)||!validId(a.revisionId)||!validSchema(a.schemaVersion))
      throw Error('INVALID_SAVE_RECORD');
  }
  return value as unknown as SlotRecord;
}
function findSlot(r:SlotRecord,slotId:string):SaveSlot{
  const s=r.slots.find(s=>s.id===slotId);if(!s)throw Error('SAVE_SLOT_NOT_FOUND');return s;
}
function findSnapshot(slot:SaveSlot,snapshotId:string):SlotSnapshot{
  const s=slot.snapshots.find(s=>s.id===snapshotId);if(!s)throw Error('SAVE_SNAPSHOT_NOT_FOUND');return s;
}
function confirmedPermanent(r:SlotRecord,target:ConfirmedSaveTarget){
  const slot=findSlot(r,target.slotId),snapshot=findSnapshot(slot,target.snapshotId);
  if(snapshot.kind==='auto'||snapshot.kind==='legacy')throw Error('SAVE_PROTECTED');
  if(snapshot.digest!==target.digest||snapshot.name!==target.snapshotName||slot.name!==target.slotName)
    throw Error('SAVE_SNAPSHOT_CHANGED');
  return {slot,snapshot};
}
function removePermanent(slot:SaveSlot,snapshot:SlotSnapshot){
  slot.snapshots=slot.snapshots.filter(s=>s.id!==snapshot.id);
  if(slot.headId===snapshot.id)slot.headId=slot.snapshots.at(-1)?.id??null;
}
/** Upgrade old per-slot autosaves without losing any historical payload.
 * Old timestamps order the initial ring only; new writes use commit order. */
function ensureAutoOrder(r:SlotRecord):string[]{
  if(r.autoOrder)return r.autoOrder;
  const previous=r.slots.flatMap(slot=>slot.snapshots.filter(s=>s.kind==='auto').map(snapshot=>({slot,snapshot})))
    .sort((a,b)=>(a.snapshot.createdAt??0)-(b.snapshot.createdAt??0));
  while(previous.length>=LOCAL_SLOT_POLICY.maxAutosaves){
    const {slot,snapshot}=previous.shift()!;
    const preserved:SlotSnapshot={...snapshot,id:id(),kind:'backup',name:'Recovered autosave'};
    slot.snapshots=slot.snapshots.map(s=>s.id===snapshot.id?preserved:s);
    if(slot.headId===snapshot.id)slot.headId=preserved.id;
  }
  r.format=FORMAT;
  return r.autoOrder=previous.map(x=>x.snapshot.id);
}
function evictOldestAuto(r:SlotRecord,order:string[]):void{
  const oldest=order.shift();
  if(!oldest)throw Error('INVALID_SAVE_RECORD');
  const slot=r.slots.find(s=>s.snapshots.some(x=>x.id===oldest&&x.kind==='auto'));
  if(!slot)throw Error('INVALID_SAVE_RECORD');
  slot.snapshots=slot.snapshots.filter(s=>s.id!==oldest);
  if(slot.headId===oldest)slot.headId=slot.snapshots.at(-1)?.id??null;
}
function assertSession(r:SlotRecord,session:SaveSession,game:SlotGame):SaveSlot{
  const a=r.active;
  if(!a||a.token!==session.token||a.slotId!==session.slotId||a.revisionId!==session.revisionId||
    a.schemaVersion!==session.schemaVersion||session.revisionId!==game.revisionId||
    session.schemaVersion!==game.capabilities.schemaVersion)throw Error('STALE_SAVE_SESSION');
  return findSlot(r,a.slotId);
}
function newSlot(name:string):SaveSlot{return {id:id(),name:label(name),createdAt:Date.now(),headId:null,snapshots:[]};}
function assertCompatible(s:SlotSnapshot,game:SlotGame):void{
  // Legacy records have known payload lane but not source revision. Preserve
  // them for explicit reviewed recovery instead of guessing compatibility.
  if(s.schemaVersion!==game.capabilities.schemaVersion)throw Error('INCOMPATIBLE_SAVE');
  if(s.revisionId===null)throw Error('UNKNOWN_SAVE_COMPATIBILITY');
}
async function verifySnapshot(s:SlotSnapshot|null):Promise<void>{
  if(s&&await digest(s.data)!==s.digest)throw Error('SAVE_DIGEST_MISMATCH');
}

/** One record per game and hardware version; schema changes remain visible.
 * Atomic update prevents races between tabs. Activate issues a new fenced
 * token; writes from older sessions cannot target a newly selected slot. */
export function createSlotSaveStore(driver:AtomicSaveDriver,identity:SlotGame){
  const game:SlotGame={...identity,capabilities:parseSaveCapabilities(identity.capabilities)};
  const key=slotRecordKey(game);
  const enabled=()=>{if(!supportsProgressSave(game.capabilities))throw Error('PROGRESS_SAVE_UNSUPPORTED');};
  const mutate=<T>(fn:(r:SlotRecord)=>T)=>driver.update(key,raw=>{
    const r=decode(raw,game),result=fn(r),value=JSON.stringify(r);
    if(bytes(value)>LOCAL_SLOT_POLICY.maxRecordBytes)throw Error('LOCAL_SAVE_QUOTA');
    return {value,result};
  });
  const activate=(r:SlotRecord,slot:SaveSlot):SaveSession=>{
    const session={slotId:slot.id,token:id(),revisionId:game.revisionId,schemaVersion:game.capabilities.schemaVersion!};
    r.active=session;return {...session};
  };
  async function prepare(data:string,kind:'auto'|'manual',name:string):Promise<SlotSnapshot>{
    if(!payload(data))throw Error('INVALID_SAVE_PAYLOAD');
    return {id:id(),name:label(name),kind,revisionId:game.revisionId,releaseVersion:game.releaseVersion,
      schemaVersion:game.capabilities.schemaVersion!,createdAt:Date.now(),data,bytes:bytes(data),digest:await digest(data)};
  }
  return {
    async list():Promise<SlotListing>{
      const r=decode(await driver.get(key),game);
      return {selectedSlotId:r.active?.slotId??null,slots:r.slots.map(slot=>({...slot,
        snapshots:slot.snapshots.map(({data:_data,...info})=>info)}))};
    },
    async create(name:string):Promise<string>{
      enabled();return mutate(r=>{const slot=newSlot(name);r.slots.push(slot);return slot.id;});
    },
    async renameSlot(slotId:string,name:string):Promise<void>{
      const next=label(name);await mutate(r=>{findSlot(r,slotId).name=next;});
    },
    async renameSnapshot(slotId:string,snapshotId:string,name:string):Promise<void>{
      const next=label(name);await mutate(r=>{const s=findSnapshot(findSlot(r,slotId),snapshotId);
        if(s.kind==='auto')throw Error('AUTOSAVE_NAME_FIXED');s.name=next;});
    },
    async open(slotId:string):Promise<{session:SaveSession;data:string|null}>{
      enabled();
      // Verify before changing the active token, then compare in the atomic
      // transaction to prevent a concurrent tab replacing the verified head.
      const before=findSlot(decode(await driver.get(key),game),slotId);
      const candidate=before.headId===null?null:findSnapshot(before,before.headId);
      if(candidate)assertCompatible(candidate,game);
      await verifySnapshot(candidate);
      return mutate(r=>{
        const slot=findSlot(r,slotId),head=slot.headId===null?null:findSnapshot(slot,slot.headId);
        if(head?.id!==candidate?.id||head?.digest!==candidate?.digest||head?.data!==candidate?.data)
          throw Error('SAVE_HEAD_CHANGED');
        if(head)assertCompatible(head,game);
        return {session:activate(r,slot),data:head?.data??null};
      });
    },
    /** Explicitly load a saved state without creating a redundant permanent
     * copy. Subsequent auto/manual writes create new entries, never rewrite it. */
    async openSnapshot(slotId:string,snapshotId:string):Promise<{session:SaveSession;data:string}>{
      enabled();
      const candidate=findSnapshot(findSlot(decode(await driver.get(key),game),slotId),snapshotId);
      assertCompatible(candidate,game);await verifySnapshot(candidate);
      return mutate(r=>{
        const slot=findSlot(r,slotId),snapshot=findSnapshot(slot,snapshotId);
        if(snapshot.digest!==candidate.digest||snapshot.data!==candidate.data)
          throw Error('SAVE_SNAPSHOT_CHANGED');
        assertCompatible(snapshot,game);slot.headId=snapshot.id;
        return {session:activate(r,slot),data:snapshot.data};
      });
    },
    async close(session:SaveSession):Promise<void>{
      await mutate(r=>{if(r.active?.token===session.token&&r.active.slotId===session.slotId)r.active=null;});
    },
    async autosave(session:SaveSession,data:string):Promise<string>{
      if(!supportsAutosave(game.capabilities))throw Error('AUTOSAVE_UNSUPPORTED');
      const next=await prepare(data,'auto','Autosave');
      return mutate(r=>{
        const slot=assertSession(r,session,game);
        const order=ensureAutoOrder(r);
        // Retain five writes per game/device, not five per hidden playthrough.
        // Transaction commit order is stable even when timestamps tie or clocks move.
        if(order.length===LOCAL_SLOT_POLICY.maxAutosaves)evictOldestAuto(r,order);
        slot.snapshots.push(next);order.push(next.id);slot.headId=next.id;return next.id;
      });
    },
    /** Input must be freshly captured by the trusted adapter, not the old auto head. */
    async manualSave(session:SaveSession,name:string,data:string):Promise<string>{
      if(!supportsManualSave(game.capabilities))throw Error('MANUAL_SAVE_UNSUPPORTED');
      const next=await prepare(data,'manual',name);
      return mutate(r=>{const slot=assertSession(r,session,game);
        slot.snapshots.push(next);slot.headId=next.id;return next.id;});
    },
    /** Replace only the explicitly confirmed permanent save with fresh live
     * data. Issue a new immutable snapshot identity for cloud comparisons.
     * The replacement belongs to the current session; other saved states
     * and the autosave ring are unchanged. All changes commit atomically. */
    async replaceManualSave(session:SaveSession,target:ConfirmedSaveTarget,data:string):Promise<string>{
      if(!supportsManualSave(game.capabilities))throw Error('MANUAL_SAVE_UNSUPPORTED');
      const name=label(target.snapshotName);
      const next=await prepare(data,'manual',name);
      return mutate(r=>{
        const current=assertSession(r,session,game),{slot,snapshot}=confirmedPermanent(r,target);
        if(snapshot.kind==='fork')next.name=slot.name;
        removePermanent(slot,snapshot);
        current.snapshots.push(next);current.headId=next.id;
        return next.id;
      });
    },
    /** Deletion affects this device only; do not delete the selected head,
     * autosave ring or legacy recovery data. */
    async deletePermanentSave(target:ConfirmedSaveTarget):Promise<void>{
      enabled();
      await mutate(r=>{
        const {slot,snapshot}=confirmedPermanent(r,target);
        if(r.active?.slotId===slot.id&&slot.headId===snapshot.id)throw Error('ACTIVE_SAVE_PROTECTED');
        removePermanent(slot,snapshot);
      });
    },
    /** Copy an existing head without pretending this is a live manual save. */
    async backupHead(session:SaveSession,name:string):Promise<string>{
      enabled();const nextName=label(name);
      return mutate(r=>{
        const slot=assertSession(r,session,game);
        if(!slot.headId)throw Error('NO_SAVE_DATA');
        const source=findSnapshot(slot,slot.headId);
        const next:SlotSnapshot={...source,id:id(),name:nextName,kind:'backup'};
        slot.snapshots.push(next);return next.id;
      });
    },
    /** Keep a chosen autosave permanently, without activating it or changing its time. */
    async backupSnapshot(slotId:string,snapshotId:string,name:string):Promise<string>{
      enabled();const nextName=label(name);
      const candidate=findSnapshot(findSlot(decode(await driver.get(key),game),slotId),snapshotId);
      if(candidate.kind!=='auto')throw Error('NOT_AUTOSAVE');
      await verifySnapshot(candidate);
      return mutate(r=>{
        const slot=findSlot(r,slotId),source=findSnapshot(slot,snapshotId);
        if(source.kind!=='auto'||source.digest!==candidate.digest||source.data!==candidate.data)
          throw Error('SAVE_SNAPSHOT_CHANGED');
        const next:SlotSnapshot={...source,id:id(),name:nextName,kind:'backup'};
        slot.snapshots.push(next);return next.id;
      });
    },
    /** Loading an older snapshot forks rather than destroying current progress. */
    async fork(slotId:string,snapshotId:string,name:string):Promise<string>{
      enabled();const nextName=label(name);
      return mutate(r=>{
        const source=findSnapshot(findSlot(r,slotId),snapshotId);assertCompatible(source,game);
        const slot=newSlot(nextName),next:SlotSnapshot={...source,id:id(),kind:'fork'};
        slot.snapshots.push(next);slot.headId=next.id;r.slots.push(slot);return slot.id;
      });
    },
    /** Explicit immutable snapshot export. The current autosave may advance
     * concurrently, but an export of the chosen ID never substitutes its head. */
    /** Newest committed autosave by atomic insertion order, not client clock.
     * Old v1 records remain explicit-backup-only until a new autosave upgrades them. */
    async latestAutosaveExport():Promise<string|null>{
      enabled();
      const r=decode(await driver.get(key),game),latest=r.autoOrder?.at(-1);
      if(!latest)return null;
      const slot=r.slots.find(s=>s.snapshots.some(x=>x.id===latest&&x.kind==='auto'));
      if(!slot)throw Error('INVALID_SAVE_RECORD');
      const snapshot=findSnapshot(slot,latest);
      assertCompatible(snapshot,game);
      return encodeCloudSnapshot({format:CLOUD_SNAPSHOT_FORMAT,gameId:game.gameId,hardwareId:game.hardwareId,
        hardwareVersion:game.hardwareVersion,slotId:slot.id,slotName:slot.name,snapshot},game);
    },
    async exportCloudSnapshot(slotId:string,snapshotId:string):Promise<string>{
      enabled();
      const slot=findSlot(decode(await driver.get(key),game),slotId);
      const snapshot=findSnapshot(slot,snapshotId);
      return encodeCloudSnapshot({format:CLOUD_SNAPSHOT_FORMAT,gameId:game.gameId,hardwareId:game.hardwareId,
        hardwareVersion:game.hardwareVersion,slotId:slot.id,slotName:slot.name,snapshot},game);
    },
    /** Keep both: import as a new, independent playthrough. Do not activate it,
     * modify existing slots, or claim cloud content is compatible on import. */
    async importCloudCopy(raw:string,name:string):Promise<string>{
      enabled();
      const envelope=await decodeCloudSnapshot(raw,game);
      const nextName=label(name);
      return mutate(r=>{
        const slot=newSlot(nextName);
        const snapshot:SlotSnapshot={...envelope.snapshot,id:id(),kind:'fork'};
        slot.snapshots.push(snapshot);slot.headId=snapshot.id;r.slots.push(slot);
        return slot.id;
      });
    },
    /** Opt-in, once per game/device record. Original legacy keys remain intact.
     * No fake source revision, creation timestamp, or automatic activation.
     * Old numbered backups remain readable through their existing recovery UI. */
    async importLegacy(hardware:HardwareProfile,legacySlug?:string):Promise<string|null>{
      enabled();
      if(hardware.id!==game.hardwareId||hardware.version!==game.hardwareVersion)throw Error('INVALID_SAVE_IDENTITY');
      const data=await createGameSaveService(driver,hardware,{gameId:game.gameId,legacySlug,saveSchemaVersion:1}).read();
      if(data===null)return null;
      if(!payload(data))throw Error('INVALID_SAVE_PAYLOAD');
      const hash=await digest(data);
      return mutate(r=>{
        if(r.legacyImported)return null;
        const slot=newSlot('Imported legacy save');
        const snapshot:SlotSnapshot={id:id(),name:'Legacy save',kind:'legacy',revisionId:null,releaseVersion:null,
          schemaVersion:1,createdAt:null,data,bytes:bytes(data),digest:hash};
        slot.snapshots.push(snapshot);slot.headId=snapshot.id;r.slots.push(slot);r.legacyImported=true;return slot.id;
      });
    }
  };
}
