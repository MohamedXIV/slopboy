'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@heroui/react';
import {browserSaveDriver} from '@slopboy/runtime/save-store';
import {createCloudSyncIntent,getCloudSyncDeviceId,SYNC_CYCLE_MS,type SyncScope} from '@slopboy/runtime/cloud-sync-intent';
import type {createSlotSaveStore} from '@slopboy/runtime/save-slots';
import {runManagedSyncCycle} from './managed-sync-worker';

type Store=ReturnType<typeof createSlotSaveStore>;
type Context={scope:SyncScope;intent:ReturnType<typeof createCloudSyncIntent>;generation:string|null;pending:boolean};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const STATUS:Record<string,string>={disabled:'Off',offline:'Offline — local saves still work',throttled:'Waiting for next sync',
  idle:'No new autosave to upload',synced:'Latest autosave backed up',pending:'Waiting to retry',quota:'Cloud quota reached',
  'rate-limited':'Cloud request limit reached',unavailable:'Cloud unavailable — local saves retained',retired:'Old upload retired — sync paused',cancelled:'Sync paused'};
export function useManagedSync(available:boolean,gameId:string,hardwareId:string,hardwareVersion:string,store:Store|null,accountId:string|null){
  const [context,setContext]=useState<Context|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [confirm,setConfirm]=useState(false);
  const live=useRef<AbortController|null>(null);
  useEffect(()=>{
    if(!available||!store||!accountId||!UUID.test(accountId))return;
    const verifiedAccount=accountId;
    const controller=new AbortController();
    async function discover(){
      try{
        const deviceId=await getCloudSyncDeviceId(browserSaveDriver);
        const scope:SyncScope={accountId:verifiedAccount,deviceId,gameId,hardwareId,hardwareVersion};
        const intent=createCloudSyncIntent(browserSaveDriver,scope),status=await intent.status();
        if(!controller.signal.aborted)setContext({scope,intent,generation:status.generation,pending:status.pending});
      }catch{/* Guest, offline and unavailable storage must not block local play. */}
    }
    void discover();
    return()=>controller.abort();
  },[available,gameId,hardwareId,hardwareVersion,store,accountId]);
  useEffect(()=>{
    if(!available||!store||!context?.generation||context.scope.accountId!==accountId)return;
    const controller=new AbortController();live.current=controller;
    let running=false,stopped=false;
    const tick=async()=>{
      if(running||stopped||controller.signal.aborted||document.visibilityState!=='visible')return;
      running=true;
      try{
        const result=await runManagedSyncCycle({scope:context.scope,intent:context.intent,signal:controller.signal,
          isActive:()=>!stopped&&!controller.signal.aborted&&document.visibilityState==='visible',
          online:()=>navigator.onLine,latestAutosave:()=>store.latestAutosaveExport(),
          request:(url,init)=>fetch(url,init)});
        if(!controller.signal.aborted&&result!=='throttled'){
          setMessage(STATUS[result]??'Cloud unavailable');
          if(result==='retired'||result==='cancelled')stopped=true;
        }
      }finally{running=false;}
    };
    void tick();
    const timer=window.setInterval(()=>void tick(),SYNC_CYCLE_MS);
    const wake=()=>void tick();
    window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);
    return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake);
      if(live.current===controller)live.current=null;};
  },[available,store,context,accountId]);
  async function change(enabled:boolean){
    if(!context||busy)return;
    if(!enabled)live.current?.abort();
    setBusy(true);setConfirm(false);
    try{
      const generation=await context.intent.setEnabled(enabled),status=await context.intent.status();
      setContext({...context,generation,pending:status.pending});
      setMessage(enabled?'Waiting for next sync':'Off — local saves retained');
    }catch{setMessage('Could not update sync preference. Reopen the game to retry.');}
    finally{setBusy(false);}
  }
  if(!available||!context||context.scope.gameId!==gameId||context.scope.accountId!==accountId)return null;
  return {deviceId:context.scope.deviceId,enabled:Boolean(context.generation),busy,message,confirm,setConfirm,change};
}
type State=NonNullable<ReturnType<typeof useManagedSync>>;
export function ManagedSyncControls({state}:{state:State}){
  return <section aria-label="Automatic cloud sync" data-testid="managed-sync-controls" className="v2-save-manager-slot">
    <div className="v2-save-manager-actions">
      <strong>Automatic autosave sync</strong>
      <Button size="sm" variant="secondary" isDisabled={state.busy} aria-pressed={state.enabled}
        onPress={()=>state.enabled?void state.change(false):state.setConfirm(true)}>{state.enabled?'Turn off':'Turn on'}</Button>
    </div>
    <small>{state.message||(state.enabled?'On — latest autosave only':'Off')}</small>
    {state.confirm&&<div>
      <p>Back up this account’s local autosaves? Guest saves and other accounts’ progress stay separate. You can turn sync off at any time.</p>
      <div className="v2-save-manager-actions"><Button size="sm" variant="primary" isDisabled={state.busy} onPress={()=>void state.change(true)}>Enable sync</Button>
        <Button size="sm" variant="secondary" onPress={()=>state.setConfirm(false)}>Cancel</Button></div>
    </div>}
  </section>;
}
