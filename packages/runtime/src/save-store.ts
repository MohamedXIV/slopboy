/**
 * Host-owned guest save storage. V1 keys are never deleted by migration.
 * New keys store versioned envelopes keyed by immutable game UUID, NOT title,
 * revision UUID or the old pixel-v1 manifest slug. Revised games share saves
 * until an explicit future save-format migration is defined.
 */
import type {HardwareProfile} from '../../hardware/src/index.ts';

export const SAVE_DB_NAME='slopboy-local-saves';
export const SAVE_STORE_NAME='cartridges';
const LEGACY_FORMAT_VERSION=1;
export const SAVE_FORMAT_VERSION=2;
/** Saved gameplay state format, independent of cartridge revision and engine version. */
export const LEGACY_SAVE_SCHEMA_VERSION=1;
export const MAX_SAVE_SCHEMA_VERSION=9999;
function checkedSaveSchemaVersion(value:number):number{
  if(!Number.isSafeInteger(value)||value<LEGACY_SAVE_SCHEMA_VERSION||value>MAX_SAVE_SCHEMA_VERSION){
    throw Error('Invalid save schema version');
  }
  return value;
}
const SLUG_PATTERN=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Historical key. Keep unchanged for upgrades and V1 rollback. */
export function slotKey(gameId:string,hardware:HardwareProfile):string{
  if(!SLUG_PATTERN.test(gameId))throw Error('Invalid cartridge identity');
  return `save-v${LEGACY_FORMAT_VERSION}:${hardware.id}@${hardware.version}:${gameId}`;
}
export function gameSlotKey(gameId:string,hardware:HardwareProfile,saveSchemaVersion=LEGACY_SAVE_SCHEMA_VERSION):string{
  if(!UUID_PATTERN.test(gameId))throw Error('Invalid game UUID');
  const schema=checkedSaveSchemaVersion(saveSchemaVersion);
  const base=`save-v${SAVE_FORMAT_VERSION}:${hardware.id}@${hardware.version}:${gameId}`;
  // Historical V2 key is unchanged. Incompatible new formats use a NEW lane
  // without overwriting the old save, so the old revision remains restorable.
  return schema===LEGACY_SAVE_SCHEMA_VERSION?base:base+`:schema-${schema}`;
}
export function validSave(value:unknown,hardware:HardwareProfile):value is string|null{
  // This limit belongs to the retained pixel-v1 compatibility adapter only.
  return value===null||(typeof value==='string'&&new TextEncoder().encode(value).byteLength<=hardware.budgets.saveBytes);
}
export interface SaveDriver{
  get(key:string):Promise<unknown>;
  put(key:string,value:string):Promise<void>;
  delete(key:string):Promise<void>;
  /** Atomic, no-clobber copy in IndexedDB. Transform returning undefined declines migration. */
  copyIfAbsent?(from:string,to:string,transform:(raw:unknown)=>string|undefined):Promise<boolean>;
}
export async function copyIfAbsent(driver:SaveDriver,from:string,to:string,transform:(raw:unknown)=>string|undefined):Promise<boolean>{
  if(driver.copyIfAbsent)return driver.copyIfAbsent(from,to,transform);
  // In-memory/test drivers; browser driver uses one atomic IDB transaction.
  if(await driver.get(to)!==undefined)return false;
  const converted=transform(await driver.get(from));
  if(converted===undefined)return false;
  await driver.put(to,converted);
  return true;
}
/** Legacy-only service kept for existing pixel-v1 consumers and test fixtures. */
export function createSaveService(driver:SaveDriver,hardware:HardwareProfile,gameId:string){
  const key=slotKey(gameId,hardware);
  return {
    async read():Promise<string|null>{
      const value=await driver.get(key);
      return validSave(value,hardware)?value:null;
    },
    async write(value:string|null):Promise<void>{
      if(!validSave(value,hardware))throw Error('Game save exceeds hardware budget');
      if(value===null)return driver.delete(key);
      return driver.put(key,value);
    }
  };
}
interface SaveEnvelope{
  readonly format:'slopboy-save-v2';
  readonly gameId:string;
  /** Undefined only for original V2 saves, which are schema 1. */
  readonly saveSchemaVersion?:number;
  readonly state:'saved'|'deleted';
  readonly data?:string;
}
function encodeEnvelope(gameId:string,value:string|null,saveSchemaVersion:number):string{
  const schema=saveSchemaVersion===LEGACY_SAVE_SCHEMA_VERSION?{}:{saveSchemaVersion};
  const entry:SaveEnvelope=value===null
    ?{format:'slopboy-save-v2',gameId,...schema,state:'deleted'}
    :{format:'slopboy-save-v2',gameId,...schema,state:'saved',data:value};
  return JSON.stringify(entry);
}
function decodeEnvelope(raw:unknown,gameId:string,hardware:HardwareProfile,
  saveSchemaVersion:number):{state:'saved'|'deleted';data:string|null}|null{
  if(typeof raw!=='string')return null;
  try{
    const parsed:unknown=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
    const r=parsed as Record<string,unknown>;
    if(r.format!=='slopboy-save-v2'||r.gameId!==gameId||
      (r.saveSchemaVersion??LEGACY_SAVE_SCHEMA_VERSION)!==saveSchemaVersion)return null;
    if(r.state==='deleted'&&r.data===undefined)return {state:'deleted',data:null};
    if(r.state==='saved'&&typeof r.data==='string'&&validSave(r.data,hardware))return {state:'saved',data:r.data};
  }catch{/* Corrupt keys fall back to the untouched legacy record. */}
  return null;
}
export function createGameSaveService(driver:SaveDriver,hardware:HardwareProfile,
  identity:{gameId:string;legacySlug?:string;saveSchemaVersion?:number}){
  const {gameId,legacySlug}=identity;
  const saveSchemaVersion=checkedSaveSchemaVersion(identity.saveSchemaVersion??LEGACY_SAVE_SCHEMA_VERSION);
  const key=gameSlotKey(gameId,hardware,saveSchemaVersion);
  // NEVER import schema-1 data into incompatible schemas. A future explicit
  // reviewed migration may copy saves while preserving the old lane.
  const previous=saveSchemaVersion===LEGACY_SAVE_SCHEMA_VERSION&&legacySlug?slotKey(legacySlug,hardware):null;
  return {
    async read():Promise<string|null>{
      const current=decodeEnvelope(await driver.get(key),gameId,hardware,saveSchemaVersion);
      if(current)return current.data;
      if(!previous)return null;
      try{
        await copyIfAbsent(driver,previous,key,raw=>
          typeof raw==='string'&&validSave(raw,hardware)?encodeEnvelope(gameId,raw,saveSchemaVersion):undefined);
      }catch{/* A failed copy must never make a valid legacy save unplayable. */}
      const copied=decodeEnvelope(await driver.get(key),gameId,hardware,saveSchemaVersion);
      if(copied)return copied.data;
      const original=await driver.get(previous);
      return typeof original==='string'&&validSave(original,hardware)?original:null;
    },
    async write(value:string|null):Promise<void>{
      if(!validSave(value,hardware))throw Error('Game save exceeds hardware budget');
      // Deletions are tombstones so the old legacy save cannot reappear.
      await driver.put(key,encodeEnvelope(gameId,value,saveSchemaVersion));
    }
  };
}
function connect():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')return Promise.reject(Error('IndexedDB unavailable'));
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(SAVE_DB_NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(SAVE_STORE_NAME))request.result.createObjectStore(SAVE_STORE_NAME);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error??Error('Cannot open local saves'));
  });
}
async function transaction<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await connect();
  try{
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(SAVE_STORE_NAME,mode);
      const req=operation(tx.objectStore(SAVE_STORE_NAME));
      let value:T;
      req.onsuccess=()=>{value=req.result;};
      tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error??Error('Local save transaction failed'));
      tx.onabort=()=>reject(tx.error??Error('Local save transaction aborted'));
    });
  }finally{db.close();}
}
export const browserSaveDriver:SaveDriver={
  get:key=>transaction('readonly',store=>store.get(key)),
  put:async(key,value)=>{await transaction('readwrite',store=>store.put(value,key));},
  delete:async key=>{await transaction('readwrite',store=>store.delete(key));},
  copyIfAbsent:async(from,to,transform)=>{
    const db=await connect();
    try{
      return await new Promise<boolean>((resolve,reject)=>{
        const tx=db.transaction(SAVE_STORE_NAME,'readwrite');
        const store=tx.objectStore(SAVE_STORE_NAME);
        let copied=false;
        const target=store.get(to);
        target.onsuccess=()=>{
          if(target.result!==undefined)return;
          const source=store.get(from);
          source.onsuccess=()=>{
            let converted:string|undefined;
            try{converted=transform(source.result);}
            catch(error){tx.abort();reject(error);return;}
            if(converted!==undefined){
              store.put(converted,to);
              copied=true;
            }
          };
        };
        tx.oncomplete=()=>resolve(copied);
        tx.onerror=()=>reject(tx.error??Error('Save migration transaction failed'));
        tx.onabort=()=>reject(tx.error??Error('Save migration transaction aborted'));
      });
    }finally{db.close();}
  }
};
