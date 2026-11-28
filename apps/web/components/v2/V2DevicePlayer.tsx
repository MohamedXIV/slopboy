'use client';

import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from 'react';
import Link from 'next/link';
import {Button,Drawer} from '@heroui/react';
import {trackBrowserLaunch,trackBrowserPlaytime} from './library-history';
import {makeCartridgeAppearance} from './cartridge-cover';
import {gameSaveIdentity} from './game-save-identity';
import V2CartridgeArt from './V2CartridgeArt';
import {useV2Theme} from './V2AppShell';
import {type PlayableGame} from '@slopboy/catalog';
import {SLOPBOY_1000,type InputName} from '@slopboy/hardware';
import {V2_DEVICE_1000,V2_LCD_PALETTES,V2_SHELLS,type V2PaletteId,type V2ShellId} from '@slopboy/hardware/v2';
import {loadBundledCartridge,type BrowserCartridge} from '@slopboy/runtime/cartridge-browser';
import {SANDBOX_DOCUMENT} from '@slopboy/runtime/sandbox-document';
import {rasterizeFrame,validateFrame} from '@slopboy/runtime/protocol';
import {browserSaveDriver,accountSaveDriver,createGameSaveService,validSave} from '@slopboy/runtime/save-store';
import {RetroScreenRenderer} from './RetroScreenRenderer';
import {DEFAULT_SCREEN_FX,SCREEN_FX_PRESETS,SCREEN_FX_PRESET_META,SCREEN_FX_LEVELS,SCREEN_FX_STORAGE_KEY,
  sanitizeScreenFx,isScreenFxActive,editScreenFx,countActiveScreenFx,
  type ScreenFxSettings,type ScreenRefresh} from './screen-fx-config';
import OfflineInstallControl from './OfflineInstallControl';
import {reviewedPixelSaveCapabilities,supportsAutosave,supportsManualSave,supportsProgressSave} from '@slopboy/runtime/save-capabilities';
import {createSlotSaveStore,type SaveSession,type SlotListing} from '@slopboy/runtime/save-slots';
import PlayerSaveManager,{type SaveManagerAction} from './PlayerSaveManager';
import {useManagedSync,ManagedSyncControls} from './ManagedSyncControls';
import './v2-player.css';

const DEVICE=SLOPBOY_1000; // Explicit v1 compatibility adapter; not a new KAPLAY sandbox.
const PRESENTATION_TICK_TARGET=60; // Host target, not a virtual hardware ceiling.
type Status='loading'|'booting'|'running'|'error';
const KEY_MAP:Record<string,InputName>={
  ArrowUp:'UP',ArrowDown:'DOWN',ArrowLeft:'LEFT',ArrowRight:'RIGHT',
  KeyW:'UP',KeyS:'DOWN',KeyA:'LEFT',KeyD:'RIGHT',
  KeyZ:'A',KeyJ:'A',Space:'A',KeyX:'B',KeyK:'B',ShiftLeft:'B',
  Enter:'START',Backspace:'SELECT'
};
function gamepadButtons():Set<InputName>{
  const buttons=new Set<InputName>();
  if(typeof navigator.getGamepads!=='function')return buttons;
  const controller=Array.from(navigator.getGamepads()).find(Boolean);
  if(!controller)return buttons;
  const pressed=(index:number)=>Boolean(controller.buttons[index]?.pressed);
  const horizontal=controller.axes[0]??0;
  const vertical=controller.axes[1]??0;
  if(pressed(12)||vertical<-.5)buttons.add('UP');
  if(pressed(13)||vertical>.5)buttons.add('DOWN');
  if(pressed(14)||horizontal<-.5)buttons.add('LEFT');
  if(pressed(15)||horizontal>.5)buttons.add('RIGHT');
  if(pressed(0))buttons.add('A');
  if(pressed(1))buttons.add('B');
  if(pressed(9))buttons.add('START');
  if(pressed(8))buttons.add('SELECT');
  return buttons;
}
function isTextTarget(target:EventTarget|null):boolean{
  return target instanceof HTMLElement&&Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
}
const CYCLE_BUTTONS:ReadonlyArray<{name:InputName;label:string;className:string}>=[
  {name:'UP',label:'Up',className:'north'},
  {name:'LEFT',label:'Left',className:'west'},
  {name:'RIGHT',label:'Right',className:'east'},
  {name:'DOWN',label:'Down',className:'south'}
];

const PRESET_ORDER=['clean','lcd','phosphor'] as const;

