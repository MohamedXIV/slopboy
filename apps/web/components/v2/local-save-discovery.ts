import {getLegacyCatalogGame,isGameUuid} from '@slopboy/catalog';
import {SAVE_DB_NAME,SAVE_STORE_NAME} from '@slopboy/runtime/save-store';

/** Discover only local save identities. Historical slugs are used solely for migration. */
export async function listLocalSaveGameIds():Promise<string[]>{
  if(typeof indexedDB==='undefined')throw Error('Local saves unavailable');
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open(SAVE_DB_NAME,1);
    open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains(SAVE_STORE_NAME))open.result.createObjectStore(SAVE_STORE_NAME);};
    open.onerror=()=>reject(Error('Local saves unavailable'));
    open.onsuccess=()=>{
      const db=open.result,request=db.transaction(SAVE_STORE_NAME,'readonly').objectStore(SAVE_STORE_NAME).getAllKeys();
      request.onerror=()=>{db.close();reject(Error('Local saves unavailable'));};
      request.onsuccess=()=>{
        const ids=new Set<string>();
        for(const raw of request.result){
          if(typeof raw!=='string')continue;
          const match=/^(?:save-v2:slopboy-1000@0\.1\.0:|slopboy:local-backup:v2:slopboy-1000:)([0-9a-f-]{36})(?::|$)/i.exec(raw);
          if(match&&isGameUuid(match[1])){ids.add(match[1]);continue;}
          const old=/^(?:save-v1:slopboy-1000@0\.1\.0:|slopboy:local-backup:v1:slopboy-1000:)([a-z0-9-]+)(?::|$)/.exec(raw);
          const game=old&&getLegacyCatalogGame(old[1]);if(game)ids.add(game.gameId);
        }
        db.close();resolve([...ids]);
      };
    };
  });
}
