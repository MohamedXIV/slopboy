'use client';

import {useCallback,useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {InputName} from '@slopboy/hardware';
import {SLOPBOY_1000} from '@slopboy/hardware';
import {loadBundledCartridge,type BrowserCartridge} from '@slopboy/runtime/cartridge-browser';
import {SANDBOX_DOCUMENT} from '@slopboy/runtime/sandbox-document';
import {LCD_PALETTE,rasterizeFrame,validateFrame} from '@slopboy/runtime/protocol';
import './player.css';

const DEVICE=SLOPBOY_1000;
type Mode='console'|'game';
type Status='loading'|'booting'|'running'|'error';
const keyMap:Record<string,InputName>={
  ArrowUp:'UP',ArrowDown:'DOWN',ArrowLeft:'LEFT',ArrowRight:'RIGHT',
  KeyW:'UP',KeyS:'DOWN',KeyA:'LEFT',KeyD:'RIGHT',KeyJ:'A',KeyZ:'A',
  Space:'A',KeyK:'B',KeyX:'B',ShiftLeft:'B',Enter:'START',Backspace:'SELECT'
};

export default function HandheldPlayer(){
  const [cartridge,setCartridge]=useState<BrowserCartridge|null>(null);
  const [mode,setMode]=useState<Mode>('console');
  const [status,setStatus]=useState<Status>('loading');
  const [reason,setReason]=useState('');
  const [fullscreen,setFullscreen]=useState(false);
  const [session,setSession]=useState(0);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const iframeRef=useRef<HTMLIFrameElement>(null);
  const wrapperRef=useRef<HTMLDivElement>(null);
  const held=useRef(new Set<InputName>());
  const pressed=useRef(new Set<InputName>());
  const pointerButtons=useRef(new Map<number,InputName>());
  const sessionKey=useRef('');
  const ready=useRef(false);
  const stateRef=useRef<Status>('loading');
  const lastTick=useRef(0);

  const updateStatus=useCallback((next:Status,message='')=>{
    stateRef.current=next;setStatus(next);setReason(message);
  },[]);
  const press=useCallback((button:InputName)=>{
    if(!held.current.has(button))pressed.current.add(button);
    held.current.add(button);
  },[]);
  const release=useCallback((button:InputName)=>{held.current.delete(button);},[]);
  const post=useCallback((type:string,fields:Record<string,unknown>={})=>{
    iframeRef.current?.contentWindow?.postMessage({scope:'slopboy-v1',type,key:sessionKey.current,...fields},'*');
  },[]);

  useEffect(()=>{
    let active=true;
    loadBundledCartridge('/cartridges/tiny-catcher.slop',DEVICE).then(game=>{
      if(active){setCartridge(game);updateStatus('booting');}
    }).catch(error=>{if(active)updateStatus('error',String(error));});
    return ()=>{active=false;};
  },[updateStatus]);

  useEffect(()=>{
    if(!cartridge)return;
    sessionKey.current=crypto.randomUUID();
    ready.current=false;
    lastTick.current=0;
    const receive=(event:MessageEvent)=>{
      if(event.source!==iframeRef.current?.contentWindow || event.origin!=='null')return;
      const data=event.data;
      if(!data || data.scope!=='slopboy-v1')return;
      if(data.type==='boot'){
        post('load',{code:cartridge.code,width:DEVICE.display.width,height:DEVICE.display.height,shades:DEVICE.display.indexedColors});
        return;
      }
      if(data.key!==sessionKey.current)return;
      if(data.type==='ready'){ready.current=true;updateStatus('running');return;}
      if(data.type==='error'){ready.current=false;updateStatus('error',String(data.reason||'Game failed').slice(0,120));return;}
      if(data.type==='frame' && ready.current){
        const pixels:unknown=data.pixels;
        if(!validateFrame(pixels,DEVICE.display.width,DEVICE.display.height,DEVICE.display.indexedColors)){
          ready.current=false;post('stop');updateStatus('error','Invalid sandbox frame');return;
        }
        const ctx=canvasRef.current?.getContext('2d',{alpha:false});
        if(ctx){ctx.imageSmoothingEnabled=false;ctx.putImageData(rasterizeFrame(pixels,DEVICE.display.width,DEVICE.display.height,LCD_PALETTE),0,0);}
      }
    };
    window.addEventListener('message',receive);
    let animation=0;
    const run=(now:number)=>{
      animation=requestAnimationFrame(run);
      if(!ready.current||stateRef.current!=='running'||now-lastTick.current<1000/60)return;
      const dt=lastTick.current?Math.min((now-lastTick.current)/1000,0.05):1/60;
      lastTick.current=now;
      post('tick',{dt,down:[...held.current],pressed:[...pressed.current]});
      pressed.current.clear();
    };
    animation=requestAnimationFrame(run);
    return ()=>{cancelAnimationFrame(animation);window.removeEventListener('message',receive);ready.current=false;post('stop');};
  },[cartridge,session,post,updateStatus]);

  useEffect(()=>{
    const down=(event:KeyboardEvent)=>{
      if(event.altKey||event.ctrlKey||event.metaKey||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
      const button=keyMap[event.code];if(!button)return;
      event.preventDefault();press(button);
    };
    const up=(event:KeyboardEvent)=>{
      const button=keyMap[event.code];if(!button)return;event.preventDefault();release(button);
    };
    const blur=()=>{held.current.clear();pressed.current.clear();pointerButtons.current.clear();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return ()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[press,release]);

  useEffect(()=>{
    const onFullscreen=()=>setFullscreen(document.fullscreenElement===wrapperRef.current);
    document.addEventListener('fullscreenchange',onFullscreen);
    return ()=>document.removeEventListener('fullscreenchange',onFullscreen);
  },[]);

  const onPointerDown=(name:InputName)=>(event:ReactPointerEvent<HTMLButtonElement>)=>{
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    pointerButtons.current.set(event.pointerId,name);press(name);
  };
  const onPointerUp=(event:ReactPointerEvent<HTMLButtonElement>)=>{
    const name=pointerButtons.current.get(event.pointerId);
    if(!name)return;
    pointerButtons.current.delete(event.pointerId);
    if(![...pointerButtons.current.values()].includes(name))release(name);
  };
  const button=(name:InputName,style:string,label:string)=><button key={name} type="button" className={'hardware-button '+style} aria-label={label}
    onPointerDown={onPointerDown(name)} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onLostPointerCapture={onPointerUp}>{name}</button>;
  const switchFullscreen=async()=>{
    if(!document.fullscreenElement) await wrapperRef.current?.requestFullscreen().catch(()=>{});
    else await document.exitFullscreen().catch(()=>{});
  };
  const restart=()=>{
    post('stop');ready.current=false;held.current.clear();pressed.current.clear();lastTick.current=0;
    updateStatus('booting');setSession(v=>v+1);
  };

  return <section className="player-root" ref={wrapperRef}>
    <div className="player-toolbar">
      <div><p className="player-kicker">NOW INSERTED · SLOPBOY 1000</p><h1>TINY CATCHER</h1></div>
      <div className="player-actions">
        <button type="button" onClick={()=>setMode(v=>v==='console'?'game':'console')}>{mode==='console'?'◱ Game mode':'▣ Console mode'}</button>
        <button type="button" onClick={switchFullscreen}>{fullscreen?'⤓ Exit fullscreen':'⛶ Fullscreen'}</button>
        <button type="button" onClick={restart}>↻ Restart</button>
      </div>
    </div>
    <div className={'player-stage mode-'+mode}>
      <div className="handheld-shell">
        <div className="shell-header"><span>SLOPBOY <b>1000</b></span><span className="power-light" aria-label={status==='running'?'Power on':'Power off'} /></div>
        <div className="screen-bezel"><div className="screen-border"><canvas width={DEVICE.display.width} height={DEVICE.display.height} ref={canvasRef} aria-label="Tiny Catcher game display" role="img" /></div><span className="screen-inscription">MONOCHROME / 4 SHADES</span></div>
        <div className="device-buttons"><div className="direction-pad">
          {button('UP','up','Move up')}{button('LEFT','left','Move left')}{button('RIGHT','right','Move right')}{button('DOWN','down','Move down')}
        </div><div className="face-buttons">{button('B','face-b','B button')}{button('A','face-a','A button')}</div></div>
        <div className="device-system-buttons">{button('SELECT','system','Select')}{button('START','system','Start')}<div className="speaker" aria-hidden="true">▰ ▰ ▰ ▰</div></div>
      </div>
      {mode==='game'&&<div className="game-touch-controls" aria-label="Game touch controls">
        <div className="game-touch-direction">{button('LEFT','touch','Left')}{button('RIGHT','touch','Right')}</div>
        <div>{button('B','touch','B')}{button('A','touch','A')}</div>
      </div>}
      {status!=='running'&&<div className="player-status" role="status"><strong>{status==='error'?'Game stopped':status==='loading'?'Loading cartridge…':'Starting sandbox…'}</strong>{reason&&<p>{reason}</p>}</div>}
    </div>
    <div className="player-help"><span><strong>Controls:</strong> ← → or A / D to move; Z / J = A, X / K = B</span><span><strong>Sandbox:</strong> opaque origin · no platform credentials · network blocked</span></div>
    {cartridge&&<iframe key={session} ref={iframeRef} sandbox="allow-scripts" referrerPolicy="no-referrer" title="Isolated game worker sandbox" srcDoc={SANDBOX_DOCUMENT} className="isolated-game-frame" tabIndex={-1} />}
  </section>;
}
