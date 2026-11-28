'use client';
import {useState,type ReactNode} from 'react';
import {Button,Input,Label,TextField} from '@heroui/react';
import type {SlotListing,ConfirmedSaveTarget} from '@slopboy/runtime/save-slots';
import {usePlayerCloudSaves,CloudSaveControls,CloudRestoreConfirmation,type PlayerCloudActions} from './PlayerCloudSaves';
import ManagedRestoreControls from './ManagedRestoreControls';
import {integratedSaves} from './integrated-save-list';
import {cloudCompatibility} from './player-cloud-contract';
import {saveEntries,saveDate,nextSaveSort,SAVE_SORT_LABELS,type SaveSort,type SaveLane} from './player-save-list';

export type SaveManagerAction=
  | {kind:'create';name:string}
  | {kind:'load-snapshot';slotId:string;snapshotId:string}
  | {kind:'legacy'}
  | {kind:'rename-slot';slotId:string;name:string}
  | {kind:'rename-snapshot';slotId:string;snapshotId:string;name:string}
  | {kind:'backup-snapshot';slotId:string;snapshotId:string;name:string}
  | {kind:'manual';name:string}
  | {kind:'replace-manual';target:ConfirmedSaveTarget}
  | {kind:'delete-permanent';target:ConfirmedSaveTarget};
