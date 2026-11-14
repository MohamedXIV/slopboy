'use client';
import {useState} from 'react';
import {Button} from '@heroui/react';
import {listLocalSnapshots,saveLocalSnapshot,restoreLocalSnapshot,deleteLocalSnapshot,LOCAL_SNAPSHOT_SLOTS,type LocalSnapshot} from './local-save-slots';
import OfflineInstallControl from './OfflineInstallControl';
export default function LocalGameSaves({gameId,onInstallChanged,showInstall=true}:{gameId:string;onInstallChanged?:()=>void;showInstall?:boolean}){
  const [open,setOpen]=useState(false),[slots,setSlots]=useState<LocalSnapshot[]>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  async function run(action:()=>Promise<unknown>,message:string){
    setBusy(true);setNotice('');try{await action();setSlots(await listLocalSnapshots(gameId));setNotice(message);}
    catch(error){setNotice(error instanceof Error?error.message:'Local saves unavailable');}finally{setBusy(false);}
  }
  return <div data-testid={'local-save-'+gameId}>{showInstall&&<OfflineInstallControl gameId={gameId} onChanged={onInstallChanged}/>}<Button variant="secondary" size="sm" onPress={()=>{
    if(open)setOpen(false);else{setOpen(true);void run(async()=>{},'');}
  }} aria-expanded={open}>Local saves</Button>
  {open&&<div><p>{slots.length} / {LOCAL_SNAPSHOT_SLOTS} local backup slots</p>
    <Button size="sm" isDisabled={busy} onPress={()=>void run(()=>saveLocalSnapshot(gameId),'Backup saved')}>Back up save</Button>
    {slots.map(slot=><div key={slot.slot}>Slot {slot.slot} · {new Date(slot.createdAt).toLocaleString()}
      <Button size="sm" isDisabled={busy} onPress={()=>{if(window.confirm('Replace the current autosave?'))void run(()=>restoreLocalSnapshot(gameId,slot.slot),'Save restored');}}>Restore</Button>
      <Button size="sm" isDisabled={busy} onPress={()=>{if(window.confirm('Delete this backup?'))void run(()=>deleteLocalSnapshot(gameId,slot.slot),'Backup deleted');}}>Delete</Button>
    </div>)}
  </div>}{notice&&<p role="status">{notice}</p>}</div>;
}
