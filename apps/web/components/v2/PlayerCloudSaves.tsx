'use client';
import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Chip,Input,Label,TextField} from '@heroui/react';
import type {SlotListing} from '@slopboy/runtime/save-slots';
import {saveDate} from './player-save-list';
import {cloudSnapshotDigest,CLOUD_SNAPSHOT_MAX_BYTES,type CloudSnapshotIdentity} from '@slopboy/runtime/cloud-snapshot';
import {ACCOUNT_CLOUD_BYTES,CLOUD_GAME_LIMIT,parseCloudListing,localComparison,cloudCompatibility,verifyDownloadedSnapshot,cloudErrorMessage,type CloudListing,type CloudRow} from './player-cloud-contract';
import {CloudIcon,RefreshIcon} from './save-ui-icons';
import {playSaveUiSound} from './save-ui-sfx';

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
  const [manage,setManage]=useState(false),[target,setTarget]=useState<CloudRow|null>(null);
  const [mutation,setMutation]=useState<{kind:'delete';target:CloudRow}|{kind:'replace';target:CloudRow;slotId:string;snapshotId:string;name:string}|null>(null);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const endpoint=cloud?'/api/account/games/'+encodeURIComponent(cloud.identity.gameId)+'/cloud-snapshots':null;
  async function request(signal:AbortSignal,options:RequestInit={},id?:string,digest?:string){
    if(!endpoint)throw Error('CLOUD_UNAVAILABLE');
    const headers=new Headers(options.headers);
    if(cloud?.expectedAccount)headers.set('x-slopboy-sync-account',cloud.expectedAccount);
    const response=await fetch(endpoint+(id?'?backupId='+encodeURIComponent(id)+(digest?'&digest='+encodeURIComponent(digest):''):''),{
      ...options,headers,signal,cache:'no-store',credentials:'same-origin',redirect:'error',
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
        setList(null);setChoice(null);setTarget(null);setMutation(null);
      }
    }finally{controller.current=null;}
  }
  const refresh=()=>void run(async signal=>{
    const {value}=await request(signal);signal.throwIfAborted();setList(parseCloudListing(value));setChoice(null);setTarget(null);setMutation(null);
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
  const selectTarget=(row:CloudRow)=>{setChoice(null);setMutation(null);setTarget(row);};
  const askDelete=(row:CloudRow)=>{setChoice(null);setTarget(null);setMutation({kind:'delete',target:row});};
  const askReplace=(slotId:string,snapshotId:string,name:string)=>{if(target){setChoice(null);setMutation({kind:'replace',target,slotId,snapshotId,name});}};
  const cancelManagement=()=>{setMutation(null);setTarget(null);};
  const confirmMutation=()=>void run(async signal=>{
    if(!cloud||!mutation||list?.deletedSnapshotIds===undefined)return;
    const selected=mutation.target;
    let raw:string|undefined,digest:string|undefined;
    if(mutation.kind==='replace'){
      raw=await cloud.exportSnapshot(mutation.slotId,mutation.snapshotId);signal.throwIfAborted();
      digest=await cloudSnapshotDigest(raw);
    }
    const {value}=await request(signal,mutation.kind==='delete'?{method:'DELETE'}:{method:'POST',headers:{'Content-Type':'application/json'},body:raw},selected.id,selected.digest);
    const next=parseCloudListing(value);
    if(next.deletedSnapshotIds===undefined||!next.deletedSnapshotIds.includes(selected.snapshotId)||next.snapshots.some(row=>row.id===selected.id))throw Error('CLOUD_CHANGED');
    if(mutation.kind==='replace'&&!next.snapshots.some(row=>row.slotId===mutation.slotId&&row.snapshotId===mutation.snapshotId&&row.digest===digest))throw Error('CLOUD_CHANGED');
    signal.throwIfAborted();setList(next);setTarget(null);setMutation(null);setChoice(null);
    setNotice(mutation.kind==='delete'?'Cloud backup deleted. Local saves are unchanged.':'Cloud backup replaced. Local saves are unchanged.');
  });
  const select=(row:CloudRow)=>{cancelManagement();setChoice(row);setName(((row.kind==='fork'?row.slotName:row.snapshotName)+' cloud copy').slice(0,80));setNotice('');};
  const cancel=()=>setChoice(null);
  const keepLocal=()=>{cancel();setNotice('Local progress kept.');};
  return {list,notice,choice,name,setName,refresh,upload,restore,select,cancel,keepLocal,manage,setManage,target,mutation,selectTarget,askDelete,askReplace,cancelManagement,confirmMutation};
}
export type PlayerCloudState=ReturnType<typeof usePlayerCloudSaves>;

export function CloudSaveControls({state,busy}:{state:PlayerCloudState;busy:boolean}){
  const quotaPct=state.list?Math.min(100,Math.round((state.list.usedBytes/ACCOUNT_CLOUD_BYTES)*100)):0;
  return (
    <div className="sb-cloud-strip">
      <div className="sb-cloud-strip-head">
        <div className="sb-cloud-strip-left">
          <CloudIcon />
          <strong>Cloud backups</strong>
          {state.list&&(
            <div className="sb-cloud-quota-wrap">
              <div className="sb-cloud-quota-bar" aria-hidden="true">
                <div className="sb-cloud-quota-fill" style={{width:quotaPct+'%'}} />
              </div>
              <small className="sb-cloud-usage-text" data-testid="cloud-usage">
                {state.list.snapshots.length} / {CLOUD_GAME_LIMIT} backups · {(state.list.usedBytes/1024).toLocaleString(undefined,{maximumFractionDigits:1})} KiB / {ACCOUNT_CLOUD_BYTES/1024/1024} MiB
              </small>
            </div>
          )}
        </div>
        <div className="v2-save-manager-actions">
          <Button
            size="sm"
            variant="secondary"
            isDisabled={busy}
            data-testid="refresh-cloud-saves"
            onPress={()=>{playSaveUiSound('tap');state.refresh();}}
          >
            <RefreshIcon />{state.list?'Refresh cloud':'Show cloud saves'}
          </Button>
          {state.list?.deletedSnapshotIds!==undefined&&(
            <Button
              size="sm"
              variant="outline"
              isDisabled={busy}
              aria-expanded={state.manage}
              onPress={()=>{playSaveUiSound('tap');state.setManage(!state.manage);state.cancelManagement();}}
            >
              {state.manage?'Done':'Manage'}
            </Button>
          )}
        </div>
      </div>

      {state.notice&&(
        <Alert status="default" className="sb-save-notice-alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              <span role="status" data-testid="cloud-save-notice">{state.notice}</span>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {state.manage&&state.list?.deletedSnapshotIds!==undefined&&(
        <section className="sb-cloud-manage-list" aria-label="Manage cloud backups">
          <small className="sb-sync-status">Cloud-only changes — local saves are kept.</small>
          {state.list.snapshots.length===0&&<small className="sb-sync-status">No cloud backups yet.</small>}
          {state.list.snapshots.map(row=>(
            <div key={row.id} className="sb-cloud-manage-row">
              <div>
                <strong>{row.snapshotName}</strong>
                <p>{saveDate(row.snapshotCreatedAt)}</p>
              </div>
              <div className="v2-save-manager-actions">
                <Button size="sm" variant="secondary" isDisabled={busy} aria-pressed={state.target?.id===row.id} onPress={()=>{playSaveUiSound('tap');state.selectTarget(row);}}>
                  Replace
                </Button>
                <Button size="sm" variant="danger" isDisabled={busy} onPress={()=>{playSaveUiSound('warn');state.askDelete(row);}}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {state.target&&!state.mutation&&(
            <Chip color="accent" variant="soft">
              <span role="status">Replacing {state.target.snapshotName} — choose a local save above.</span>
            </Chip>
          )}
          {state.mutation&&(
            <div className="sb-save-inline-panel is-danger" role="group" aria-label="Confirm cloud change">
              <strong>{state.mutation.kind==='delete'?'Delete':'Replace'} cloud backup {state.mutation.target.snapshotName}?</strong>
              <p>
                {saveDate(state.mutation.target.snapshotCreatedAt)}. {state.mutation.kind==='replace'?'Replace with '+state.mutation.name+'. ':''}
                Removes the old cloud copy. Local saves stay unchanged.
              </p>
              <div className="v2-save-manager-actions">
                <Button
                  size="sm"
                  variant="danger"
                  isDisabled={busy}
                  data-testid="confirm-cloud-change"
                  onPress={()=>{playSaveUiSound(state.mutation?.kind==='delete'?'delete':'save');state.confirmMutation();}}
                >
                  {state.mutation.kind==='delete'?'Delete cloud copy':'Replace cloud copy'}
                </Button>
                <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>{playSaveUiSound('tap');state.cancelManagement();}}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function CloudRestoreConfirmation({state,local,identity,schema,busy}:{state:Pick<PlayerCloudState,'choice'|'name'|'setName'|'restore'|'cancel'|'keepLocal'>;local:SlotListing|null;identity:CloudSnapshotIdentity;schema:number;busy:boolean}){
  const row=state.choice;if(!row)return null;
  const comparison=localComparison(row,local);
  return (
    <div className="sb-save-inline-panel" aria-label="Restore cloud save" data-testid="cloud-restore-confirm">
      <strong>{comparison.status==='conflict'?'Local progress differs':'Restore cloud save?'}</strong>
      {comparison.status==='conflict'&&<p>Local: {comparison.head?.name??'No saved progress'} · {saveDate(comparison.head?.createdAt??null)}</p>}
      <p>Cloud: {row.snapshotName} · {saveDate(row.snapshotCreatedAt)}</p>
      <p>Creates a new copy on this device — existing saves stay safe.</p>
      <TextField name="cloudCopyName" isRequired isDisabled={busy}>
        <Label>Name of restored save</Label>
        <Input variant="secondary" maxLength={80} value={state.name} onChange={e=>state.setName(e.target.value)} />
      </TextField>
      <div className="v2-save-manager-actions">
        <Button
          size="sm"
          variant="primary"
          isDisabled={busy||!state.name.trim()||cloudCompatibility(row,identity,schema)!=='Compatible'}
          data-testid="restore-cloud-play"
          onPress={()=>{playSaveUiSound('load');state.restore(true);}}
        >
          Restore &amp; play
        </Button>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={busy||!state.name.trim()}
          data-testid="keep-both-cloud"
          onPress={()=>{playSaveUiSound('save');state.restore(false);}}
        >
          Save a copy
        </Button>
        {comparison.status==='conflict'&&(
          <Button size="sm" variant="outline" isDisabled={busy} onPress={()=>{playSaveUiSound('tap');state.keepLocal();}}>
            Keep local
          </Button>
        )}
        <Button size="sm" variant="ghost" isDisabled={busy} onPress={()=>{playSaveUiSound('tap');state.cancel();}}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
