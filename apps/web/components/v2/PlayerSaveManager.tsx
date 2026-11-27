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
  const [expanded,setExpanded]=useState<string|null>(null);
  const [technical,setTechnical]=useState(false);
  const current=listing?.slots.find(slot=>slot.id===currentSlotId);
  const compatible=(s:{revisionId:string|null;schemaVersion:number})=>s.schemaVersion===schema&&s.revisionId!==null;
  return <section className="v2-save-manager sb-heroui-live" aria-label="Game saves" data-testid="player-save-manager">
    <header className="v2-save-manager-head"><div><h2>Game saves</h2>
      <p>Playing: <strong data-testid="active-save-name">{current?.name??(currentSlotId?'Loading…':'Original save')}</strong></p>
      <small>{manualSupported&&autoSupported?'Saves automatically or when you choose':manualSupported?'Save your progress whenever you like':'Progress saves automatically'}</small></div>
      <Button size="sm" variant="secondary" isDisabled={busy} onPress={onClose}>Resume</Button></header>
    {notice&&<p role="status">{notice}</p>}
    {cloud&&<div className="v2-save-manager-actions" aria-label="Save locations">
      <Button size="sm" variant={tab==='local'?'primary':'secondary'} aria-pressed={tab==='local'} isDisabled={busy} onPress={()=>setTab('local')}>On this device</Button>
      <Button size="sm" variant={tab==='cloud'?'primary':'secondary'} aria-pressed={tab==='cloud'} isDisabled={busy} data-testid="open-cloud-saves" onPress={()=>{setEditor(null);setTab('cloud');}}>Cloud backups</Button>
    </div>}
    {tab==='cloud'&&cloud?<PlayerCloudSaves cloud={cloud} local={listing} currentSlotId={currentSlotId} schema={schema} busy={busy}/>:!listing?<p>Loading saves…</p>:<>
      <div className="v2-save-manager-actions">
        {manualSupported&&<Button size="sm" variant="primary" isDisabled={busy||!manualReady} data-testid="manual-save" onPress={()=>setEditor({kind:'manual',name:'Manual save'})}>Save game</Button>}
        <Button size="sm" variant={manualSupported?'secondary':'primary'} isDisabled={busy} data-testid="new-playthrough" onPress={()=>setEditor({kind:'create',name:'New playthrough'})}>New game</Button>
        {autoSupported&&current?.headId&&<Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setEditor({kind:'backup',name:'Autosave backup'})}>Save a checkpoint</Button>}
        {legacyAvailable&&currentSlotId&&<Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>void onAction({kind:'legacy'})}>Play original save</Button>}
      </div>
      {editor&&<form onSubmit={async e=>{e.preventDefault();if(!busy&&editor.name.trim()&&await onAction(editor)){setEditor(null);if(editor.kind==='manual'||editor.kind==='backup')setExpanded(currentSlotId);}}}>
        <TextField name="saveName" isRequired isDisabled={busy}><Label>{editor.kind==='create'||editor.kind==='fork'?'Name your game':'Save name'}</Label>
          <Input maxLength={80} value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></TextField>
        <div className="v2-save-manager-actions"><Button type="submit" size="sm" isDisabled={busy||!editor.name.trim()} data-testid="confirm-save-name">{editor.kind==='create'||editor.kind==='fork'?'Start playing':editor.kind==='rename-slot'||editor.kind==='rename-snapshot'?'Rename':'Save'}</Button>
          <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setEditor(null)}>Cancel</Button></div>
      </form>}
      {!currentSlotId&&legacyAvailable&&<p>Your original save is safe. New game starts separately.</p>}
      <h3>Your games on this device</h3>
      {listing.slots.map(slot=>{
        const head=slot.snapshots.find(s=>s.id===slot.headId);
        const active=slot.id===currentSlotId;
        const open=expanded===slot.id;
        return <article key={slot.id} className="v2-save-manager-slot" data-testid="playthrough" data-active={active?'true':'false'}>
          <div className="v2-save-manager-head"><div><strong>{slot.name}</strong>{active&&<span> · Playing</span>}
            <p>{head?head.createdAt?'Saved '+new Date(head.createdAt).toLocaleString():'Saved progress':'Not saved yet'}</p>
            {head&&!compatible(head)&&<small>Cannot load with this game version.</small>}</div>
            <div className="v2-save-manager-actions">
              {!active&&<Button size="sm" variant="primary" isDisabled={busy||Boolean(head&&!compatible(head))} onPress={()=>void onAction({kind:'load',slotId:slot.id})}>Play</Button>}
              <Button size="sm" variant="secondary" isDisabled={busy} aria-expanded={open} data-testid="toggle-save-versions" onPress={()=>{setExpanded(open?null:slot.id);setTechnical(false);}}>Options ({slot.snapshots.length})</Button>
            </div></div>
          <div hidden={!open} data-testid="save-versions">
            <div className="v2-save-manager-actions">
              <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setEditor({kind:'rename-slot',slotId:slot.id,name:slot.name})}>Rename game</Button>
              {slot.snapshots.length>0&&<Button size="sm" variant="secondary" aria-expanded={technical} onPress={()=>setTechnical(!technical)}>{technical?'Hide technical details':'Technical details'}</Button>}
            </div>
            {slot.snapshots.map(s=><div key={s.id} className="v2-save-manager-snapshot" data-testid="save-snapshot" data-kind={s.kind}>
              <div><strong>{s.name}</strong> · {s.kind==='auto'?'Autosave':s.kind==='manual'?'Manual save':s.kind==='backup'?'Checkpoint':'Saved copy'}
                {s.createdAt&&<p>{new Date(s.createdAt).toLocaleString()}</p>}
                {!compatible(s)&&<small>Cannot play this version directly.</small>}
                {technical&&open&&<small data-testid="save-technical-details">{s.releaseVersion?'Game '+s.releaseVersion+' · ':''}Schema {s.schemaVersion} · {s.revisionId?'Revision '+s.revisionId.slice(0,8):'Unknown revision'} · {s.bytes} bytes</small>}</div>
              <div className="v2-save-manager-actions">{s.kind!=='auto'&&<Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>setEditor({kind:'rename-snapshot',slotId:slot.id,snapshotId:s.id,name:s.name})}>Rename</Button>}
                <Button size="sm" variant="secondary" isDisabled={busy||!compatible(s)} onPress={()=>setEditor({kind:'fork',slotId:slot.id,snapshotId:s.id,name:slot.name+' copy'})}>Play a copy</Button></div>
            </div>)}
          </div>
        </article>;
      })}
    </>}
  </section>;
}
