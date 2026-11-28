'use client';
import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Chip} from '@heroui/react';
import type {SlotListing} from '@slopboy/runtime/save-slots';
import {CloudRestoreConfirmation,type PlayerCloudActions} from './PlayerCloudSaves';
import {managedRestoreTransport} from './managed-restore-transport';
import type {ManagedDevice} from './managed-device-contract';
import {cloudCompatibility,exactLocalCloudMatch,type CloudRow,type CloudListing} from './player-cloud-contract';
import {saveDate} from './player-save-list';
import {ClockIcon,DeviceIcon,RefreshIcon} from './save-ui-icons';
import {playSaveUiSound} from './save-ui-sfx';

export default function ManagedRestoreControls({cloud,deviceId,local,schema,busy}:{cloud:PlayerCloudActions;deviceId:string;local:SlotListing|null;schema:number;busy:boolean}){
  const [devices,setDevices]=useState<ManagedDevice[]|null>(null),[source,setSource]=useState<string|null>(null);
  const [listing,setListing]=useState<CloudListing|null>(null),[choice,setChoice]=useState<CloudRow|null>(null);
  const [name,setName]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const account=cloud.expectedAccount;
  const locked=busy||loading;
  async function run(work:(transport:ReturnType<typeof managedRestoreTransport>,signal:AbortSignal)=>Promise<void>){
    if(!account||locked||controller.current)return;
    const next=new AbortController();controller.current=next;setLoading(true);setNotice('');
    try{await cloud.withLock(()=>work(managedRestoreTransport(account,cloud.identity),next.signal));}
    catch(error){
      if(!next.signal.aborted){
        setChoice(null);setListing(null);
        const message=error instanceof Error?error.message:'';
        setNotice(message.startsWith('Cloud ')||message.startsWith('Sign in')?message:'Could not read or restore cloud autosaves. Existing local saves were retained. Refresh and try again.');
      }
    }finally{if(!next.signal.aborted)setLoading(false);controller.current=null;}
  }
  const refresh=()=>void run(async(transport,signal)=>{
    setChoice(null);setSource(null);setListing(null);setDevices(null);
    const next=await transport.devices(signal);signal.throwIfAborted();setDevices(next);
  });
  const selectDevice=(id:string)=>void run(async(transport,signal)=>{
    setChoice(null);setSource(id);setListing(null);
    const next=await transport.listing(id,signal);signal.throwIfAborted();setListing(next);
  });
  const cancel=()=>setChoice(null);
  const restore=(activate:boolean)=>void run(async(transport,signal)=>{
    if(!source||!choice||!name.trim())return;
    if(activate&&cloudCompatibility(choice,cloud.identity,schema)!=='Compatible')return;
    const raw=await transport.restore(source,choice,signal);
    signal.throwIfAborted();
    await cloud.importSnapshot(raw,name.trim(),activate,signal);
    if(!activate&&!signal.aborted){setChoice(null);setNotice('Cloud autosave copied. Your active save is unchanged.');}
  });

  return (
    <section className="sb-cloud-strip" aria-label="Synced autosaves" data-testid="managed-restore-controls">
      <div className="sb-cloud-strip-head">
        <div className="sb-cloud-strip-left">
          <DeviceIcon />
          <strong>Synced devices</strong>
        </div>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={locked}
          data-testid="discover-autosave-devices"
          onPress={()=>{playSaveUiSound('tap');refresh();}}
        >
          <RefreshIcon />{devices?'Refresh devices':'Show cloud devices'}
        </Button>
      </div>

      {notice&&(
        <Alert status="default" className="sb-save-notice-alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description><span role="status">{notice}</span></Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {devices&&devices.length===0&&<small className="sb-sync-status">No synced autosaves yet.</small>}

      {devices&&devices.length>0&&(
        <div className="v2-save-manager-actions">
          {devices.map(device=>(
            <Button
              key={device.deviceId}
              size="sm"
              variant={source===device.deviceId?'primary':'secondary'}
              isDisabled={locked}
              aria-pressed={source===device.deviceId}
              onPress={()=>{playSaveUiSound('tap');selectDevice(device.deviceId);}}
            >
              {device.deviceId===deviceId?'This browser':'Browser '+device.deviceId.slice(0,8)} ({device.count})
            </Button>
          ))}
        </div>
      )}

      {listing&&listing.snapshots.length===0&&<small className="sb-sync-status">No autosaves on this browser.</small>}

      {listing&&listing.snapshots.length>0&&(
        <div className="sb-save-list">
          {listing.snapshots.map(row=>{
            const matched=exactLocalCloudMatch(row,local,cloud.identity);
            const compat=cloudCompatibility(row,cloud.identity,schema)==='Compatible';
            return (
              <article key={row.id} className="sb-save-card" data-testid="managed-cloud-snapshot">
                <div className="sb-save-card-top">
                  <div className="sb-save-card-info">
                    <div className="sb-save-card-title-row">
                      <strong className="sb-save-card-name">{row.snapshotName}</strong>
                      {matched&&<Chip color="success" variant="soft">On this device + cloud</Chip>}
                      {!compat&&<Chip color="warning" variant="soft">Incompatible</Chip>}
                    </div>
                    <div className="sb-save-card-meta">
                      <p className="sb-save-timestamp"><ClockIcon />{saveDate(row.snapshotCreatedAt)}</p>
                      {!matched&&<span className="sb-save-location-pill">Cloud autosave</span>}
                    </div>
                  </div>
                  <div className="sb-save-card-actions">
                    <Button
                      size="sm"
                      variant="primary"
                      isDisabled={locked}
                      onPress={()=>{playSaveUiSound('tap');setChoice(row);setName((row.snapshotName+' cloud copy').slice(0,80));setNotice('');}}
                    >
                      Restore
                    </Button>
                  </div>
                </div>
                {choice?.id===row.id&&(
                  <CloudRestoreConfirmation
                    state={{choice,name,setName,restore,cancel,keepLocal:()=>{cancel();setNotice('Local progress kept.');}}}
                    local={local}
                    identity={cloud.identity}
                    schema={schema}
                    busy={locked}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