export default function V2DevicePlayer({game,managedSyncAvailable=false,saveAccountId=null}:{game:PlayableGame;managedSyncAvailable?:boolean;saveAccountId?:string|null}){
  const saveDriver=useMemo(()=>saveAccountId?accountSaveDriver(browserSaveDriver,saveAccountId):browserSaveDriver,[saveAccountId]);
  const [cartridge,setCartridge]=useState<BrowserCartridge|null>(null);
  const [saved,setSaved]=useState<{epoch:number;value:string|null;session?:SaveSession}|null>(null);
  const reviewedCapability=useMemo(()=>reviewedPixelSaveCapabilities(game.gameId,game.revisionId),[game.gameId,game.revisionId]);
  // Only the already-authorized, digest-verified published bundle may opt in.
  // Legacy slug URLs and undeclared historical revisions remain unchanged.
  const capability=reviewedCapability??(game.cartridge.startsWith('/cartridges/by-sha256/')?cartridge?.manifest.saveCapabilities:undefined);
  const manualSupported=supportsManualSave(capability);
  const autoSupported=supportsAutosave(capability);
  const legacyLane=reviewedCapability?.mode==='auto';
  const slotStore=useMemo(()=>capability&&supportsProgressSave(capability)?createSlotSaveStore(saveDriver,{
    gameId:game.gameId,revisionId:game.revisionId,releaseVersion:null,hardwareId:DEVICE.id,
    hardwareVersion:DEVICE.version,capabilities:capability
  }):null,[game.gameId,game.revisionId,capability,saveDriver]);
  const sync=useManagedSync(managedSyncAvailable&&game.status==='published'&&supportsAutosave(reviewedCapability),game.gameId,DEVICE.id,DEVICE.version,slotStore,saveAccountId);
  const pinnedSync=useManagedSync(managedSyncAvailable&&game.status==='published'&&supportsProgressSave(reviewedCapability),game.gameId,DEVICE.id,DEVICE.version,slotStore,saveAccountId,'pinned');
  const [saveManagerOpen,setSaveManagerOpen]=useState(false);
  const [saveListing,setSaveListing]=useState<SlotListing|null>(null);
  const [legacyAvailable,setLegacyAvailable]=useState(false);
  const [saveNotice,setSaveNotice]=useState('');
  const [saveBusy,setSaveBusy]=useState(false);
  const savePaused=useRef(false);
  const saveActionBusy=useRef(false);
  const saveWriteFailed=useRef(false);
  const preparedBoot=useRef<{epoch:number;value:string|null;session?:SaveSession}|null>(null);
  const pendingFlush=useRef<{id:string;resolve:()=>void;reject:(error:Error)=>void;timer:number}|null>(null);
  const pendingCapture=useRef<{id:string;resolve:(data:string)=>void;reject:(error:Error)=>void;timer:number}|null>(null);
  const [epoch,setEpoch]=useState(0);
  const [status,setStatus]=useState<Status>('loading');
  const [reason,setReason]=useState('');
  const [shell,setShell]=useState<V2ShellId>('bone');
  const [palette,setPalette]=useState<V2PaletteId>('moss');
  const [screenFx,setScreenFx]=useState<ScreenFxSettings>(DEFAULT_SCREEN_FX);
  const [fxAvailable,setFxAvailable]=useState(false);
  const [mode,setMode]=useState<'console'|'game'>('console');
  const [compact,setCompact]=useState(false);
  const [mobileSettingsOpen,setMobileSettingsOpen]=useState(false);
  const {theme}=useV2Theme();
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [quickGames,setQuickGames]=useState<{id:string;title:string;genre:string}[]>([]);
  const [quickError,setQuickError]=useState('');
  useEffect(()=>{
    if(!libraryOpen)return;
    const controller=new AbortController();
    fetch('/api/games?limit=24',{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error();return response.json() as Promise<{games:{id:string;title:string;genre:string}[]}>;})
      .then(async data=>{
        const results=await Promise.all(data.games.map(async item=>({item,playable:(await fetch('/api/public-games/'+item.id,{cache:'no-store',signal:controller.signal})).ok})));
        setQuickGames(results.filter(result=>result.playable).map(result=>result.item));setQuickError('');
      }).catch(()=>{if(!controller.signal.aborted)setQuickError('Public games are unavailable.');});
    return()=>controller.abort();
  },[libraryOpen]);
  const [bootComplete,setBootComplete]=useState(false);
  const [fullscreen,setFullscreen]=useState(false);
  const [keyHeld,setKeyHeld]=useState<ReadonlyArray<InputName>>([]);
  const shellRef=useRef<HTMLDivElement>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const fxCanvasRef=useRef<HTMLCanvasElement>(null);
  const displayRef=useRef<HTMLDivElement>(null);
  const screenFxRef=useRef<ScreenFxSettings>(DEFAULT_SCREEN_FX);
  const fxRenderer=useRef<RetroScreenRenderer|null>(null);
  const fxAttempted=useRef(false);
  const fxReady=useRef(false);
  const fxStorageReady=useRef(false);
  const iframeRef=useRef<HTMLIFrameElement>(null);
  const sessionKey=useRef('');
  const statusRef=useRef<Status>('loading');
  const pressed=useRef(new Set<InputName>());
  const physical=useRef(new Set<InputName>());
  const pointerButtons=useRef(new Map<number,InputName>());
  const gamepadPrevious=useRef(new Set<InputName>());
  const ready=useRef(false);
  const lastTick=useRef(0);
  const lastImage=useRef<Uint8Array|null>(null);
  const currentPalette=useRef(V2_LCD_PALETTES.moss.colors as readonly string[]);
  const writeChain=useRef<Promise<void>>(Promise.resolve());
  const lastSave=useRef(0);
  const bootTimer=useRef<number|null>(null);

  const updateStatus=useCallback((state:Status,message='')=>{
    statusRef.current=state;setStatus(state);setReason(message);
  },[]);
  const post=useCallback((type:string,extra:Record<string,unknown>={})=>{
    iframeRef.current?.contentWindow?.postMessage({scope:'slopboy-v1',type,key:sessionKey.current,...extra},'*');
  },[]);
  const onFxAvailability=useCallback((available:boolean)=>{
    fxReady.current=available;setFxAvailable(available);
  },[]);
  const presentFx=useCallback((force=false)=>{
    const source=canvasRef.current,output=fxCanvasRef.current,settings=screenFxRef.current;
    if(!source||!output||!isScreenFxActive(settings))return;
    if(!fxRenderer.current&&!fxAttempted.current){
      fxAttempted.current=true;
      const renderer=new RetroScreenRenderer(output,onFxAvailability);
      if(renderer.available)fxRenderer.current=renderer;
      else renderer.dispose();
    }
    if(fxRenderer.current?.present(source,settings,force)&&!fxReady.current){
      onFxAvailability(true);
    }
  },[onFxAvailability]);
  // Guest-local, versioned presentation preference; auth sync can later use same contract.
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      try{
        const saved=window.localStorage.getItem(SCREEN_FX_STORAGE_KEY);
        if(saved)setScreenFx(sanitizeScreenFx(JSON.parse(saved)));
      }catch{/* Private browsing and corrupt preferences fall back to LCD. */}
      fxStorageReady.current=true;
    });
    return()=>cancelAnimationFrame(frame);
  },[]);
  useEffect(()=>{
    screenFxRef.current=screenFx;
    if(fxStorageReady.current){
      try{window.localStorage.setItem(SCREEN_FX_STORAGE_KEY,JSON.stringify(screenFx));}
      catch{/* Storage denial never stops games. */}
    }
    if(lastImage.current)presentFx(true);
  },[screenFx,presentFx]);
  useEffect(()=>{
    const screen=displayRef.current;
    if(!screen||typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(()=>{if(lastImage.current)presentFx(true);});
    observer.observe(screen);
    return()=>observer.disconnect();
  },[presentFx]);
  useEffect(()=>()=>{fxRenderer.current?.dispose();fxRenderer.current=null;},[]);
  useEffect(()=>{
    const media=window.matchMedia('(max-width:760px)');
    const sync=()=>{setCompact(media.matches);if(!media.matches)setMobileSettingsOpen(false);};
    const frame=requestAnimationFrame(sync);
    media.addEventListener('change',sync);
    return()=>{cancelAnimationFrame(frame);media.removeEventListener('change',sync);};
  },[]);
  useEffect(()=>{
    let last=performance.now();
    const flush=()=>{
      const now=performance.now(),elapsed=now-last;last=now;
      if(ready.current&&statusRef.current==='running'&&document.visibilityState==='visible')
        trackBrowserPlaytime(game.gameId,elapsed);
    };
    const visibility=()=>{last=performance.now();};
    const interval=window.setInterval(flush,5000);
    document.addEventListener('visibilitychange',visibility);
    return()=>{flush();clearInterval(interval);document.removeEventListener('visibilitychange',visibility);};
  },[game.gameId]);
  const draw=useCallback((pixels:Uint8Array,paletteColors:readonly string[])=>{
    const ctx=canvasRef.current?.getContext('2d',{alpha:false});
    if(!ctx)return;
    ctx.imageSmoothingEnabled=false;
    ctx.putImageData(rasterizeFrame(pixels,DEVICE.display.width,DEVICE.display.height,paletteColors),0,0);
    presentFx();
  },[presentFx]);
  useEffect(()=>{
    currentPalette.current=V2_LCD_PALETTES[palette].colors;
    if(lastImage.current)draw(lastImage.current,currentPalette.current);
  },[palette,draw]);
  useEffect(()=>{
    let active=true;
    loadBundledCartridge(game.cartridge,DEVICE).then(loaded=>{
      if(loaded.manifest.id!==game.legacySlug)throw Error('Cartridge ID mismatch');
      if(active){setCartridge(loaded);updateStatus('booting');}
    }).catch(err=>{if(active)updateStatus('error',String(err));});
    return()=>{active=false;};
  },[game,updateStatus]);
  useEffect(()=>{
    if(!cartridge)return;
    let active=true;
    setSaved(null);
    const legacy=createGameSaveService(saveDriver,DEVICE,gameSaveIdentity(game));
    const start=writeChain.current.then(async()=>{
      if(!active)return;
      if(preparedBoot.current?.epoch===epoch){setSaved(preparedBoot.current);return;}
      if(capability?.mode==='none'){setSaved({epoch,value:null});return;}
      if(!slotStore){const value=await legacy.read().catch(()=>null);if(active)setSaved({epoch,value});return;}
      const value=legacyLane?await legacy.read():null,listing=await slotStore.list();
      if(!active)return;
      setLegacyAvailable(value!==null);
      let selected=listing.selectedSlotId;
      // Preserve historical behavior for existing saves; fresh games use named slots.
      if(!selected&&value===null&&listing.slots.length===0)selected=await slotStore.create('Playthrough 1');
      if(!active)return;
      if(!selected&&value===null&&listing.slots.length>0){
        setSaveListing(listing);
        throw Error('Select a saved playthrough before starting.');
      }
      const opened=selected?await slotStore.open(selected):null;
      const refreshed=await slotStore.list();
      if(active){setSaveListing(refreshed);setSaved({epoch,value:opened?opened.data:value,...(opened?{session:opened.session}:{})});}
    }).catch(()=>{if(active){setSaveNotice('Local saves could not be opened. Your existing data has not been replaced.');updateStatus('error','Local save unavailable');}});
    writeChain.current=start;
    return()=>{active=false;};
  },[cartridge,epoch,game,capability,slotStore,updateStatus,legacyLane]);

  useEffect(()=>{
    if(!cartridge||!saved||saved.epoch!==epoch)return;
    sessionKey.current=crypto.randomUUID();
    lastSave.current=0;
    ready.current=false;lastTick.current=0;lastImage.current=null;
    gamepadPrevious.current.clear();
    const onMessage=(event:MessageEvent)=>{
      if(event.source!==iframeRef.current?.contentWindow||event.origin!=='null')return;
      const msg=event.data;
      if(!msg||msg.scope!=='slopboy-v1')return;
      if(msg.type==='boot'){
        post('load',{code:cartridge.code,width:DEVICE.display.width,height:DEVICE.display.height,shades:DEVICE.display.indexedColors,save:saved.value,manualCapture:manualSupported});
        return;
      }
      if(msg.key!==sessionKey.current)return;
      if(msg.type==='ready'){
        ready.current=true;trackBrowserLaunch(game.gameId);updateStatus('running');
        if(bootTimer.current)clearTimeout(bootTimer.current);
        bootTimer.current=window.setTimeout(()=>setBootComplete(true),1100);
        return;
      }
      if(msg.type==='error'){ready.current=false;
        const capture=pendingCapture.current;if(capture){clearTimeout(capture.timer);pendingCapture.current=null;capture.reject(Error('Game stopped during capture'));}
        updateStatus('error',String(msg.reason||'Game stopped').slice(0,120));return;}
      if(msg.type==='frame'&&ready.current){
        const pixels:unknown=msg.pixels;
        if(!validateFrame(pixels,DEVICE.display.width,DEVICE.display.height,DEVICE.display.indexedColors)){
          ready.current=false;post('stop');updateStatus('error','Invalid isolated game frame');return;
        }
        lastImage.current=Uint8Array.from(pixels);
        draw(pixels,currentPalette.current);
      }
      if(msg.type==='save-flushed'){
        const waiting=pendingFlush.current;
        if(waiting&&msg.requestId===waiting.id){
          clearTimeout(waiting.timer);pendingFlush.current=null;waiting.resolve();
        }
        return;
      }
      if(msg.type==='save-captured'||msg.type==='capture-failed'){
        const waiting=pendingCapture.current;
        if(!manualSupported||!waiting||msg.requestId!==waiting.id)return;
        clearTimeout(waiting.timer);pendingCapture.current=null;
        if(msg.type==='save-captured'&&typeof msg.value==='string'&&validSave(msg.value,DEVICE)&&!msg.value.includes('\0'))waiting.resolve(msg.value);
        else waiting.reject(Error('Manual capture failed'));
        return;
      }
      if(msg.type==='save'&&ready.current){
        if(capability?.mode==='none'||capability?.mode==='manual')return;
        if(!validSave(msg.value,DEVICE)){ready.current=false;post('stop');updateStatus('error','Invalid save request');return;}
        const now=Date.now();
        if(!slotStore&&now-lastSave.current<250)return;
        lastSave.current=now;
        const value=msg.value as string|null;
        const store=createGameSaveService(saveDriver,DEVICE,gameSaveIdentity(game));
        const bound=saved.session;
        writeChain.current=writeChain.current.then(async()=>{
          if(slotStore&&bound){
            // Reviewed Circuit Slide never calls erase. Do not silently erase snapshots.
            if(value===null)throw Error('Named autosave cannot be erased by a game');
            await slotStore.autosave(bound,value);
            setSaveListing(await slotStore.list());
          }else{
            await store.write(value);
            if(slotStore)setLegacyAvailable(value!==null);
          }
          saveWriteFailed.current=false;
        }).catch(()=>{saveWriteFailed.current=true;setSaveNotice('Autosave failed. Progress has not been saved; retry before changing saves.');});
      }
    };
    window.addEventListener('message',onMessage);
    let animation=0;
    const tick=(now:number)=>{
      animation=requestAnimationFrame(tick);
      if(!ready.current||savePaused.current||statusRef.current!=='running'||now-lastTick.current<1000/PRESENTATION_TICK_TARGET)return;
      const dt=lastTick.current?Math.min((now-lastTick.current)/1000,0.05):1/60;
      lastTick.current=now;
      const pad=gamepadButtons();
      for(const key of pad)if(!gamepadPrevious.current.has(key))pressed.current.add(key);
      gamepadPrevious.current=pad;
      const down=new Set([...physical.current,...pad]);
      post('tick',{dt,down:[...down],pressed:[...pressed.current]});
      pressed.current.clear();
    };
    animation=requestAnimationFrame(tick);
    return()=>{
      cancelAnimationFrame(animation);
      if(bootTimer.current)clearTimeout(bootTimer.current);
      window.removeEventListener('message',onMessage);
      const waiting=pendingFlush.current;if(waiting){clearTimeout(waiting.timer);pendingFlush.current=null;waiting.reject(Error('Game stopped'));}
      const capture=pendingCapture.current;if(capture){clearTimeout(capture.timer);pendingCapture.current=null;capture.reject(Error('Game stopped'));}
      ready.current=false;
      post('stop');
    };
  },[cartridge,saved,epoch,post,draw,updateStatus,game,capability,slotStore,manualSupported]);

  const syncKeys=useCallback(()=>{
    setKeyHeld([...physical.current]);
  },[]);
  const press=useCallback((name:InputName)=>{
    if(!physical.current.has(name))pressed.current.add(name);
    physical.current.add(name);
    syncKeys();
  },[syncKeys]);
  const release=useCallback((name:InputName)=>{
    physical.current.delete(name);
    syncKeys();
  },[syncKeys]);
  useEffect(()=>{
    const down=(event:KeyboardEvent)=>{
      if(savePaused.current||libraryOpen||mobileSettingsOpen||event.altKey||event.ctrlKey||event.metaKey||isTextTarget(event.target))return;
      const name=KEY_MAP[event.code];
      if(!name)return;
      event.preventDefault();press(name);
    };
    const up=(event:KeyboardEvent)=>{
      if(savePaused.current||libraryOpen||mobileSettingsOpen)return;
      const name=KEY_MAP[event.code];
      if(!name)return;
      event.preventDefault();release(name);
    };
    const blur=()=>{physical.current.clear();pointerButtons.current.clear();pressed.current.clear();syncKeys();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[press,release,syncKeys,libraryOpen,mobileSettingsOpen]);
  useEffect(()=>{
    const onChange=()=>setFullscreen(document.fullscreenElement===shellRef.current);
    document.addEventListener('fullscreenchange',onChange);
    return()=>document.removeEventListener('fullscreenchange',onChange);
  },[]);

  const pointerDown=(name:InputName)=>(event:ReactPointerEvent<HTMLButtonElement>)=>{
    if(savePaused.current)return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    pointerButtons.current.set(event.pointerId,name);press(name);
  };
  const pointerUp=(event:ReactPointerEvent<HTMLButtonElement>)=>{
    const name=pointerButtons.current.get(event.pointerId);
    if(!name)return;
    pointerButtons.current.delete(event.pointerId);
    if(![...pointerButtons.current.values()].includes(name))release(name);
  };
  const button=(name:InputName,style:string,label:string)=>{
    const active=keyHeld.includes(name);
    return <button key={name+style} type="button" className={'v2-button '+style+(active?' is-held':'')}
      aria-label={label} aria-pressed={active} onPointerDown={pointerDown(name)}
      onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}>{name}</button>;
  };
  const clearGameInput=()=>{physical.current.clear();pointerButtons.current.clear();pressed.current.clear();gamepadPrevious.current.clear();syncKeys();};
  const flushSaves=async()=>{
    if(ready.current){
      if(pendingFlush.current)throw Error('Save flush already pending');
      await new Promise<void>((resolve,reject)=>{
        const id=crypto.randomUUID();
        const timer=window.setTimeout(()=>{pendingFlush.current=null;reject(Error('Save flush timed out'));},2500);
        pendingFlush.current={id,timer,resolve,reject};post('flush-save',{requestId:id});
      });
    }
    await writeChain.current;
    if(saveWriteFailed.current)throw Error('Previous autosave failed');
  };
  const captureLiveSave=async():Promise<string>=>{
    if(!manualSupported||!ready.current||!savePaused.current||!saved?.session||pendingCapture.current)
      throw Error('Manual save unavailable');
    return new Promise<string>((resolve,reject)=>{
      const id=crypto.randomUUID();
      const timer=window.setTimeout(()=>{pendingCapture.current=null;reject(Error('Manual capture timed out'));},2500);
      pendingCapture.current={id,timer,resolve,reject};post('capture-save',{requestId:id});
    });
  };
  const restartWith=(next?:{value:string|null;session?:SaveSession})=>{
    post('stop');ready.current=false;clearGameInput();
    const nextEpoch=epoch+1;
    preparedBoot.current=next?{...next,epoch:nextEpoch}:null;
    setBootComplete(false);updateStatus('booting');setEpoch(nextEpoch);
  };
  const closeSaveManager=()=>{if(saveActionBusy.current)return;savePaused.current=false;lastTick.current=0;setSaveManagerOpen(false);};
  const showSaveManager=()=>{
    if(!slotStore||saveActionBusy.current)return;
    savePaused.current=true;clearGameInput();setSaveManagerOpen(true);
    void slotStore.list().then(setSaveListing).catch(()=>setSaveNotice('Could not read local saves.'));
  };
  const saveAction=async(action:SaveManagerAction):Promise<boolean>=>{
    if(!slotStore||saveActionBusy.current)return false;
    saveActionBusy.current=true;setSaveBusy(true);setSaveNotice('');
    try{
      await flushSaves();
      let target:string|undefined;
      switch(action.kind){
        case 'create':target=await slotStore.create(action.name);break;
        case 'load-snapshot':{
          const opened=await slotStore.openSnapshot(action.slotId,action.snapshotId);
          restartWith({value:opened.data,session:opened.session});savePaused.current=false;setSaveManagerOpen(false);break;
        }
        case 'rename-slot':await slotStore.renameSlot(action.slotId,action.name);break;
        case 'rename-snapshot':await slotStore.renameSnapshot(action.slotId,action.snapshotId,action.name);break;
        case 'manual':{
          if(!saved?.session||!manualSupported)throw Error('Manual save unsupported');
          const value=await captureLiveSave();
          await slotStore.manualSave(saved.session,action.name,value);break;
        }
        case 'replace-manual':{
          if(!saved?.session||!manualSupported)throw Error('Manual save unsupported');
          const value=await captureLiveSave();
          await slotStore.replaceManualSave(saved.session,action.target,value);break;
        }
        case 'delete-permanent':await slotStore.deletePermanentSave(action.target);break;
        case 'backup-snapshot':await slotStore.backupSnapshot(action.slotId,action.snapshotId,action.name);break;
        case 'legacy':{
          const value=await createGameSaveService(saveDriver,DEVICE,gameSaveIdentity(game)).read();
          if(value===null)throw Error('Legacy save unavailable');
          if(saved?.session)await slotStore.close(saved.session);
          restartWith({value});savePaused.current=false;setSaveManagerOpen(false);break;
        }
      }
      if(target){
        const opened=await slotStore.open(target);
        restartWith({value:opened.data,session:opened.session});savePaused.current=false;setSaveManagerOpen(false);
      }
      setSaveListing(await slotStore.list());
      setSaveNotice(action.kind==='manual'?'Game saved.':action.kind==='replace-manual'?'Save overwritten.':action.kind==='delete-permanent'?'Save deleted from this device.':action.kind==='backup-snapshot'?'Backup saved.':action.kind==='rename-slot'||action.kind==='rename-snapshot'?'Name updated.':'');return true;
    }catch(error){
      const code=error instanceof Error?error.message:'';
      setSaveNotice(code==='ACTIVE_SAVE_PROTECTED'?'Load another save before deleting this one.':code==='SAVE_SNAPSHOT_CHANGED'||code==='SAVE_SNAPSHOT_NOT_FOUND'?'This save changed. Reopen Saves and try again.':'Save action could not complete. Existing saves were retained.');return false;
    }
    finally{saveActionBusy.current=false;setSaveBusy(false);}
  };
  const withCloudLock=async(work:()=>Promise<void>)=>{
    if(!slotStore||saveActionBusy.current)throw Error('SAVE_BUSY');
    saveActionBusy.current=true;setSaveBusy(true);
    try{await work();}finally{saveActionBusy.current=false;setSaveBusy(false);}
  };
  const restart=async()=>{
    if(saveActionBusy.current)return;
    if(!slotStore){restartWith();return;}
    saveActionBusy.current=true;savePaused.current=true;setSaveBusy(true);clearGameInput();
    try{
      await flushSaves();
      if(saved?.session){
        const opened=await slotStore.open(saved.session.slotId);
        restartWith({value:opened.data,session:opened.session});
      }else restartWith();
      setSaveNotice('');
    }catch{setSaveNotice('Restart cancelled because progress could not be confirmed saved.');}
    finally{saveActionBusy.current=false;savePaused.current=false;setSaveBusy(false);}
  };
  const fullscreenClick=async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    }catch{ /* Optional fullscreen denial must never interrupt gameplay. */ }
  };
  const colors = V2_SHELLS[shell];
  const paletteInfo = V2_LCD_PALETTES[palette];
  const fxActive = fxAvailable && isScreenFxActive(screenFx);
  const activeFxCount = countActiveScreenFx(screenFx);
  const shellStyle = {
    '--v2-shell': colors.base,
    '--v2-shadow': colors.shadow,
    '--v2-ink': colors.ink,
    '--v2-face': colors.button,
    '--v2-lcd-bg': paletteInfo.colors[0],
    '--v2-lcd-ink': paletteInfo.colors[3]
  } as CSSProperties;

  const fxStateLabel = !screenFx.enabled
    ? 'BYPASSED'
    : !isScreenFxActive(screenFx)
    ? 'RAW 1:1'
    : fxAvailable
    ? 'GPU ACTIVE'
    : 'FALLBACK';

  const cartridgeAppearance=makeCartridgeAppearance(game.legacySlug);
  const settingsPanel=(
        <aside className="v2-side">
          <div className="v2-side-intro">
            <span className="v2-kicker">DEVICE APPEARANCE / YOUR SETTINGS</span>
            <h1>Make it <em>yours.</em></h1>
            <p>
              Customize your screen and shell without changing the game. Open your library to insert another cartridge.
            </p>
          </div>

          <div className="v2-option">
            <div className="v2-option-header">
              <h2>
                Shell finish <small>Cosmetic only</small>
              </h2>
              <strong className="v2-active-choice">{V2_SHELLS[shell].name}</strong>
            </div>
            <div className="v2-swatches">
              {(Object.keys(V2_SHELLS) as V2ShellId[]).map(id => (
                <button
                  type="button"
                  key={id}
                  className={'v2-swatch' + (shell === id ? ' selected' : '')}
                  style={
                    {
                      background: V2_SHELLS[id].base,
                      '--swatch-base': V2_SHELLS[id].base,
                      '--swatch-shadow': V2_SHELLS[id].shadow,
                      '--swatch-button': V2_SHELLS[id].button,
                      '--swatch-ink': V2_SHELLS[id].ink
                    } as CSSProperties
                  }
                  title={V2_SHELLS[id].name}
                  aria-label={'Shell: ' + V2_SHELLS[id].name}
                  aria-pressed={shell === id}
                  onClick={() => setShell(id)}
                >
                  <span className="v2-swatch-chip" aria-hidden="true">
                    <i className="v2-swatch-dot" />
                  </span>
                  <span className="v2-swatch-name">{V2_SHELLS[id].name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="v2-option">
            <div className="v2-option-header">
              <h2>
                LCD tint <small>Same 4 logical shades</small>
              </h2>
              <strong className="v2-active-choice">{paletteInfo.name}</strong>
            </div>
            <div className="v2-palettes">
              {(Object.keys(V2_LCD_PALETTES) as V2PaletteId[]).map(id => (
                <button
                  key={id}
                  type="button"
                  className={palette === id ? 'chosen' : ''}
                  onClick={() => setPalette(id)}
                  aria-pressed={palette === id}
                >
                  <span className="v2-palette-bars">
                    {V2_LCD_PALETTES[id].colors.map(c => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                  <span className="v2-palette-title">{V2_LCD_PALETTES[id].name}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            className={'v2-option v2-fx-panel' + (!screenFx.enabled ? ' is-bypassed' : '')}
            aria-label="Retro screen effects settings"
          >
            <div className="v2-fx-heading v2-toggle">
              <div>
                <div className="v2-fx-title-row">
                  <h2>
                    Screen effects <small>WebGL presentation</small>
                  </h2>
                  <span className={'v2-fx-badge ' + (screenFx.enabled && isScreenFxActive(screenFx) ? 'on' : 'off')}>
                    {fxStateLabel}
                  </span>
                </div>
                <p>Cosmetic only. The game always runs at its own speed.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Screen effects"
                aria-checked={screenFx.enabled}
                className={screenFx.enabled ? 'enabled' : ''}
                onClick={() => setScreenFx(fx => ({ ...fx, enabled: !fx.enabled }))}
              >
                <i />
              </button>
            </div>

            <div className="v2-fx-presets-block">
              <div className="v2-fx-subhead">
                <span>OPTICAL PRESET</span>
                <span>
                  {!screenFx.enabled
                    ? 'Bypassed — click a preset to enable'
                    : screenFx.preset === 'custom'
                    ? 'Custom tuned (' + activeFxCount + ' active)'
                    : SCREEN_FX_PRESET_META[screenFx.preset].badge}
                </span>
              </div>
              <div className="v2-fx-presets" role="group" aria-label="Screen effect presets">
                {PRESET_ORDER.map(preset => {
                  const meta = SCREEN_FX_PRESET_META[preset];
                  const isSelected = screenFx.preset === preset;
                  return (
                    <button
                      type="button"
                      key={preset}
                      aria-pressed={isSelected}
                      className={(isSelected ? 'chosen' : '') + (screenFx.enabled && isSelected ? ' active-preset' : '')}
                      onClick={() => setScreenFx({ ...SCREEN_FX_PRESETS[preset] })}
                    >
                      <span className="v2-preset-badge">{meta.badge}</span>
                      <strong className="v2-preset-name">{meta.label}</strong>
                      <small className="v2-preset-desc">{meta.description}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="v2-fx-row">
              <div className="v2-fx-row-copy">
                <label htmlFor="v2-screen-refresh">Simulated screen refresh</label>
                <small>Throttles display sampling only, never game logic</small>
              </div>
              <select
                id="v2-screen-refresh"
                value={screenFx.refresh}
                disabled={!screenFx.enabled}
                onChange={event =>
                  setScreenFx(fx => ({
                    ...fx,
                    refresh: event.target.value as ScreenRefresh,
                    preset: 'custom'
                  }))
                }
              >
                <option value="native">Native / smooth</option>
                <option value="30">30 FPS LCD cadence</option>
                <option value="20">20 FPS retro cadence</option>
              </select>
            </div>

            <details className="v2-fx-details">
              <summary>
                <span className="v2-summary-title">Fine-tune effects</span>
                <span className="v2-summary-meta">
                  {screenFx.preset === 'custom' ? 'CUSTOM · ' + activeFxCount + '/8' : screenFx.preset.toUpperCase()}
                </span>
              </summary>
              <div className="v2-fx-sliders">
                <div className="v2-fx-sliders-bar">
                  <span>Adjust pixel matrix &amp; glass optics</span>
                  {screenFx.preset === 'custom' && (
                    <button
                      type="button"
                      className="v2-fx-reset"
                      onClick={() => setScreenFx({ ...SCREEN_FX_PRESETS.lcd })}
                    >
                      Reset to Classic LCD
                    </button>
                  )}
                </div>
                <div className="v2-fx-sliders-grid">
                  {SCREEN_FX_LEVELS.map(({ key, label, hint, group }) => (
                    <div key={key} className={'v2-fx-slider' + (screenFx[key] > 0 ? ' is-nonzero' : '')}>
                      <label htmlFor={'v2-fx-' + key}>
                        <span className="v2-slider-label">
                          <strong>{label}</strong>
                          <small>{hint}</small>
                        </span>
                        <span className="v2-slider-val" data-group={group}>
                          {screenFx[key]}%
                        </span>
                      </label>
                      <input
                        id={'v2-fx-' + key}
                        aria-label={label}
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        disabled={!screenFx.enabled}
                        value={screenFx[key]}
                        style={{ '--fx-pct': `${screenFx[key]}%` } as CSSProperties}
                        onChange={event => setScreenFx(fx => editScreenFx(fx, key, Number(event.target.value)))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </details>

            <p className="v2-fx-note">
              <span className={'v2-fx-dot ' + (fxActive ? 'live' : 'raw')} aria-hidden="true" />
              {!screenFx.enabled || !isScreenFxActive(screenFx)
                ? 'Raw indexed pixels · no visual processing'
                : fxAvailable
                ? 'GPU effects active · 4-color source unchanged'
                : 'Waiting for WebGL · raw pixels remain visible'}
              <span> · Preferences saved on this device</span>
            </p>
          </div>

          <div className="v2-specs">
            <div>
              <span>LOGICAL DISPLAY</span>
              <strong>160 × 144</strong>
            </div>
            <div>
              <span>SCREEN SHADES</span>
              <strong>4 indexed</strong>
            </div>
            <div>
              <span>ENGINE</span>
              <strong>Pixel v1 compatibility</strong>
            </div>
            <div>
              <span>SAVE</span>
              <strong>{capability?.mode==='none'?'Not supported':manualSupported&&autoSupported?'Local · manual + auto':manualSupported?'Local · manual':slotStore?'Local · autosave':'Legacy adapter'}</strong>
            </div>
          </div>
          <p className="v2-security">
            Reviewed cartridge with isolated execution. Local saves work offline. Cloud backups are optional for supported games.
          </p>
        </aside>
  );
  return (
    <main className="v2-player" data-v2-theme={theme}>
      <section className="v2-player-toolbar" aria-label="Current game controls">
        <div className="v2-session-id">
          <span className="v2-player-toolbar-kicker">CARTRIDGE INSERTED / SLOPBOY 1000</span>
          <strong>{game.title}</strong>
        </div>
        <div className="v2-player-toolbar-actions">
          <Button size="sm" variant="secondary" className="sb-control sb-control-primary v2-change-game"
            aria-label="Open quick game library"
            onPress={()=>{
              physical.current.clear();pressed.current.clear();syncKeys();
              setLibraryOpen(true);
            }}>
            ↧ Change cartridge
          </Button>
          {slotStore&&<Button size="sm" variant="secondary" isDisabled={saveBusy||(!saved&&!saveListing)} data-testid="open-game-saves" onPress={showSaveManager}>Saves</Button>}
          <Link href="/library" className="v2-full-library-link">Full library</Link>
          <OfflineInstallControl gameId={game.gameId}/>
          <Button size="sm" variant="secondary" className="sb-control v2-mobile-settings"
            onPress={()=>{
              physical.current.clear();pressed.current.clear();syncKeys();
              setMobileSettingsOpen(true);
            }} aria-label="Open device settings">
            ⚙ Settings
          </Button>
        </div>
      </section>

      <div className="v2-player-grid">
        <section className="v2-device-section" aria-label="Interactive virtual handheld">
          <div className="v2-topline">
            <div className="v2-topline-left">
              <span className="v2-topline-tag">MODEL / 001</span>
              <span>
                {V2_DEVICE_1000.display.width}×{V2_DEVICE_1000.display.height} ·{' '}
                {V2_DEVICE_1000.display.indexedColors} SHADES
              </span>
            </div>
            <div className="v2-topline-right">
              <span className={'v2-runtime-pill ' + status}>
                <i aria-hidden="true" />
                {status === 'running' ? 'PLAYING · ' + game.title.toUpperCase() : status.toUpperCase()}
              </span>
            </div>
          </div>

          <div
            className={
              'v2-device-stage' +
              (mode === 'game' ? ' v2-game-mode' : '') +
              ' shell-' +
              shell +
              ' preset-' +
              (screenFx.enabled ? screenFx.preset : 'bypass')
            }
            ref={shellRef}
            style={shellStyle}
          >
            <div className="v2-stage-hud v2-stage-hud-tl" aria-hidden="true">
              <span>DISPLAY // {paletteInfo.name.toUpperCase()}</span>
              <span>OPTICS // {screenFx.enabled ? screenFx.preset.toUpperCase() : 'RAW BYPASS'}</span>
            </div>
            <div className="v2-stage-hud v2-stage-hud-tr" aria-hidden="true">
              <span>CADENCE // {screenFx.refresh === 'native' ? 'NATIVE / SMOOTH' : screenFx.refresh + 'FPS SAMPLE'}</span>
              <span>SHELL // {colors.name.toUpperCase()}</span>
            </div>

            <div className="v2-hardware-body">
              <div key={'insert-'+epoch} className="v2-cartridge-entrant" aria-hidden="true"
                style={{'--v2-cart':cartridgeAppearance.primary} as CSSProperties}>
                <span>{game.title.toUpperCase()}</span><small>SLOPBOY / LOADING</small>
              </div>
              <div className="v2-cartridge-slot" aria-hidden="true">
                <span className="v2-slot-grip" />
                <span className="v2-slot-label">CART · {game.legacySlug.toUpperCase()}</span>
                <span className="v2-slot-grip" />
              </div>

              <div className="v2-shell-logo">
                <div className="v2-logo-lockup">
                  <strong>
                    SLOPBOY <em>1000</em>
                  </strong>
                  <span className="v2-model-sub">POCKET SYSTEM</span>
                </div>
                <div className="v2-power-cluster">
                  <span className="v2-power-label">PWR</span>
                  <span className={'v2-led' + (status === 'running' ? ' on' : '')} />
                </div>
              </div>

              <div className="v2-screen-bezel">
                <div className="v2-bezel-top" aria-hidden="true">
                  <span className="v2-bezel-spec">DOT MATRIX · 4-SHADE</span>
                  <span className="v2-bezel-fx-tag">
                    {!screenFx.enabled || !isScreenFxActive(screenFx)
                      ? '1:1 RAW'
                      : screenFx.preset === 'phosphor'
                      ? 'CRT PHOSPHOR'
                      : 'OPTICAL LCD'}
                  </span>
                </div>
                <div className="v2-display-well">
                  <div
                    ref={displayRef}
                    className={
                      'v2-display' +
                      (fxActive ? ' fx-active' : '') +
                      ' fx-mode-' +
                      (screenFx.enabled ? screenFx.preset : 'clean')
                    }
                  >
                    <canvas
                      className="v2-raw-frame"
                      width={V2_DEVICE_1000.display.width}
                      height={V2_DEVICE_1000.display.height}
                      ref={canvasRef}
                      role="img"
                      aria-label={game.title + ' game screen'}
                    />
                    <canvas className="v2-fx-output" ref={fxCanvasRef} aria-hidden="true" />
                    <div className="v2-display-glass" aria-hidden="true"
                        style={{opacity:fxActive?screenFx.glass/100:0}} />
                    <div className={'v2-boot-screen'+(status==='running'&&bootComplete?' v2-boot-done':'')} aria-hidden="true">
                      <strong>SLOPBOY 1000</strong><span>{status==='running'?'READY / GAME LOADED':'CHECKING CARTRIDGE'}</span>
                      <i/>
                    </div>
                  </div>
                </div>
                <div className="v2-screen-note">
                  <span className="v2-bezel-tick" aria-hidden="true" />
                  <span>PIXEL POCKET · FOUR SHADES</span>
                  <span className="v2-bezel-tick" aria-hidden="true" />
                </div>
              </div>

              <div className="v2-controls">
                <div className="v2-dpad-well">
                  <div className="v2-dpad">
                    {CYCLE_BUTTONS.map(({ name, label, className }) => button(name, className, label))}
                    <span className="v2-dpad-pivot" aria-hidden="true" />
                  </div>
                  <span className="v2-control-caption" aria-hidden="true">
                    DIRECTIONAL
                  </span>
                </div>
                <div className="v2-facepad-well">
                  <div className="v2-facepad">
                    <div className="v2-face-unit">
                      {button('B', 'v2-b', 'B button')}
                      <span className="v2-face-label" aria-hidden="true">
                        B
                      </span>
                    </div>
                    <div className="v2-face-unit">
                      {button('A', 'v2-a', 'A button')}
                      <span className="v2-face-label" aria-hidden="true">
                        A
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="v2-bottom-controls">
                <div className="v2-system-cluster">
                  <div className="v2-system-unit">
                    {button('SELECT', 'v2-system', 'Select')}
                    <span className="v2-system-label" aria-hidden="true">
                      SELECT
                    </span>
                  </div>
                  <div className="v2-system-unit">
                    {button('START', 'v2-system', 'Start')}
                    <span className="v2-system-label" aria-hidden="true">
                      START
                    </span>
                  </div>
                </div>
                <div className="v2-speaker" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>

              <div className="v2-shell-footer" aria-hidden="true">
                <span>REV 2.0-PREVIEW</span>
                <span>SERIAL // SB-001000</span>
              </div>
            </div>

            {mode === 'game' && (
              <div className="v2-game-touch" aria-label="Touch controls">
                <div className="v2-dpad">
                  {CYCLE_BUTTONS.map(({ name, label, className }) => button(name, className, label))}
                  <span className="v2-dpad-pivot" aria-hidden="true" />
                </div>
                <div className="v2-facepad">
                  {button('B', 'v2-b', 'B button')}
                  {button('A', 'v2-a', 'A button')}
                  {button('START', 'v2-system', 'Start')}
                </div>
              </div>
            )}

            {fullscreen&&slotStore&&!saveManagerOpen&&<Button className="v2-fullscreen-saves" size="sm" variant="secondary" isDisabled={saveBusy||!saved} onPress={showSaveManager}>Saves</Button>}
            {saveManagerOpen&&slotStore&&<PlayerSaveManager key={game.gameId+':'+game.revisionId} listing={saveListing} currentSlotId={saved?.session?.slotId??null}
              legacyAvailable={legacyAvailable} schema={capability?.schemaVersion??1} busy={saveBusy} notice={saveNotice}
              autoSupported={autoSupported} manualSupported={manualSupported} manualReady={status==='running'&&Boolean(saved?.session)}
              onAction={saveAction} onClose={closeSaveManager} managedDeviceId={sync?.deviceId} syncControls={<>{sync&&<ManagedSyncControls state={sync}/>}{pinnedSync&&<ManagedSyncControls state={pinnedSync}/>}</>}
              cloud={game.status==='published'&&supportsProgressSave(reviewedCapability)&&(!managedSyncAvailable||saveAccountId)?{
                identity:{gameId:game.gameId,hardwareId:DEVICE.id,hardwareVersion:DEVICE.version},expectedAccount:saveAccountId??undefined,withLock:withCloudLock,
                exportSnapshot:async(slotId,snapshotId)=>{await flushSaves();return slotStore.exportCloudSnapshot(slotId,snapshotId);},
                importSnapshot:async(raw,name,activate,signal)=>{
                  if(activate)await flushSaves();signal.throwIfAborted();
                  const target=await slotStore.importCloudCopy(raw,name);
                  setSaveListing(await slotStore.list());
                  if(activate){signal.throwIfAborted();const opened=await slotStore.open(target);
                    restartWith({value:opened.data,session:opened.session});savePaused.current=false;setSaveManagerOpen(false);
                    setSaveNotice('Cloud backup restored.');}
                },
              }:undefined}/>}
            {status !== 'running' && (
              <div className="v2-status" role="status">
                {status === 'error'
                  ? 'Game stopped'
                  : status === 'loading'
                  ? 'Loading cartridge…'
                  : 'Starting isolated runtime…'}
                {reason && <span>{reason}</span>}
              </div>
            )}
          </div>

          {slotStore&&<div className="v2-save-current" role="status">
            <strong>{saved?.session?autoSupported?'Autosave enabled':'Manual saves':legacyAvailable?'Original save':'Preparing save…'}</strong>
            {saveAccountId&&<span> · Account-local saves</span>}
            {saveNotice&&<span> · {saveNotice}</span>}
          </div>}
          <div className="v2-controlbar">
            <button
              type="button"
              className={mode === 'game' ? 'is-active' : ''}
              onClick={() => setMode(m => (m === 'game' ? 'console' : 'game'))}
            >
              {mode === 'game' ? '▣ Console view' : '▤ Game only'}
            </button>
            <button type="button" className={fullscreen ? 'is-active' : ''} onClick={fullscreenClick}>
              {fullscreen ? '↙ Exit fullscreen' : '⛶ Fullscreen'}
            </button>
            <button type="button" disabled={saveBusy||saveManagerOpen} onClick={()=>void restart()}>
              ↻ Restart
            </button>
          </div>

          <div className="v2-footnote" aria-label="Control mapping summary">
            <span>
              <kbd>WASD</kbd> / <kbd>Arrows</kbd> Move
            </span>
            <span>
              <kbd>Z</kbd> <kbd>J</kbd> <kbd>Space</kbd> = A
            </span>
            <span>
              <kbd>X</kbd> <kbd>K</kbd> = B
            </span>
            <span>
              <kbd>Enter</kbd> = Start
            </span>
            <span>
              <kbd>Bksp</kbd> = Select
            </span>
            <span>Gamepad ready</span>
          </div>
        </section>

        {!compact && settingsPanel}
      </div>

      <Drawer>
        <Drawer.Backdrop isOpen={libraryOpen} onOpenChange={setLibraryOpen} variant="blur">
          <Drawer.Content placement="left">
            <Drawer.Dialog className={`v2-quick-library-drawer sb-v2-dialog sb-heroui-live ${theme}`}
              data-v2-theme={theme} aria-label="Change game from your library">
              <Drawer.Header>
                <Drawer.Heading>Change cartridge</Drawer.Heading>
                <Drawer.CloseTrigger aria-label="Close quick game library">✕</Drawer.CloseTrigger>
              </Drawer.Header>
              <Drawer.Body>
                <p className="v2-quick-library-description">Select a cartridge to insert into this Slopboy. Your current game remains running until you choose another.</p>
                {quickError&&<p role="status">{quickError}</p>}
                <div className="v2-quick-cartridge-list" role="list">
                  {quickGames.map((item,index)=><div role="listitem" key={item.id}>
                    <Link href={'/play/'+item.id} scroll={false}
                      className={'v2-quick-cartridge'+(item.id===game.gameId?' is-current':'')}
                      aria-current={item.id===game.gameId?'page':undefined}
                      onClick={event=>{if(item.id===game.gameId)event.preventDefault();setLibraryOpen(false);}}>
                      <V2CartridgeArt id={item.id} title={item.title} emblem="◆" index={index} compact/>
                      <span className="v2-quick-cartridge-copy"><strong>{item.title}</strong>
                        <small>{item.genre} · Slopboy 1000</small>
                        <span>{item.id===game.gameId?'● Currently inserted':'↧ Insert cartridge'}</span></span>
                    </Link>
                  </div>)}
                </div>
                <Link className="v2-quick-library-all" href="/library">Browse your full library ↗</Link>
              </Drawer.Body>
              <Drawer.Footer>
                <Button className="sb-control" variant="secondary" onPress={()=>setLibraryOpen(false)}>Continue playing</Button>
              </Drawer.Footer>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
      {compact && <Drawer>
        <Drawer.Backdrop isOpen={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen} variant="blur">
          <Drawer.Content placement="right">
            <Drawer.Dialog className={`v2-mobile-drawer sb-v2-dialog sb-heroui-live ${theme}`} aria-label="Slopboy display and shell settings"
              data-v2-theme={theme}>
              <Drawer.Header>
                <Drawer.Heading>Device settings</Drawer.Heading>
                <Drawer.CloseTrigger aria-label="Close device settings">✕</Drawer.CloseTrigger>
              </Drawer.Header>
              <Drawer.Body>{settingsPanel}</Drawer.Body>
              <Drawer.Footer>
                <Button className="sb-control" variant="secondary" onPress={()=>setMobileSettingsOpen(false)}>Done</Button>
              </Drawer.Footer>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>}
      {cartridge && saved?.epoch === epoch && (
        <iframe
          key={epoch + ':' + game.gameId}
          ref={iframeRef}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          title="Isolated compatibility runtime"
          srcDoc={SANDBOX_DOCUMENT}
          className="v2-isolated-frame"
          tabIndex={-1}
        />
      )}
    </main>
  );
}