type DestructiveAction=Extract<SaveManagerAction,{kind:'replace-manual'}|{kind:'delete-permanent'}>;
type NamedAction=Exclude<SaveManagerAction,{kind:'load-snapshot'}|{kind:'legacy'}|{kind:'create'}|DestructiveAction>;
export default function PlayerSaveManager({listing,currentSlotId,legacyAvailable,schema,busy,notice,autoSupported,manualSupported,manualReady,onAction,onClose,cloud,syncControls,managedDeviceId}:{
  listing:SlotListing|null;currentSlotId:string|null;legacyAvailable:boolean;schema:number;
  busy:boolean;notice:string;autoSupported:boolean;manualSupported:boolean;manualReady:boolean;onAction:(action:SaveManagerAction)=>Promise<boolean>;onClose:()=>void;cloud?:PlayerCloudActions;syncControls?:ReactNode;managedDeviceId?:string;
}){
  const [editor,setEditor]=useState<NamedAction|null>(null);
  const [newGame,setNewGame]=useState(false);
  const [confirmation,setConfirmation]=useState<{action:DestructiveAction;name:string;date:string}|null>(null);
  const [tab,setTab]=useState<SaveLane>(autoSupported?'auto':'manual');
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState<SaveSort>('newest');
  const [details,setDetails]=useState<string|null>(null);
  const cloudState=usePlayerCloudSaves(cloud,busy);
  const rows=integratedSaves(listing,currentSlotId,cloudState.list,cloud?.identity,tab,query,sort);
  const changeTab=(next:SaveLane)=>{setTab(next);setEditor(null);setNewGame(false);setConfirmation(null);setQuery('');setDetails(null);cloudState.cancel();};
  const autos=saveEntries(listing,currentSlotId,'auto','','newest').length;
  const manuals=saveEntries(listing,currentSlotId,'manual','','newest').length;
  return <section className="v2-save-manager sb-heroui-live" aria-label="Game saves" data-testid="player-save-manager">
    <header className="v2-save-manager-head"><h2>Game saves</h2>
      <Button size="sm" variant="secondary" isDisabled={busy} onPress={onClose}>Resume</Button></header>
    {notice&&<p role="status">{notice}</p>}
    <div className="v2-save-manager-actions" aria-label="Save types">
      {(autoSupported||autos>0||Boolean(cloudState.list?.snapshots.some(s=>s.kind==='auto')))&&<Button size="sm" variant={tab==='auto'?'primary':'secondary'} aria-pressed={tab==='auto'} isDisabled={busy} data-testid="open-autosaves" onPress={()=>changeTab('auto')}>Autosaves ({autos})</Button>}
      <Button size="sm" variant={tab==='manual'?'primary':'secondary'} aria-pressed={tab==='manual'} isDisabled={busy} data-testid="open-manual-saves" onPress={()=>changeTab('manual')}>Manual saves ({manuals})</Button>
    </div>
    {cloud&&<CloudSaveControls state={cloudState} busy={busy}/>}
    {syncControls}
    {tab==='auto'&&cloud?.expectedAccount&&managedDeviceId&&<ManagedRestoreControls cloud={cloud} deviceId={managedDeviceId} local={listing} schema={schema} busy={busy}/>}
    {!listing?<p>Loading saves…</p>:<>
      <div className="v2-save-manager-actions">
        {tab==='manual'&&manualSupported&&<Button size="sm" variant="primary" isDisabled={busy||!manualReady} data-testid="manual-save" onPress={()=>{setConfirmation(null);setNewGame(false);setEditor({kind:'manual',name:'Manual save'});}}>New save</Button>}
        <Button size="sm" variant="secondary" isDisabled={busy} data-testid="new-playthrough" onPress={()=>{setConfirmation(null);setEditor(null);setNewGame(true);}}>New game</Button>
        {legacyAvailable&&currentSlotId&&<Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>void onAction({kind:'legacy'})}>Load original save</Button>}
      </div>
      {newGame&&<div className="v2-save-manager-slot">
        <p>Start a new game? Existing saves are kept.</p>
        <div className="v2-save-manager-actions"><Button size="sm" isDisabled={busy} data-testid="confirm-new-game" onPress={()=>void onAction({kind:'create',name:'New game'})}>Start new game</Button>
        <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setNewGame(false)}>Cancel</Button></div>
      </div>}
      {editor&&<form onSubmit={async e=>{e.preventDefault();if(!busy&&editor.name.trim()&&await onAction(editor)){
        if(editor.kind==='backup-snapshot'||editor.kind==='manual')changeTab('manual');else setEditor(null);
      }}}>
        <TextField name="saveName" isRequired isDisabled={busy}><Label>{editor.kind==='backup-snapshot'?'Backup name':'Save name'}</Label>
          <Input maxLength={80} value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></TextField>
        <div className="v2-save-manager-actions"><Button type="submit" size="sm" isDisabled={busy||!editor.name.trim()} data-testid="confirm-save-name">{editor.kind==='rename-slot'||editor.kind==='rename-snapshot'?'Rename':'Save'}</Button>
          <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setEditor(null)}>Cancel</Button></div>
      </form>}
      {tab==='auto'&&<small>Only the latest five autosaves are kept on this device. Back up any save to keep it.</small>}
      {tab==='manual'&&!manualSupported&&<small>Backups from Autosaves appear here. This game saves automatically.</small>}
      <div className="v2-save-manager-actions">
        <TextField name="searchSaves"><Label>Search saves</Label><Input data-testid="search-saves" placeholder="Name or date" value={query} onChange={e=>setQuery(e.target.value)}/></TextField>
        <Button size="sm" variant="secondary" data-testid="sort-saves" aria-label={'Sort: '+SAVE_SORT_LABELS[sort]+'. Change order'} onPress={()=>setSort(nextSaveSort(sort))}>{SAVE_SORT_LABELS[sort]}</Button>
      </div>
      {!rows.length&&<p>{query.trim()?'No matching saves.':tab==='auto'?'No autosaves yet.':'No manual saves or backups yet.'}</p>}
      {rows.map(entry=>{
        if(entry.location==='cloud'){
          const row=entry.remote;
          if(!cloud)return null;
          return <article key={'cloud:'+row.id} className="v2-save-manager-slot" data-testid="cloud-snapshot" data-kind={row.kind}>
            <div className="v2-save-manager-head"><div><strong>{entry.name}</strong>
              <p>{saveDate(row.snapshotCreatedAt)}</p>
              <small data-testid="save-location">Cloud backup</small>
              {cloudCompatibility(row,cloud.identity,schema)!=='Compatible'&&<small> · Cannot load with this game version.</small>}</div>
              <Button size="sm" variant="primary" isDisabled={busy} data-testid="select-cloud-restore" onPress={()=>{setEditor(null);setNewGame(false);setConfirmation(null);cloudState.select(row);}}>Restore</Button>
            </div>
            {cloudState.choice?.id===row.id&&<CloudRestoreConfirmation state={cloudState} local={listing} identity={cloud.identity} schema={schema} busy={busy}/>}
          </article>;
        }
        const {slotId,snapshot:s,name,active}=entry.local;
        const compatible=s.schemaVersion===schema&&s.revisionId!==null;
        const slot=listing.slots.find(item=>item.id===slotId)!;
        const target:ConfirmedSaveTarget={slotId,snapshotId:s.id,digest:s.digest,snapshotName:s.name,slotName:slot.name};
        const manageable=s.kind!=='auto'&&s.kind!=='legacy';
        const confirm=(kind:DestructiveAction['kind'])=>{setEditor(null);setNewGame(false);setConfirmation({action:{kind,target},name,date:saveDate(s.createdAt)});};
        return <article key={s.id} className="v2-save-manager-slot" data-testid="save-snapshot" data-kind={s.kind} data-active={active?'true':'false'}>
          <div className="v2-save-manager-head">
            <div><strong>{name}</strong>{active&&<span> · Current</span>}
              <p data-testid="save-date">{saveDate(s.createdAt)}{s.kind==='backup'?' · Backup':s.kind==='legacy'?' · Original save':s.kind==='fork'?' · Restored copy':''}</p>
              <small data-testid="save-location">{entry.backedUp?'On this device + cloud':cloudState.list||!cloud?'On this device':'On this device · cloud not checked'}</small>
              {!compatible&&<small> · Cannot load with this game version.</small>}
            </div>
            <div className="v2-save-manager-actions">
              <Button size="sm" variant="primary" isDisabled={busy||!compatible} data-testid="load-save" onPress={()=>void onAction({kind:'load-snapshot',slotId,snapshotId:s.id})}>Load</Button>
              {s.kind==='auto'?<Button size="sm" variant="secondary" isDisabled={busy} data-testid="backup-autosave" onPress={()=>{setConfirmation(null);setNewGame(false);setEditor({kind:'backup-snapshot',slotId,snapshotId:s.id,name:'Backup '+saveDate(s.createdAt)});}}>Backup</Button>:
              <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>{setConfirmation(null);setNewGame(false);setEditor(s.kind==='fork'?{kind:'rename-slot',slotId,name}:{kind:'rename-snapshot',slotId,snapshotId:s.id,name});}}>Rename</Button>}
              {cloud&&!entry.backedUp&&<Button size="sm" variant="secondary" isDisabled={busy} data-testid="upload-local-snapshot" onPress={()=>cloudState.upload(slotId,s.id)}>Back up to cloud</Button>}
              <Button size="sm" variant="secondary" aria-expanded={details===s.id} isDisabled={busy} data-testid="save-options" onPress={()=>{setConfirmation(null);setDetails(details===s.id?null:s.id);}}>{manageable?'Options':'Details'}</Button>
            </div>
          </div>
          {details===s.id&&<div>
            {manageable&&<div className="v2-save-manager-actions">
              {manualSupported&&<Button size="sm" variant="secondary" isDisabled={busy||!manualReady} data-testid="replace-save" onPress={()=>confirm('replace-manual')}>Overwrite with current progress</Button>}
              <Button size="sm" variant="danger" isDisabled={busy||active} data-testid="delete-save" onPress={()=>confirm('delete-permanent')}>Delete</Button>
              {active&&<small>Load another save before deleting this one.</small>}
            </div>}
            <small data-testid="save-technical-details">{s.releaseVersion?'Game '+s.releaseVersion+' · ':''}Schema {s.schemaVersion} · {s.revisionId?'Revision '+s.revisionId.slice(0,8):'Unknown revision'} · {s.bytes} bytes</small>
          </div>}
          {confirmation?.action.target.snapshotId===s.id&&<div className="v2-save-manager-slot" role="group" aria-label="Confirm save change">
            <strong>{confirmation.action.kind==='replace-manual'?'Overwrite':'Delete'} {confirmation.name}?</strong>
            <p>{confirmation.date}. {confirmation.action.kind==='replace-manual'?'This replaces the selected local save with your current game progress.':'This removes the selected save from this device.'} Other saves and cloud backups are kept.</p>
            <div className="v2-save-manager-actions">
              <Button size="sm" variant="danger" isDisabled={busy} data-testid="confirm-save-change" onPress={async()=>{if(await onAction(confirmation.action)){setConfirmation(null);setDetails(null);}}}>{confirmation.action.kind==='replace-manual'?'Overwrite save':'Delete save'}</Button>
              <Button size="sm" variant="secondary" isDisabled={busy} data-testid="cancel-save-change" onPress={()=>setConfirmation(null)}>Cancel</Button>
            </div>
          </div>}
        </article>;
      })}
    </>}
  </section>;
}
