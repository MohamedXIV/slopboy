import {SLOPBOY_1000} from '@slopboy/hardware';
import {browserSaveDriver,createSaveService,validSave} from '@slopboy/runtime/save-store';

/** User-facing offline backups. Limits protect local storage, not fantasy hardware. */
export const LOCAL_SNAPSHOT_SLOTS=5;
export interface LocalSnapshot {readonly slot:number;readonly createdAt:number;readonly bytes:number;}
const identity=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const prefix=(gameId:string)=> {
  if(!identity.test(gameId))throw Error('Invalid game ID');
  return 'slopboy:local-backup:v1:'+SLOPBOY_1000.id+':'+gameId+':';
};
function slotKey(gameId:string,slot:number):string{
  if(!Number.isInteger(slot)||slot<1||slot>LOCAL_SNAPSHOT_SLOTS)throw Error('Invalid local backup slot');
  return prefix(gameId)+slot;
}
function decode(value:unknown):{createdAt:number;save:string}|null{
  if(typeof value!=='string')return null;
  try{
    const entry:unknown=JSON.parse(value);
    if(!entry||typeof entry!=='object')return null;
    const object=entry as Record<string,unknown>;
    if(!Number.isSafeInteger(object.createdAt)||Number(object.createdAt)<=0||!validSave(object.save,SLOPBOY_1000)||object.save===null)return null;
    return {createdAt:Number(object.createdAt),save:object.save as string};
  }catch{return null;}
}
export async function listLocalSnapshots(gameId:string):Promise<LocalSnapshot[]>{
  const snapshots:LocalSnapshot[]=[];
  for(let slot=1;slot<=LOCAL_SNAPSHOT_SLOTS;slot++){
    const data=decode(await browserSaveDriver.get(slotKey(gameId,slot)));
    if(data)snapshots.push({slot,createdAt:data.createdAt,bytes:new TextEncoder().encode(data.save).length});
  }
  return snapshots.sort((a,b)=>b.createdAt-a.createdAt);
}
export async function saveLocalSnapshot(gameId:string):Promise<LocalSnapshot>{
  const store=createSaveService(browserSaveDriver,SLOPBOY_1000,gameId);
  const value=await store.read();
  if(value===null)throw Error('No saved game data yet. Play and save first.');
  for(let slot=1;slot<=LOCAL_SNAPSHOT_SLOTS;slot++){
    const key=slotKey(gameId,slot);
    if((await browserSaveDriver.get(key))!==undefined)continue;
    const createdAt=Date.now();
    await browserSaveDriver.put(key,JSON.stringify({createdAt,save:value}));
    return {slot,createdAt,bytes:new TextEncoder().encode(value).length};
  }
  throw Error('All local backup slots are filled. Delete an old snapshot first.');
}
export async function restoreLocalSnapshot(gameId:string,slot:number):Promise<void>{
  const data=decode(await browserSaveDriver.get(slotKey(gameId,slot)));
  if(!data)throw Error('This local snapshot is missing or invalid.');
  await createSaveService(browserSaveDriver,SLOPBOY_1000,gameId).write(data.save);
}
export async function deleteLocalSnapshot(gameId:string,slot:number):Promise<void>{
  await browserSaveDriver.delete(slotKey(gameId,slot));
}
