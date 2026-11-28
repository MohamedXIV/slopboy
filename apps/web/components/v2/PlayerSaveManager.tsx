'use client';
import {useEffect,useState,type CSSProperties,type ReactNode} from 'react';
import {Alert,Button,Chip,Input,Label,Spinner,TextField} from '@heroui/react';
import type {SlotListing,ConfirmedSaveTarget} from '@slopboy/runtime/save-slots';
import {useV2Theme} from './V2AppShell';
import {usePlayerCloudSaves,CloudSaveControls,CloudRestoreConfirmation,type PlayerCloudActions} from './PlayerCloudSaves';
import ManagedRestoreControls from './ManagedRestoreControls';
import {integratedSaves} from './integrated-save-list';
import {cloudCompatibility} from './player-cloud-contract';
import {saveEntries,saveDate,nextSaveSort,SAVE_SORT_LABELS,type SaveSort,type SaveLane} from './player-save-list';
import {isSaveUiMuted,playSaveUiSound,setSaveUiMuted} from './save-ui-sfx';
import {
  BookmarkIcon,ClockIcon,CloudIcon,CloudUploadIcon,DeviceIcon,MoreIcon,
  PlusIcon,SaveDiskIcon,SearchIcon,SortIcon,SoundOffIcon,SoundOnIcon,
} from './save-ui-icons';
import './save-manager.css';

