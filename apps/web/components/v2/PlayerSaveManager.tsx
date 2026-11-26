'use client';
import {useState} from 'react';
import {Button,Input,Label,TextField} from '@heroui/react';
import type {SlotListing} from '@slopboy/runtime/save-slots';
import PlayerCloudSaves,{type PlayerCloudActions} from './PlayerCloudSaves';

export type SaveManagerAction=
  | {kind:'create';name:string}
  | {kind:'load';slotId:string}
  | {kind:'legacy'}
  | {kind:'rename-slot';slotId:string;name:string}
  | {kind:'rename-snapshot';slotId:string;snapshotId:string;name:string}
  | {kind:'backup';name:string}
  | {kind:'manual';name:string}
  | {kind:'fork';slotId:string;snapshotId:string;name:string};
type NamedAction=Exclude<SaveManagerAction,{kind:'load'}|{kind:'legacy'}>;
export default function PlayerSaveManager({listing,currentSlotId,legacyAvailable,schema,busy,notice,autoSupported,manualSupported,manualReady,onAction,onClose,cloud}:{
  listing:SlotListing|null;currentSlotId:string|null;legacyAvailable:boolean;schema:number;
  busy:boolean;notice:string;autoSupported:boolean;manualSupported:boolean;manualReady:boolean;onAction:(action:SaveManagerAction)=>Promise<boolean>;onClose:()=>void;cloud?:PlayerCloudActions;
}){
  const [editor,setEditor]=useState<NamedAction|null>(null);
  const [tab,setTab]=useState<'local'|'cloud'>('local');
  const current=listing?.slots.find(slot=>slot.id===currentSlotId);
  const compatible=(s:{revisionId:string|null;schemaVersion:number})=>s.schemaVersion===schema&&s.revisionId!==null;
  return <section className="v2-save-manager sb-heroui-live" aria-label="Game saves" data-testid="player-save-manager">
    <header className="v2-save-manager-head"><div><h2>Game saves</h2>
      <p>Current save: <strong data-testid="active-save-name">{current?.name??(currentSlotId?'Loading…':'Legacy autosave')}</strong></p>
      <small>{manualSupported&&autoSupported?'Manual + autosave':manualSupported?'Manual save':'Autosave supported'} · Local storage · Save schema {schema}</small></div>
      <Button size="sm" variant="secondary" isDisabled={busy} onPress={onClose}>Resume</Button></header>
    {notice&&<p role="status">{notice}</p>}
    {cloud&&<div className="v2-save-manager-actions" aria-label="Save locations">
      <Button size="sm" variant={tab==='local'?'primary':'secondary'} aria-pressed={tab==='local'} isDisabled={busy} onPress={()=>setTab('local')}>Local saves</Button>
      <Button size="sm" variant={tab==='cloud'?'primary':'secondary'} aria-pressed={tab==='cloud'} isDisabled={busy} data-testid="open-cloud-saves" onPress={()=>{setEditor(null);setTab('cloud');}}>Cloud saves</Button>
    </div>}
    {tab==='cloud'&&cloud?<PlayerCloudSaves cloud={cloud} local={listing} schema={schema} busy={busy}/>:!listing?<p>Reading local saves…</p>:<>
      <div className="v2-save-manager-actions">
        <Button size="sm" variant="primary" isDisabled={busy} data-testid="new-playthrough" onPress={()=>setEditor({kind:'create',name:'New playthrough'})}>New playthrough</Button>
        {manualSupported&&<Button size="sm" variant="primary" isDisabled={busy||!manualReady} data-testid="manual-save" onPress={()=>setEditor({kind:'manual',name:'Manual save'})}>Save game</Button>}
        {autoSupported&&current?.headId&&<Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setEditor({kind:'backup',name:'Autosave backup'})}>Back up autosave</Button>}
        {legacyAvailable&&currentSlotId&&<Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>void onAction({kind:'legacy'})}>Load legacy autosave</Button>}
      </div>
      {editor&&<form onSubmit={async e=>{e.preventDefault();if(!busy&&editor.name.trim()&&await onAction(editor))setEditor(null);}}>
        <TextField name="saveName" isRequired isDisabled={busy}><Label>Save name</Label>
          <Input maxLength={80} value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></TextField>
        <div className="v2-save-manager-actions"><Button type="submit" size="sm" isDisabled={busy||!editor.name.trim()} data-testid="confirm-save-name">Confirm</Button>
          <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setEditor(null)}>Cancel</Button></div>
      </form>}
      {!currentSlotId&&legacyAvailable&&<p>The original autosave remains available. A new playthrough starts separately without replacing it.</p>}
      {listing.slots.map(slot=>{
        const head=slot.snapshots.find(s=>s.id===slot.headId);
        return <article key={slot.id} className="v2-save-manager-slot" data-testid="playthrough" data-active={slot.id===currentSlotId?'true':'false'}>
          <div className="v2-save-manager-head"><div><strong>{slot.name}</strong>{slot.id===currentSlotId&&<span> · Active save</span>}
            <p>{head?'Saved progress':'New game'}</p></div>
            <div className="v2-save-manager-actions">
              <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setEditor({kind:'rename-slot',slotId:slot.id,name:slot.name})}>Rename</Button>
              {slot.id!==currentSlotId&&<Button size="sm" variant="secondary" isDisabled={busy||Boolean(head&&!compatible(head))} onPress={()=>void onAction({kind:'load',slotId:slot.id})}>Load</Button>}
            </div></div>
          {slot.snapshots.map(s=><div key={s.id} className="v2-save-manager-snapshot" data-testid="save-snapshot" data-kind={s.kind}>
            <div><strong>{s.name}</strong> · {s.kind}<p>{s.releaseVersion?'Game '+s.releaseVersion:'Release version not assigned'} · Schema {s.schemaVersion}</p>
              <small>{s.revisionId?'Revision '+s.revisionId.slice(0,8):'Unknown revision'} · {s.schemaVersion!==schema?'Incompatible':s.revisionId?'Compatible':'Unknown compatibility'}</small>
              <p>{s.createdAt?new Date(s.createdAt).toLocaleString():'Unknown date'} · {s.bytes} bytes</p></div>
            <div className="v2-save-manager-actions">{s.kind!=='auto'&&<Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setEditor({kind:'rename-snapshot',slotId:slot.id,snapshotId:s.id,name:s.name})}>Rename</Button>}
              <Button size="sm" variant="secondary" isDisabled={busy||!compatible(s)} onPress={()=>setEditor({kind:'fork',slotId:slot.id,snapshotId:s.id,name:slot.name+' copy'})}>Load as new playthrough</Button></div>
          </div>)}
        </article>;
      })}
    </>}
    <small>{manualSupported?'Manual saves capture the current game state.':'This game does not support live manual capture.'} {autoSupported?'Backups copy the last autosave. ':''}{cloud?'Cloud backups are optional.':'Cloud backups are not available for this revision.'}</small>
  </section>;
}
