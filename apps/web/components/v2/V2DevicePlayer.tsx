'use client';

import {useCallback,useEffect,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from 'react';
import Link from 'next/link';
import {getCatalogGame} from '@slopboy/catalog';
import {SLOPBOY_1000,type InputName} from '@slopboy/hardware';
import {V2_DEVICE_1000,V2_LCD_PALETTES,V2_SHELLS,type V2PaletteId,type V2ShellId} from '@slopboy/hardware/v2';
import {loadBundledCartridge,type BrowserCartridge} from '@slopboy/runtime/cartridge-browser';
import {SANDBOX_DOCUMENT} from '@slopboy/runtime/sandbox-document';
import {rasterizeFrame,validateFrame} from '@slopboy/runtime/protocol';
import {browserSaveDriver,createSaveService,validSave} from '@slopboy/runtime/save-store';
import './v2-player.css';

const DEVICE=SLOPBOY_1000; // Explicit v1 compatibility adapter; not a new KAPLAY sandbox.
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

export default function V2DevicePlayer({gameId}:{gameId:string}){
  const game=getCatalogGame(gameId);
  if(!game)throw Error('Unknown curated game '+gameId);
  const [cartridge,setCartridge]=useState<BrowserCartridge|null>(null);
  const [saved,setSaved]=useState<{epoch:number;value:string|null}|null>(null);
  const [epoch,setEpoch]=useState(0);
  const [status,setStatus]=useState<Status>('loading');
  const [reason,setReason]=useState('');
  const [shell,setShell]=useState<V2ShellId>('bone');
  const [palette,setPalette]=useState<V2PaletteId>('moss');
  const [scanlines,setScanlines]=useState(false);
  const [mode,setMode]=useState<'console'|'game'>('console');
  const [fullscreen,setFullscreen]=useState(false);
  const [keyHeld,setKeyHeld]=useState<ReadonlyArray<InputName>>([]);
  const shellRef=useRef<HTMLDivElement>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
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

  const updateStatus=useCallback((state:Status,message='')=>{
    statusRef.current=state;setStatus(state);setReason(message);
  },[]);
  const post=useCallback((type:string,extra:Record<string,unknown>={})=>{
    iframeRef.current?.contentWindow?.postMessage({scope:'slopboy-v1',type,key:sessionKey.current,...extra},'*');
  },[]);
  const draw=useCallback((pixels:Uint8Array,paletteColors:readonly string[])=>{
    const ctx=canvasRef.current?.getContext('2d',{alpha:false});
    if(!ctx)return;
    ctx.imageSmoothingEnabled=false;
    ctx.putImageData(rasterizeFrame(pixels,DEVICE.display.width,DEVICE.display.height,paletteColors),0,0);
  },[]);
  useEffect(()=>{
    currentPalette.current=V2_LCD_PALETTES[palette].colors;
    if(lastImage.current)draw(lastImage.current,currentPalette.current);
  },[palette,draw]);
  useEffect(()=>{
    let active=true;
    loadBundledCartridge(game.cartridge,DEVICE).then(loaded=>{
      if(loaded.manifest.id!==game.id)throw Error('Cartridge ID mismatch');
      if(active){setCartridge(loaded);updateStatus('booting');}
    }).catch(err=>{if(active)updateStatus('error',String(err));});
    return()=>{active=false;};
  },[game,updateStatus]);
  useEffect(()=>{
    if(!cartridge)return;
    let active=true;
    setSaved(null);
    const store=createSaveService(browserSaveDriver,DEVICE,game.id);
    writeChain.current.then(()=>store.read()).catch(()=>null).then(value=>{
      if(active)setSaved({epoch,value});
    });
    return()=>{active=false;};
  },[cartridge,epoch,game.id]);

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
        post('load',{code:cartridge.code,width:DEVICE.display.width,height:DEVICE.display.height,shades:DEVICE.display.indexedColors,save:saved.value});
        return;
      }
      if(msg.key!==sessionKey.current)return;
      if(msg.type==='ready'){ready.current=true;updateStatus('running');return;}
      if(msg.type==='error'){ready.current=false;updateStatus('error',String(msg.reason||'Game stopped').slice(0,120));return;}
      if(msg.type==='frame'&&ready.current){
        const pixels:unknown=msg.pixels;
        if(!validateFrame(pixels,DEVICE.display.width,DEVICE.display.height,DEVICE.display.indexedColors)){
          ready.current=false;post('stop');updateStatus('error','Invalid isolated game frame');return;
        }
        lastImage.current=Uint8Array.from(pixels);
        draw(pixels,currentPalette.current);
      }
      if(msg.type==='save'&&ready.current){
        if(!validSave(msg.value,DEVICE)){ready.current=false;post('stop');updateStatus('error','Invalid save request');return;}
        const now=Date.now();
        if(now-lastSave.current<250)return;
        lastSave.current=now;
        const value=msg.value as string|null;
        const store=createSaveService(browserSaveDriver,DEVICE,game.id);
        writeChain.current=writeChain.current.catch(()=>{}).then(()=>store.write(value)).catch(err=>console.warn('V2 local save error',err));
      }
    };
    window.addEventListener('message',onMessage);
    let animation=0;
    const tick=(now:number)=>{
      animation=requestAnimationFrame(tick);
      if(!ready.current||statusRef.current!=='running'||now-lastTick.current<1000/V2_DEVICE_1000.display.targetFramesPerSecond)return;
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
      window.removeEventListener('message',onMessage);
      ready.current=false;
      post('stop');
    };
  },[cartridge,saved,epoch,post,draw,updateStatus,game.id]);

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
      if(event.altKey||event.ctrlKey||event.metaKey||isTextTarget(event.target))return;
      const name=KEY_MAP[event.code];
      if(!name)return;
      event.preventDefault();press(name);
    };
    const up=(event:KeyboardEvent)=>{
      const name=KEY_MAP[event.code];
      if(!name)return;
      event.preventDefault();release(name);
    };
    const blur=()=>{physical.current.clear();pointerButtons.current.clear();pressed.current.clear();syncKeys();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[press,release,syncKeys]);
  useEffect(()=>{
    const onChange=()=>setFullscreen(document.fullscreenElement===shellRef.current);
    document.addEventListener('fullscreenchange',onChange);
    return()=>document.removeEventListener('fullscreenchange',onChange);
  },[]);

  const pointerDown=(name:InputName)=>(event:ReactPointerEvent<HTMLButtonElement>)=>{
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
  const restart=()=>{
    post('stop');ready.current=false;physical.current.clear();pointerButtons.current.clear();pressed.current.clear();
    syncKeys();updateStatus('booting');setEpoch(n=>n+1);
  };
  const fullscreenClick=async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    }catch{ /* Optional fullscreen denial must never interrupt gameplay. */ }
  };
  const colors=V2_SHELLS[shell];
  const shellStyle={'--v2-shell':colors.base,'--v2-shadow':colors.shadow,'--v2-ink':colors.ink,'--v2-face':colors.button} as CSSProperties;
  return <main className="v2-player">
    <header className="v2-header"><Link className="v2-brand" href="/v2">SLOPBOY <span>2.0</span></Link>
      <div className="v2-header-right"><Link href="/v2">← Devices & games</Link><span>LIVE COMPATIBILITY LAB</span></div>
    </header>
    <div className="v2-player-grid">
      <section className="v2-device-section" aria-label="Interactive virtual handheld">
        <div className="v2-topline"><span>MODEL / 001</span><span>PLAYING · {game.title.toUpperCase()}</span></div>
        <div className={'v2-device-stage'+(mode==='game'?' v2-game-mode':'')} ref={shellRef} style={shellStyle}>
          <div className="v2-hardware-body">
            <div className="v2-shell-logo"><strong>SLOPBOY <em>1000</em></strong><span className={'v2-led'+(status==='running'?' on':'')}/></div>
            <div className="v2-screen-bezel">
              <div className={'v2-display'+(scanlines?' scanlines':'')}>
                <canvas width={V2_DEVICE_1000.display.width} height={V2_DEVICE_1000.display.height}
                  ref={canvasRef} role="img" aria-label={game.title+' game screen'}/>
              </div>
              <div className="v2-screen-note">PIXEL POCKET · FOUR SHADES</div>
            </div>
            <div className="v2-controls">
              <div className="v2-dpad">{CYCLE_BUTTONS.map(({name,label,className})=>button(name,className,label))}</div>
              <div className="v2-facepad">{button('B','v2-b','B button')}{button('A','v2-a','A button')}</div>
            </div>
            <div className="v2-bottom-controls">
              <div>{button('SELECT','v2-system','Select')}{button('START','v2-system','Start')}</div>
              <div className="v2-speaker" aria-hidden="true"><i/><i/><i/><i/><i/></div>
            </div>
          </div>
          {mode==='game'&&<div className="v2-game-touch" aria-label="Touch controls">
            <div className="v2-dpad">{CYCLE_BUTTONS.map(({name,label,className})=>button(name,className,label))}</div>
            <div className="v2-facepad">{button('B','v2-b','B button')}{button('A','v2-a','A button')}{button('START','v2-system','Start')}</div>
          </div>}
          {status!=='running'&&<div className="v2-status" role="status">{status==='error'?'Game stopped':status==='loading'?'Loading cartridge…':'Starting isolated runtime…'}{reason&&<span>{reason}</span>}</div>}
        </div>
        <div className="v2-controlbar">
          <button type="button" onClick={()=>setMode(m=>m==='game'?'console':'game')}>{mode==='game'?'▣ Console':'▤ Game only'}</button>
          <button type="button" onClick={fullscreenClick}>{fullscreen?'↙ Exit fullscreen':'⛶ Fullscreen'}</button>
          <button type="button" onClick={restart}>↻ Restart</button>
        </div>
        <div className="v2-footnote">Arrow keys / WASD · Z/J/Space = A · X/K = B · Enter = Start · Gamepad supported</div>
      </section>
      <aside className="v2-side">
        <span className="v2-kicker">THE CONSOLE WORKSHOP / FIRST PLAYABLE SLICE</span>
        <h1>Little worlds.<br/><em>Your colors.</em></h1>
        <p>Meet the first V2 device: an original rectangular slab, tactile controls and changeable appearance. The game is real—the cosmetics only change how you see it.</p>
        <div className="v2-option"><h2>Shell finish <small>Cosmetic only</small></h2>
          <div className="v2-swatches">{(Object.keys(V2_SHELLS) as V2ShellId[]).map(id=><button type="button" key={id}
            className={'v2-swatch'+(shell===id?' selected':'')} style={{background:V2_SHELLS[id].base}}
            title={V2_SHELLS[id].name} aria-label={'Shell: '+V2_SHELLS[id].name} aria-pressed={shell===id}
            onClick={()=>setShell(id)}><span/></button>)}</div>
          <strong>{V2_SHELLS[shell].name}</strong>
        </div>
        <div className="v2-option"><h2>LCD tint <small>Same 4 logical shades</small></h2>
          <div className="v2-palettes">{(Object.keys(V2_LCD_PALETTES) as V2PaletteId[]).map(id=><button
            key={id} type="button" className={palette===id?'chosen':''} onClick={()=>setPalette(id)}
            aria-pressed={palette===id}><span className="v2-palette-bars">{V2_LCD_PALETTES[id].colors.map(c=><i key={c} style={{background:c}}/>)}</span>{V2_LCD_PALETTES[id].name}</button>)}</div>
        </div>
        <div className="v2-option v2-toggle"><div><h2>LCD scanlines</h2><p>Visual overlay only · never game logic</p></div>
          <button type="button" role="switch" aria-checked={scanlines} aria-label="LCD scanlines"
            className={scanlines?'enabled':''} onClick={()=>setScanlines(v=>!v)}><i/></button></div>
        <div className="v2-specs"><div><span>LOGICAL DISPLAY</span><strong>160 × 144</strong></div>
          <div><span>SCREEN SHADES</span><strong>4 indexed</strong></div>
          <div><span>ENGINE</span><strong>Pixel v1 compatibility</strong></div>
          <div><span>SAVE</span><strong>Local · 8 KiB</strong></div></div>
        <p className="v2-security">Runs an approved first-party cartridge in the existing isolated iframe + Worker. KAPLAY, accounts, and friend sharing are not enabled in this slice.</p>
      </aside>
    </div>
    {cartridge&&saved?.epoch===epoch&&<iframe key={epoch} ref={iframeRef} sandbox="allow-scripts"
      referrerPolicy="no-referrer" title="Isolated compatibility runtime" srcDoc={SANDBOX_DOCUMENT}
      className="v2-isolated-frame" tabIndex={-1}/>}
  </main>;
}
