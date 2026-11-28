import type {CloudSnapshotIdentity} from '../../../../packages/runtime/src/cloud-snapshot.ts';
import {isGameUuid} from '../../../../packages/catalog/src/index.ts';
import {parseManagedDevices} from './managed-device-contract.ts';
import {parseCloudListing,verifyDownloadedSnapshot,cloudErrorMessage,type CloudRow} from './player-cloud-contract.ts';

export function managedRestoreTransport(accountId:string,identity:CloudSnapshotIdentity,request:typeof fetch=fetch){
  if(!isGameUuid(accountId)||!isGameUuid(identity.gameId))throw Error('INVALID_RESTORE_SCOPE');
  const base='/api/account/games/'+encodeURIComponent(identity.gameId);
  async function read(path:string,signal:AbortSignal,deviceId?:string){
    signal.throwIfAborted();
    const headers:Record<string,string>={'x-slopboy-sync-account':accountId};
    if(deviceId!==undefined){
      if(!isGameUuid(deviceId))throw Error('INVALID_RESTORE_SCOPE');
      headers['x-slopboy-sync-device']=deviceId;
    }
    const response=await request(base+path,{method:'GET',headers,credentials:'same-origin',cache:'no-store',redirect:'error',signal});
    const value:unknown=await response.json().catch(()=>null);
    signal.throwIfAborted();
    if(!response.ok){
      const code=value&&typeof value==='object'&&'error' in value&&typeof value.error==='string'?value.error:undefined;
      throw Error(cloudErrorMessage(response.status,code));
    }
    return value;
  }
  return {
    async devices(signal:AbortSignal){
      const value=await read('/cloud-autosave-devices',signal);
      if(!value||typeof value!=='object'||!('devices' in value))throw Error('INVALID_DEVICE_LIST');
      return parseManagedDevices(value.devices);
    },
    async listing(deviceId:string,signal:AbortSignal){
      const listing=parseCloudListing(await read('/cloud-autosaves',signal,deviceId));
      if(listing.snapshots.some(row=>row.kind!=='auto'))throw Error('INVALID_CLOUD_RESPONSE');
      return listing;
    },
    async restore(deviceId:string,row:CloudRow,signal:AbortSignal){
      if(!isGameUuid(row.id)||row.kind!=='auto')throw Error('INVALID_RESTORE_SCOPE');
      const value=await read('/cloud-autosaves?backupId='+encodeURIComponent(row.id),signal,deviceId);
      const raw=await verifyDownloadedSnapshot(value,row,identity);
      signal.throwIfAborted();
      return raw;
    },
  };
}
