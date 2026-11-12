import {SLOPBOY_1000} from '@slopboy/hardware';
import {getCatalogGame} from '@slopboy/catalog';
import {browserSaveDriver,copyIfAbsent,createGameSaveService,validSave,type SaveDriver}
  from '@slopboy/runtime/save-store';

/** Guest IndexedDB backups; the five slots are a UI policy, not a virtual device limit. */
export const LOCAL_SNAPSHOT_SLOTS=5;
export interface LocalSnapshot{readonly slot:number;readonly createdAt:number;readonly bytes:number;}
const NEW_PREFIX='slopboy:local-backup:v2:';
const OLD_PREFIX='slopboy:local-backup:v1:';
const DELETED='slopboy-local-backup-deleted-v2';
type Snapshot={createdAt:number;save:string};
function identity(gameId:string){
  const game=getCatalogGame(gameId);
  if(!game)throw Error('Unknown curated game UUID');
  return game;
}
export function localSnapshotKey(gameId:string,slot:number,legacy=false):string{
  if(!Number.isInteger(slot)||slot<1||slot>LOCAL_SNAPSHOT_SLOTS)throw Error('Invalid local backup slot');
  const game=identity(gameId);
  return (legacy?OLD_PREFIX:NEW_PREFIX)+SLOPBOY_1000.id+':'+(legacy?game.legacySlug:game.gameId)+':'+slot;
}
function decode(raw:unknown):Snapshot|null{
  if(typeof raw!=='string')return null;
  try{
    const parsed:unknown=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
    const o=parsed as Record<string,unknown>;
    if(!Number.isSafeInteger(o.createdAt)||Number(o.createdAt)<=0||typeof o.save!=='string'||!validSave(o.save,SLOPBOY_1000))return null;
    return {createdAt:Number(o.createdAt),save:o.save};
  }catch{return null;}
}
/** Also exported for deterministic in-memory migration regression tests. */
export async function readLocalSnapshot(driver:SaveDriver,gameId:string,slot:number):Promise<Snapshot|null>{
  const next=localSnapshotKey(gameId,slot);
  const raw=await driver.get(next);
  if(raw===DELETED)return null;
  const existing=decode(raw);
  if(existing)return existing;
  const previous=localSnapshotKey(gameId,slot,true);
  try{await copyIfAbsent(driver,previous,next,old=>decode(old)?old as string:undefined);}
  catch{/* Never prevent recovery from the untouched legacy snapshot. */}
  const copied=await driver.get(next);
  if(copied===DELETED)return null;
  return decode(copied)??decode(await driver.get(previous));
}
export async function listSnapshots(driver:SaveDriver,gameId:string):Promise<LocalSnapshot[]>{
  const snapshots:LocalSnapshot[]=[];
  for(let slot=1;slot<=LOCAL_SNAPSHOT_SLOTS;slot++){
    const record=await readLocalSnapshot(driver,gameId,slot);
    if(record)snapshots.push({slot,createdAt:record.createdAt,bytes:new TextEncoder().encode(record.save).length});
  }
  return snapshots.sort((a,b)=>b.createdAt-a.createdAt);
}
export function listLocalSnapshots(gameId:string){return listSnapshots(browserSaveDriver,gameId);}
export async function saveSnapshot(driver:SaveDriver,gameId:string,now=Date.now()):Promise<LocalSnapshot>{
  const game=identity(gameId);
  const value=await createGameSaveService(driver,SLOPBOY_1000,game).read();
  if(value===null)throw Error('No saved game data yet. Play and save first.');
  const occupied=new Set((await listSnapshots(driver,gameId)).map(snapshot=>snapshot.slot));
  for(let slot=1;slot<=LOCAL_SNAPSHOT_SLOTS;slot++){
    // A valid legacy snapshot still occupies its slot if a previous copy aborted.
    if(occupied.has(slot))continue;
    const key=localSnapshotKey(gameId,slot);
    const raw=await driver.get(key);
    if(raw!==undefined&&raw!==DELETED)continue;
    if(!Number.isSafeInteger(now)||now<=0)throw Error('Invalid snapshot timestamp');
    await driver.put(key,JSON.stringify({createdAt:now,save:value}));
    return {slot,createdAt:now,bytes:new TextEncoder().encode(value).length};
  }
  throw Error('All local backup slots are filled. Delete an old snapshot first.');
}
export function saveLocalSnapshot(gameId:string){return saveSnapshot(browserSaveDriver,gameId);}
export async function restoreSnapshot(driver:SaveDriver,gameId:string,slot:number):Promise<void>{
  const data=await readLocalSnapshot(driver,gameId,slot);
  if(!data)throw Error('This local snapshot is missing or invalid.');
  await createGameSaveService(driver,SLOPBOY_1000,identity(gameId)).write(data.save);
}
export function restoreLocalSnapshot(gameId:string,slot:number){return restoreSnapshot(browserSaveDriver,gameId,slot);}
export async function deleteSnapshot(driver:SaveDriver,gameId:string,slot:number):Promise<void>{
  // Preserve the historic key as rollback evidence, but explicitly hide it after deletion.
  await driver.put(localSnapshotKey(gameId,slot),DELETED);
}
export function deleteLocalSnapshot(gameId:string,slot:number){return deleteSnapshot(browserSaveDriver,gameId,slot);}
