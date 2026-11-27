'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Input,Label,TextField} from '@heroui/react';
import type {SlotListing} from '@slopboy/runtime/save-slots';
import {CLOUD_SNAPSHOT_MAX_BYTES,type CloudSnapshotIdentity} from '@slopboy/runtime/cloud-snapshot';
import {ACCOUNT_CLOUD_BYTES,CLOUD_GAME_LIMIT,parseCloudListing,localComparison,cloudCompatibility,verifyDownloadedSnapshot,cloudErrorMessage,type CloudListing,type CloudRow} from './player-cloud-contract';

export interface PlayerCloudActions {
  identity:CloudSnapshotIdentity;
  withLock:(work:()=>Promise<void>)=>Promise<void>;
  exportSnapshot:(slotId:string,snapshotId:string)=>Promise<string>;
  importSnapshot:(raw:string,name:string,activate:boolean,signal:AbortSignal)=>Promise<void>;
}
class CloudRequestError extends Error{}
export default function PlayerCloudSaves({cloud,local,schema,busy}:{cloud:PlayerCloudActions;local:SlotListing|null;schema:number;busy:boolean}){
  const [list,setList]=useState<CloudListing|null>(null),[notice,setNotice]=useState('');
  const [choice,setChoice]=useState<CloudRow|null>(null),[name,setName]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const endpoint='/api/account/games/'+encodeURIComponent(cloud.identity.gameId)+'/cloud-snapshots';
  async function request(signal:AbortSignal,options:RequestInit={},id?:string){
    const response=await fetch(endpoint+(id?'?backupId='+encodeURIComponent(id):''),{
      ...options,signal,cache:'no-store',credentials:'same-origin',
    });
    const value:unknown=await response.json().catch(()=>null);
    if(!response.ok){
      const code=value&&typeof value==='object'&&'error' in value&&typeof value.error==='string'?value.error:undefined;
      throw new CloudRequestError(cloudErrorMessage(response.status,code));
    }
    return {value,status:response.status};
  }
  async function run(work:(signal:AbortSignal)=>Promise<void>){
    if(busy||controller.current)return;
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
    const {value}=await request(signal);setList(parseCloudListing(value));setChoice(null);
  });
  const upload=(slotId:string,snapshotId:string)=>void run(async signal=>{
    const raw=await cloud.exportSnapshot(slotId,snapshotId);signal.throwIfAborted();
    if(new TextEncoder().encode(raw).byteLength>CLOUD_SNAPSHOT_MAX_BYTES)throw new CloudRequestError('Save exceeds the cloud size limit.');
    const {value,status}=await request(signal,{method:'POST',headers:{'Content-Type':'application/json'},body:raw});
    setList(parseCloudListing(value));setChoice(null);
    setNotice(status===201?'Cloud backup saved.':'This snapshot is already backed up.');
  });
  const restore=(activate:boolean)=>void run(async signal=>{
    if(!choice||!name.trim())return;
    const {value}=await request(signal,{},choice.id);
    const raw=await verifyDownloadedSnapshot(value,choice,cloud.identity);
    signal.throwIfAborted();
    await cloud.importSnapshot(raw,name.trim(),activate,signal);
    if(!activate){setChoice(null);setNotice('Cloud save copied to a new local playthrough. Your active save is unchanged.');}
  });
  const comparison=choice?localComparison(choice,local):null;
  return <section aria-label="Cloud saves" data-testid="player-cloud-saves">
    <p>Optional cloud backups. Your game continues to save locally.</p>
    <Button size="sm" variant="secondary" isDisabled={busy} data-testid="refresh-cloud-saves" onPress={refresh}>{list?'Refresh cloud saves':'List cloud saves'}</Button>
    {notice&&<p role="status" data-testid="cloud-save-notice">{notice}</p>}
    {list&&<>
      <p data-testid="cloud-usage">{list.snapshots.length} / {CLOUD_GAME_LIMIT} cloud snapshots · {(list.usedBytes/1024).toLocaleString(undefined,{maximumFractionDigits:1})} KiB / {ACCOUNT_CLOUD_BYTES/1024/1024} MiB account storage</p>
      {!list.snapshots.length&&<p>No cloud saves yet.</p>}
      {list.snapshots.map(row=><article key={row.id} className="v2-save-manager-slot" data-testid="cloud-snapshot">
        <strong>{row.snapshotName}</strong>
        {cloudCompatibility(row,cloud.identity,schema)!=='Compatible'&&<small>Cannot load with this game version.</small>}
        <p>{row.snapshotCreatedAt?new Date(row.snapshotCreatedAt).toLocaleString():'Unknown save date'} · Stored {new Date(row.storedAt).toLocaleString()}</p>
        <Button size="sm" variant="secondary" isDisabled={busy} data-testid="select-cloud-restore" onPress={()=>{setChoice(row);setName((row.snapshotName+' cloud copy').slice(0,80));setNotice('');}}>Restore</Button>
      </article>)}
      {choice&&<article className="v2-save-manager-slot" aria-label="Restore cloud save" data-testid="cloud-restore-confirm">
        <h3>{comparison?.status==='conflict'?'Save conflict':'Restore cloud save'}</h3>
        {comparison?.slot&&<p>Local: {comparison.slot.name} · {comparison.head?.name??'No saved progress'} · {comparison.head?.createdAt?new Date(comparison.head.createdAt).toLocaleString():'Unknown date'}</p>}
        <p>Cloud: {choice.slotName} · {choice.snapshotName} · {cloudCompatibility(choice,cloud.identity,schema)}</p>
        <p>Restoring creates a new local save. Your current progress stays safe.</p>
        <TextField name="cloudCopyName" isRequired isDisabled={busy}><Label>Name of restored save</Label>
          <Input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></TextField>
        <div className="v2-save-manager-actions">
          <Button size="sm" variant="primary" isDisabled={busy||!name.trim()} data-testid="keep-both-cloud" onPress={()=>restore(false)}>Keep both</Button>
          <Button size="sm" variant="secondary" isDisabled={busy||!name.trim()||cloudCompatibility(choice,cloud.identity,schema)!=='Compatible'} data-testid="restore-cloud-play" onPress={()=>restore(true)}>Restore &amp; play</Button>
          <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>{setChoice(null);setNotice('Local progress kept. No cloud save was imported.');}}>Keep local</Button>
          <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setChoice(null)}>Cancel</Button>
        </div>
      </article>}
      <h3>Back up a local save</h3>
      {local?.slots.flatMap(slot=>slot.snapshots.map(snapshot=><div key={snapshot.id} className="v2-save-manager-snapshot">
        <p>{snapshot.kind==='fork'?slot.name:snapshot.name} · {snapshot.createdAt?new Date(snapshot.createdAt).toLocaleString():'Unknown date'}</p>
        <Button size="sm" variant="secondary" isDisabled={busy} data-testid="upload-local-snapshot" onPress={()=>upload(slot.id,snapshot.id)}>Back up to cloud</Button>
      </div>))}
    </>}
  </section>;
}
