/**
 * Per-cartridge untrusted SAVE DATA only. Never used for platform balances.
 * The cartridge never gets an IndexedDB handle: only the host knows the slot key.
 */
import type {HardwareProfile} from '../../hardware/src/index.ts';

export const SAVE_DB_NAME = 'slopboy-local-saves';
export const SAVE_STORE_NAME = 'cartridges';
const FORMAT_VERSION=1;
const ID_PATTERN=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function slotKey(gameId:string,hardware:HardwareProfile):string {
  if(!ID_PATTERN.test(gameId))throw Error('Invalid cartridge identity');
  return `save-v${FORMAT_VERSION}:${hardware.id}@${hardware.version}:${gameId}`;
}
export function validSave(value:unknown,hardware:HardwareProfile):value is string|null {
  return value===null || (typeof value==='string' &&
    new TextEncoder().encode(value).byteLength<=hardware.budgets.saveBytes);
}
export interface SaveDriver {
  get(key:string):Promise<unknown>;
  put(key:string,value:string):Promise<void>;
  delete(key:string):Promise<void>;
}
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
function connect():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')return Promise.reject(Error('IndexedDB unavailable'));
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(SAVE_DB_NAME,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(SAVE_STORE_NAME))request.result.createObjectStore(SAVE_STORE_NAME);};
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
  delete:async key=>{await transaction('readwrite',store=>store.delete(key));}
};