const AUTOSAVE_RING_CAPACITY = 5;

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
  const {theme}=useV2Theme();
  const [editor,setEditor]=useState<NamedAction|null>(null);
  const [newGame,setNewGame]=useState(false);
  const [confirmation,setConfirmation]=useState<{action:DestructiveAction;name:string;date:string}|null>(null);
  const [tab,setTab]=useState<SaveLane>(autoSupported?'auto':'manual');
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState<SaveSort>('newest');
  const [details,setDetails]=useState<string|null>(null);
  const [muted,setMuted]=useState<boolean>(()=>isSaveUiMuted());
  const cloudState=usePlayerCloudSaves(cloud,busy);

  useEffect(()=>{
    playSaveUiSound('open');
  },[]);

  const rows=integratedSaves(listing,currentSlotId,cloudState.list,cloud?.identity,tab,query,sort);
  const changeTab=(next:SaveLane)=>{
    if(next!==tab)playSaveUiSound('tap');
    setTab(next);setEditor(null);setNewGame(false);setConfirmation(null);setQuery('');setDetails(null);cloudState.cancel();
  };
  const autos=saveEntries(listing,currentSlotId,'auto','','newest').length;
  const manuals=saveEntries(listing,currentSlotId,'manual','','newest').length;
  const showAutoTab=autoSupported||autos>0||Boolean(cloudState.list?.snapshots.some(s=>s.kind==='auto'));
  const filledRing=Math.min(autos,AUTOSAVE_RING_CAPACITY);

  const toggleMute=()=>{
    setMuted(setSaveUiMuted(!muted));
  };
  const handleClose=()=>{
    playSaveUiSound('close');
    onClose();
  };

  return (
    <section
      className={'sb-save-manager v2-save-manager sb-heroui-live '+theme}
      data-theme={theme}
      aria-label="Game saves"
      data-testid="player-save-manager"
    >
      <header className="sb-save-header">
        <div className="sb-save-title-wrap">
          <span className="sb-save-title-icon"><SaveDiskIcon /></span>
          <h2>Game saves</h2>
          {busy&&<Spinner size="sm" />}
        </div>
        <div className="sb-save-header-actions">
          <Button
            size="sm"
            variant="ghost"
            className="sb-save-sfx-btn"
            aria-label={muted?'Unmute UI sounds':'Mute UI sounds'}
            aria-pressed={muted}
            data-testid="toggle-save-sfx"
            onPress={toggleMute}
          >
            {muted?<SoundOffIcon />:<SoundOnIcon />}
          </Button>
          <Button size="sm" variant="secondary" isDisabled={busy} onPress={handleClose}>Resume</Button>
        </div>
      </header>

      {notice&&(
        <Alert status="default" className="sb-save-notice-alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description><span role="status">{notice}</span></Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className="sb-save-toolbar">
        <div className="sb-save-segmented" role="group" aria-label="Save types">
          {showAutoTab&&(
            <Button
              size="sm"
              variant="ghost"
              className="sb-save-tab-btn"
              aria-pressed={tab==='auto'}
              isDisabled={busy}
              data-testid="open-autosaves"
              onPress={()=>changeTab('auto')}
            >
              Autosaves <span className="sb-save-tab-count">{autos}</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="sb-save-tab-btn"
            aria-pressed={tab==='manual'}
            isDisabled={busy}
            data-testid="open-manual-saves"
            onPress={()=>changeTab('manual')}
          >
            Manual saves <span className="sb-save-tab-count">{manuals}</span>
          </Button>
        </div>

        {listing&&(
          <div className="sb-save-primary-actions">
            {tab==='manual'&&manualSupported&&(
              <Button
                size="sm"
                variant="primary"
                isDisabled={busy||!manualReady}
                data-testid="manual-save"
                onPress={()=>{playSaveUiSound('tap');setConfirmation(null);setNewGame(false);setEditor({kind:'manual',name:'Manual save'});}}
              >
                <PlusIcon />New save
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              isDisabled={busy}
              data-testid="new-playthrough"
              onPress={()=>{playSaveUiSound('tap');setConfirmation(null);setEditor(null);setNewGame(true);}}
            >
              New game
            </Button>
            {legacyAvailable&&currentSlotId&&(
              <Button size="sm" variant="outline" isDisabled={busy} onPress={()=>{playSaveUiSound('load');void onAction({kind:'legacy'});}}>
                Load original save
              </Button>
            )}
          </div>
        )}
      </div>

      {newGame&&(
        <div className="sb-save-inline-panel">
          <strong>Start a new game?</strong>
          <p>Your existing saves stay safe in this list.</p>
          <div className="v2-save-manager-actions">
            <Button size="sm" variant="primary" isDisabled={busy} data-testid="confirm-new-game" onPress={()=>{playSaveUiSound('load');void onAction({kind:'create',name:'New game'});}}>
              Start new game
            </Button>
            <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>{playSaveUiSound('tap');setNewGame(false);}}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {editor&&(
        <form
          className="sb-save-inline-panel"
          onSubmit={async e=>{
            e.preventDefault();
            if(!busy&&editor.name.trim()&&await onAction(editor)){
              playSaveUiSound('save');
              if(editor.kind==='backup-snapshot'||editor.kind==='manual')changeTab('manual');
              else setEditor(null);
            }
          }}
        >
          <TextField name="saveName" isRequired isDisabled={busy}>
            <Label>{editor.kind==='backup-snapshot'?'Backup name':'Save name'}</Label>
            <Input variant="secondary" maxLength={80} value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})} />
          </TextField>
          <div className="v2-save-manager-actions">
            <Button type="submit" size="sm" variant="primary" isDisabled={busy||!editor.name.trim()} data-testid="confirm-save-name">
              {editor.kind==='rename-slot'||editor.kind==='rename-snapshot'?'Rename':'Save'}
            </Button>
            <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>{playSaveUiSound('tap');setEditor(null);}}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {tab==='auto'&&(
        <div className="sb-save-ring-bar">
          <span className="sb-save-ring-dots" aria-label={filledRing+' of '+AUTOSAVE_RING_CAPACITY+' autosave slots used'}>
            {Array.from({length:AUTOSAVE_RING_CAPACITY},(_,i)=>(
              <span key={i} className={'sb-save-ring-dot'+(i<filledRing?' is-filled':'')} aria-hidden="true" />
            ))}
            <span>{filledRing}/{AUTOSAVE_RING_CAPACITY} rolling slots</span>
          </span>
          <span>Oldest slot overwrites next · Back up any slot to keep it permanently.</span>
        </div>
      )}
      {tab==='manual'&&!manualSupported&&(
        <div className="sb-save-ring-bar">
          <span>This game autosaves automatically. Backups you keep from Autosaves appear here.</span>
        </div>
      )}

      {!listing?(
        <div className="sb-save-loading">
          <Spinner size="sm" />
          <span>Loading saves…</span>
        </div>
      ):(
        <>
          <div className="sb-save-filter-row">
            <div className="sb-save-search-wrap">
              <SearchIcon className="sb-save-search-icon" />
              <TextField name="searchSaves" className="sb-save-search-field">
                <Label className="sb-save-sr-only">Search saves</Label>
                <Input
                  variant="secondary"
                  data-testid="search-saves"
                  placeholder="Search by name or date…"
                  value={query}
                  onChange={e=>setQuery(e.target.value)}
                />
              </TextField>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="sb-save-sort-btn"
              data-testid="sort-saves"
              aria-label={'Sort: '+SAVE_SORT_LABELS[sort]+'. Change order'}
              onPress={()=>{playSaveUiSound('tap');setSort(nextSaveSort(sort));}}
            >
              <SortIcon />{SAVE_SORT_LABELS[sort]}
            </Button>
          </div>

          {!rows.length?(
            <div className="sb-save-empty">
              <SaveDiskIcon />
              <span>{query.trim()?'No matching saves.':tab==='auto'?'No autosaves yet.':'No manual saves or backups yet.'}</span>
            </div>
          ):(
            <div className="sb-save-list">
              {rows.map((entry,index)=>{
                const style={'--sb-i':Math.min(index,8)} as CSSProperties;
                if(entry.location==='cloud'){
                  const row=entry.remote;
                  if(!cloud)return null;
                  const compat=cloudCompatibility(row,cloud.identity,schema)==='Compatible';
                  return (
                    <article key={'cloud:'+row.id} style={style} className="sb-save-card is-cloud-only" data-testid="cloud-snapshot" data-kind={row.kind}>
                      <div className="sb-save-card-top">
                        <div className="sb-save-card-info">
                          <div className="sb-save-card-title-row">
                            <strong className="sb-save-card-name">{entry.name}</strong>
                            <Chip variant="secondary">Cloud only</Chip>
                            {!compat&&<Chip color="warning" variant="soft">Incompatible</Chip>}
                          </div>
                          <div className="sb-save-card-meta">
                            <p className="sb-save-timestamp"><ClockIcon />{saveDate(row.snapshotCreatedAt)}</p>
                            <span className="sb-save-location-pill" data-testid="save-location">Cloud backup</span>
                          </div>
                        </div>
                        <div className="sb-save-card-actions">
                          <Button
                            size="sm"
                            variant="primary"
                            isDisabled={busy}
                            data-testid="select-cloud-restore"
                            onPress={()=>{playSaveUiSound('tap');setEditor(null);setNewGame(false);setConfirmation(null);cloudState.select(row);}}
                          >
                            Restore
                          </Button>
                        </div>
                      </div>
                      {cloudState.choice?.id===row.id&&(
                        <CloudRestoreConfirmation state={cloudState} local={listing} identity={cloud.identity} schema={schema} busy={busy} />
                      )}
                    </article>
                  );
                }

                const {slotId,snapshot:s,name,active}=entry.local;
                const compatible=s.schemaVersion===schema&&s.revisionId!==null;
                const slot=listing.slots.find(item=>item.id===slotId)!;
                const target:ConfirmedSaveTarget={slotId,snapshotId:s.id,digest:s.digest,snapshotName:s.name,slotName:slot.name};
                const manageable=s.kind!=='auto'&&s.kind!=='legacy';
                const deletedInCloud=Boolean(cloudState.list?.deletedSnapshotIds?.includes(s.id));
                const confirm=(kind:DestructiveAction['kind'])=>{
                  playSaveUiSound('warn');
                  setEditor(null);setNewGame(false);
                  setConfirmation({action:{kind,target},name,date:saveDate(s.createdAt)});
                };

                return (
                  <article
                    key={s.id}
                    style={style}
                    className={'sb-save-card'+(active?' is-active':'')}
                    data-testid="save-snapshot"
                    data-kind={s.kind}
                    data-active={active?'true':'false'}
                  >
                    <div className="sb-save-card-top">
                      <div className="sb-save-card-info">
                        <div className="sb-save-card-title-row">
                          <strong className="sb-save-card-name">{name}</strong>
                          {active&&<Chip color="accent" variant="soft">Current</Chip>}
                          {s.kind==='backup'&&<Chip variant="secondary">Backup</Chip>}
                          {s.kind==='legacy'&&<Chip variant="secondary">Original</Chip>}
                          {s.kind==='fork'&&<Chip variant="secondary">Restored</Chip>}
                          {!compatible&&<Chip color="warning" variant="soft">Incompatible</Chip>}
                        </div>
                        <div className="sb-save-card-meta">
                          <p className="sb-save-timestamp" data-testid="save-date">
                            <ClockIcon />{saveDate(s.createdAt)}
                          </p>
                          <span className={'sb-save-location-pill'+(entry.backedUp?' is-synced':'')}>
                            {entry.backedUp?<CloudIcon />:<DeviceIcon />}
                            <span data-testid="save-location">
                              {entry.backedUp?'On this device + cloud':cloudState.list||!cloud?'On this device':'On this device · cloud not checked'}
                            </span>
                          </span>
                        </div>
                        {deletedInCloud&&<small className="sb-sync-status">Cloud copy deleted · Create a new backup to upload again.</small>}
                      </div>

                      <div className="sb-save-card-actions">
                        <Button
                          size="sm"
                          variant="primary"
                          isDisabled={busy||!compatible}
                          data-testid="load-save"
                          onPress={()=>{playSaveUiSound('load');void onAction({kind:'load-snapshot',slotId,snapshotId:s.id});}}
                        >
                          Load
                        </Button>
                        {s.kind==='auto'?(
                          <Button
                            size="sm"
                            variant="secondary"
                            isDisabled={busy}
                            data-testid="backup-autosave"
                            onPress={()=>{playSaveUiSound('tap');setConfirmation(null);setNewGame(false);setEditor({kind:'backup-snapshot',slotId,snapshotId:s.id,name:'Backup '+saveDate(s.createdAt)});}}
                          >
                            <BookmarkIcon />Backup
                          </Button>
                        ):(
                          <Button
                            size="sm"
                            variant="secondary"
                            isDisabled={busy}
                            onPress={()=>{playSaveUiSound('tap');setConfirmation(null);setNewGame(false);setEditor(s.kind==='fork'?{kind:'rename-slot',slotId,name}:{kind:'rename-snapshot',slotId,snapshotId:s.id,name});}}
                          >
                            Rename
                          </Button>
                        )}
                        {cloud&&cloudState.target&&!cloudState.mutation&&!entry.backedUp&&!deletedInCloud&&(
                          <Button
                            size="sm"
                            variant="secondary"
                            isDisabled={busy}
                            data-testid="replace-cloud-with-local"
                            onPress={()=>{playSaveUiSound('tap');cloudState.askReplace(slotId,s.id,name);}}
                          >
                            Use for cloud replacement
                          </Button>
                        )}
                        {cloud&&!entry.backedUp&&!deletedInCloud&&(
                          <Button
                            size="sm"
                            variant="outline"
                            isDisabled={busy}
                            data-testid="upload-local-snapshot"
                            onPress={()=>{playSaveUiSound('save');cloudState.upload(slotId,s.id);}}
                          >
                            <CloudUploadIcon />Cloud
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={details===s.id}
                          aria-label={manageable?'More options':'Save details'}
                          isDisabled={busy}
                          data-testid="save-options"
                          onPress={()=>{playSaveUiSound('tap');setConfirmation(null);setDetails(details===s.id?null:s.id);}}
                        >
                          <MoreIcon />
                        </Button>
                      </div>
                    </div>

                    {details===s.id&&(
                      <div className="sb-save-details-drawer">
                        {manageable&&(
                          <div className="v2-save-manager-actions">
                            {manualSupported&&(
                              <Button size="sm" variant="secondary" isDisabled={busy||!manualReady} data-testid="replace-save" onPress={()=>confirm('replace-manual')}>
                                Overwrite with current progress
                              </Button>
                            )}
                            <Button size="sm" variant="danger" isDisabled={busy||active} data-testid="delete-save" onPress={()=>confirm('delete-permanent')}>
                              Delete
                            </Button>
                            {active&&<small className="sb-sync-status">Load another save before deleting this one.</small>}
                          </div>
                        )}
                        <small className="sb-save-tech" data-testid="save-technical-details">
                          {s.releaseVersion?'Game '+s.releaseVersion+' · ':''}Schema {s.schemaVersion} · {s.revisionId?'Rev '+s.revisionId.slice(0,8):'Unknown revision'} · {s.bytes.toLocaleString()} bytes
                        </small>
                      </div>
                    )}

                    {confirmation?.action.target.snapshotId===s.id&&(
                      <div className="sb-save-inline-panel is-danger" role="group" aria-label="Confirm save change">
                        <strong>{confirmation.action.kind==='replace-manual'?'Overwrite':'Delete'} {confirmation.name}?</strong>
                        <p>
                          {confirmation.date}. {confirmation.action.kind==='replace-manual'
                            ?'Replaces this local save with your current progress.'
                            :'Removes this save from this device.'} Other saves and cloud backups stay safe.
                        </p>
                        <div className="v2-save-manager-actions">
                          <Button
                            size="sm"
                            variant="danger"
                            isDisabled={busy}
                            data-testid="confirm-save-change"
                            onPress={async()=>{
                              if(await onAction(confirmation.action)){
                                playSaveUiSound(confirmation.action.kind==='delete-permanent'?'delete':'save');
                                setConfirmation(null);setDetails(null);
                              }
                            }}
                          >
                            {confirmation.action.kind==='replace-manual'?'Overwrite save':'Delete save'}
                          </Button>
                          <Button size="sm" variant="secondary" isDisabled={busy} data-testid="cancel-save-change" onPress={()=>{playSaveUiSound('tap');setConfirmation(null);}}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {(cloud||syncControls)&&(
        <>
          {cloud&&<CloudSaveControls state={cloudState} busy={busy} />}
          {syncControls&&<div className="sb-sync-group">{syncControls}</div>}
          {tab==='auto'&&cloud?.expectedAccount&&managedDeviceId&&(
            <ManagedRestoreControls cloud={cloud} deviceId={managedDeviceId} local={listing} schema={schema} busy={busy} />
          )}
        </>
      )}
    </section>
  );
}
