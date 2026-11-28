'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Input,Label,TextField} from '@heroui/react';
import type {SlotListing} from '@slopboy/runtime/save-slots';
import {saveDate} from './player-save-list';
import {cloudSnapshotDigest,CLOUD_SNAPSHOT_MAX_BYTES,type CloudSnapshotIdentity} from '@slopboy/runtime/cloud-snapshot';
import {ACCOUNT_CLOUD_BYTES,CLOUD_GAME_LIMIT,parseCloudListing,localComparison,cloudCompatibility,verifyDownloadedSnapshot,cloudErrorMessage,type CloudListing,type CloudRow} from './player-cloud-contract';

export interface PlayerCloudActions {
  identity:CloudSnapshotIdentity;
  expectedAccount?:string;
  withLock:(work:()=>Promise<void>)=>Promise<void>;
  exportSnapshot:(slotId:string,snapshotId:string)=>Promise<string>;
  importSnapshot:(raw:string,name:string,activate:boolean,signal:AbortSignal)=>Promise<void>;
}
class CloudRequestError extends Error{}
export function usePlayerCloudSaves(cloud:PlayerCloudActions|undefined,busy:boolean){
  const [list,setList]=useState<CloudListing|null>(null),[notice,setNotice]=useState('');
  const [choice,setChoice]=useState<CloudRow|null>(null),[name,setName]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const endpoint=cloud?'/api/account/games/'+encodeURIComponent(cloud.identity.gameId)+'/cloud-snapshots':null;
  async function request(signal:AbortSignal,options:RequestInit={},id?:string){
    if(!endpoint)throw Error('CLOUD_UNAVAILABLE');
    const headers=new Headers(options.headers);
    if(cloud?.expectedAccount)headers.set('x-slopboy-sync-account',cloud.expectedAccount);
    const response=await fetch(endpoint+(id?'?backupId='+encodeURIComponent(id):''),{
      ...options,headers,signal,cache:'no-store',credentials:'same-origin',
    });
    const value:unknown=await response.json().catch(()=>null);
    if(!response.ok){
      const code=value&&typeof value==='object'&&'error' in value&&typeof value.error==='string'?value.error:undefined;
      throw new CloudRequestError(cloudErrorMessage(response.status,code));
    }
    return {value,status:response.status};
  }
  async function run(work:(signal:AbortSignal)=>Promise<void>){
    if(!cloud||busy||controller.current)return;
    const next=new AbortController();controller.current=next;setNotice('');
    try{await cloud.withLock(()=>work(next.signal));}
    catch(error){
      if(!next.signal.aborted){
        setNotice(error instanceof CloudRequestError?error.message:
          error instanceof Error&&error.message==='CLOUD_CHANGED'?'Cloud save changed. Refresh the list and try again.':
          'Action could not complete. Existing local saves were retained.');
        setList(null);setChoice(null);
      }
    }finally{controller.current=null;}
  }
  const refresh=()=>void run(async signal=>{
    const {value}=await request(signal);signal.throwIfAborted();setList(parseCloudListing(value));setChoice(null);
  });
  const upload=(slotId:string,snapshotId:string)=>void run(async signal=>{
    if(!cloud)return;
    const raw=await cloud.exportSnapshot(slotId,snapshotId);signal.throwIfAborted();
    if(new TextEncoder().encode(raw).byteLength>CLOUD_SNAPSHOT_MAX_BYTES)throw new CloudRequestError('Save exceeds the cloud size limit.');
    const {value,status}=await request(signal,{method:'POST',headers:{'Content-Type':'application/json'},body:raw});
    const next=parseCloudListing(value);
    const digest=await cloudSnapshotDigest(raw);
    if(!next.snapshots.some(row=>row.slotId===slotId&&row.snapshotId===snapshotId&&row.digest===digest))
      throw Error('CLOUD_CHANGED');
    signal.throwIfAborted();setList(next);setChoice(null);
    setNotice(status===201?'Cloud backup saved.':'This save is already backed up.');
  });
  const restore=(activate:boolean)=>void run(async signal=>{
    if(!cloud||!choice||!name.trim())return;
    const {value}=await request(signal,{},choice.id);
    const raw=await verifyDownloadedSnapshot(value,choice,cloud.identity);
    signal.throwIfAborted();
    await cloud.importSnapshot(raw,name.trim(),activate,signal);
    if(!activate){setChoice(null);setNotice('Cloud save copied to this device. Your active save is unchanged.');}
  });
  const select=(row:CloudRow)=>{setChoice(row);setName(((row.kind==='fork'?row.slotName:row.snapshotName)+' cloud copy').slice(0,80));setNotice('');};
  const cancel=()=>setChoice(null);
  const keepLocal=()=>{cancel();setNotice('Local progress kept.');};
  return {list,notice,choice,name,setName,refresh,upload,restore,select,cancel,keepLocal};
}
export type PlayerCloudState=ReturnType<typeof usePlayerCloudSaves>;
export function CloudSaveControls({state,busy}:{state:PlayerCloudState;busy:boolean}){
  return <div className="v2-save-manager-actions">
    <Button size="sm" variant="secondary" isDisabled={busy} data-testid="refresh-cloud-saves" onPress={state.refresh}>{state.list?'Refresh cloud':'Show cloud saves'}</Button>
    {state.list&&<small data-testid="cloud-usage">{state.list.snapshots.length} / {CLOUD_GAME_LIMIT} backups · {(state.list.usedBytes/1024).toLocaleString(undefined,{maximumFractionDigits:1})} KiB / {ACCOUNT_CLOUD_BYTES/1024/1024} MiB</small>}
    {state.notice&&<p role="status" data-testid="cloud-save-notice">{state.notice}</p>}
  </div>;
}
export function CloudRestoreConfirmation({state,local,identity,schema,busy}:{state:Pick<PlayerCloudState,'choice'|'name'|'setName'|'restore'|'cancel'|'keepLocal'>;local:SlotListing|null;identity:CloudSnapshotIdentity;schema:number;busy:boolean}){
  const row=state.choice;if(!row)return null;
  const comparison=localComparison(row,local);
  return <div className="v2-save-manager-slot" aria-label="Restore cloud save" data-testid="cloud-restore-confirm">
    <h3>{comparison.status==='conflict'?'Local progress differs':'Restore cloud save?'}</h3>
    {comparison.status==='conflict'&&<p>Local: {comparison.head?.name??'No saved progress'} · {saveDate(comparison.head?.createdAt??null)}</p>}
    <p>Cloud: {row.snapshotName} · {saveDate(row.snapshotCreatedAt)}</p>
    <p>Creates a new save on this device. Existing saves stay safe.</p>
    <TextField name="cloudCopyName" isRequired isDisabled={busy}><Label>Name of restored save</Label>
      <Input maxLength={80} value={state.name} onChange={e=>state.setName(e.target.value)}/></TextField>
    <div className="v2-save-manager-actions">
      <Button size="sm" variant="primary" isDisabled={busy||!state.name.trim()||cloudCompatibility(row,identity,schema)!=='Compatible'} data-testid="restore-cloud-play" onPress={()=>state.restore(true)}>Restore &amp; play</Button>
      <Button size="sm" variant="secondary" isDisabled={busy||!state.name.trim()} data-testid="keep-both-cloud" onPress={()=>state.restore(false)}>Save a copy</Button>
      {comparison.status==='conflict'&&<Button size="sm" variant="secondary" isDisabled={busy} onPress={state.keepLocal}>Keep local</Button>}
      <Button size="sm" variant="secondary" isDisabled={busy} onPress={state.cancel}>Cancel</Button>
    </div>
  </div>;
}
