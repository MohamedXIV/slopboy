'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Button,Card} from '@heroui/react';
import {V2_DEVICE_1000,V2_LCD_PALETTES,type V2Button} from '@slopboy/hardware/v2';
import {SANDBOX_DOCUMENT} from '@slopboy/runtime/sandbox-document';
import {PROCEDURAL_DEMO} from '@/lib/ai/procedural-demo';

const {width,height,indexedColors} = V2_DEVICE_1000.display;
const responseTimeoutMs = 2500;
const controls: Record<string,V2Button> = {ArrowUp:'UP',ArrowDown:'DOWN',ArrowLeft:'LEFT',ArrowRight:'RIGHT'};
const colors = V2_LCD_PALETTES.moss.colors.map(color => [
  Number.parseInt(color.slice(1,3),16),Number.parseInt(color.slice(3,5),16),Number.parseInt(color.slice(5,7),16),
]);

export default function ProceduralDemo({saveKey = 'slopboy-procedural-lab-v1'}:{saveKey?:string}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const session = useRef<{key:string; phase:'boot'|'starting'|'running'; deadline:number|null; saveDeadline:number|null; stopRequested:boolean; pressed:Set<V2Button>}|null>(null);
  const audio = useRef<AudioContext|null>(null);
  const oscillator = useRef<OscillatorNode|null>(null);
  const muted = useRef(false);
  const [isMuted,setMuted] = useState(false);
  const [running,setRunning] = useState(false);
  const [status,setStatus] = useState('Stopped');
  const [saving,setSaving] = useState(false);
  const [saved,setSaved] = useState(false);

  const stopTone = useCallback(() => {
    if (!oscillator.current) return;
    oscillator.current.stop();
    oscillator.current.disconnect();
    oscillator.current = null;
  },[]);

  const closeAudio = useCallback(() => {
    stopTone();
    const context = audio.current;
    audio.current = null;
    if (context) void context.close().catch(()=>{});
  },[stopTone]);

  const stop = useCallback((reason = 'Stopped') => {
    const current = session.current;
    if (!current) return;
    frame.current?.contentWindow?.postMessage({scope:'slopboy-v1',key:current.key,type:'stop'},'*');
    session.current = null;
    closeAudio();
    setRunning(false);
    setSaving(false);
    setStatus(reason);
    canvas.current?.getContext('2d')?.clearRect(0,0,width,height);
  },[closeAudio]);

  function start() {
    if (session.current) return;
    try {
      const context = new AudioContext();
      audio.current = context;
      void context.resume().catch(()=>{});
    } catch { /* The game also works without audio support. */ }
    session.current = {key:crypto.randomUUID(),phase:'boot',deadline:performance.now()+responseTimeoutMs,saveDeadline:null,stopRequested:false,pressed:new Set()};
    setSaved(false);
    setStatus('Starting');
    setRunning(true);
  }

  function savePosition() {
    const current = session.current;
    if (current?.phase !== 'running' || current.saveDeadline !== null) return;
    current.saveDeadline = performance.now() + responseTimeoutMs;
    current.pressed.add('A');
    setSaved(false);
    setSaving(true);
  }

  function requestStop() {
    const current = session.current;
    if (current && current.saveDeadline !== null) {
      current.stopRequested = true;
      return;
    }
    stop();
  }

  function toggleMute() {
    muted.current = !muted.current;
    setMuted(muted.current);
    if (muted.current) stopTone();
    else void audio.current?.resume().catch(()=>{});
  }

  useEffect(() => {
    const onMessage = (event:MessageEvent) => {
      const current = session.current;
      const target = frame.current?.contentWindow;
      const data = event.data;
      if (!current || !target || event.source !== target || event.origin !== 'null' ||
          data?.scope !== 'slopboy-v1') return;
      if (data.type === 'boot' && current.phase === 'boot') {
        let save = null;
        try { save = localStorage.getItem(saveKey); } catch {}
        current.phase = 'starting';
        target.postMessage({scope:'slopboy-v1',key:current.key,type:'load',code:PROCEDURAL_DEMO,
          width,height,shades:indexedColors,save,audio:true},'*');
        return;
      }
      if (data.key !== current.key) return;
      if (data.type === 'ready' && current.phase === 'starting') {
        current.phase = 'running';
        current.deadline = null;
        setStatus('Running');
        return;
      }
      if (data.type === 'error') {
        stop('Sandbox stopped');
        return;
      }
      if (current.phase !== 'running') return;
      if (data.type === 'save' && typeof data.value === 'string' && data.value.length <= 32) {
        if (current.saveDeadline === null) return;
        current.saveDeadline = null;
        setSaving(false);
        let stored = false;
        try { localStorage.setItem(saveKey,data.value); stored = true; } catch {}
        setSaved(stored);
        if (current.stopRequested) stop(stored ? 'Stopped' : 'Stopped · Save failed');
        else setStatus(stored ? 'Running' : 'Running · Save failed');
        return;
      }
      if (data.type !== 'frame' || current.deadline === null ||
          !(data.pixels instanceof Uint8Array) || data.pixels.length !== width*height) return;
      current.deadline = null;
      const context = canvas.current?.getContext('2d');
      if (context) {
        const image = context.createImageData(width,height);
        for (let index=0; index<data.pixels.length; index++) {
          const rgb = colors[data.pixels[index]];
          if (!rgb) return;
          const offset = index * 4;
          image.data[offset] = rgb[0];
          image.data[offset + 1] = rgb[1];
          image.data[offset + 2] = rgb[2];
          image.data[offset + 3] = 255;
        }
        context.putImageData(image,0,0);
      }
      const tone = data.tone;
      const sound = audio.current;
      if (muted.current || !sound || sound.state !== 'running' || !Number.isInteger(tone) || tone < 36 || tone > 84) return;
      stopTone();
      const source = sound.createOscillator();
      const gain = sound.createGain();
      source.type = 'triangle';
      source.frequency.value = 440 * 2 ** ((tone - 69) / 12);
      gain.gain.setValueAtTime(0.13,sound.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,sound.currentTime+0.16);
      source.connect(gain).connect(sound.destination);
      oscillator.current = source;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (oscillator.current === source) oscillator.current = null;
      };
      source.start();
      source.stop(sound.currentTime+0.16);
    };

    const onKey = (event:KeyboardEvent) => {
      const action = controls[event.key];
      if (!action || event.repeat || !session.current) return;
      event.preventDefault();
      session.current.pressed.add(action);
    };
    window.addEventListener('message',onMessage);
    window.addEventListener('keydown',onKey);
    const ticker = window.setInterval(() => {
      const current = session.current;
      if (!current) return;
      const now = performance.now();
      if (current.saveDeadline !== null && now >= current.saveDeadline) {
        current.saveDeadline = null;
        setSaving(false);
        if (current.stopRequested) {
          stop('Stopped · Save timed out');
          return;
        }
        setStatus('Running · Save timed out');
      }
      if (current.deadline !== null && now >= current.deadline) {
        stop('Sandbox timed out');
        return;
      }
      if (current.phase !== 'running' || current.deadline !== null || !frame.current?.contentWindow) return;
      current.deadline = performance.now()+responseTimeoutMs;
      frame.current.contentWindow.postMessage({scope:'slopboy-v1',key:current.key,type:'tick',
        dt:1/30,down:[],pressed:[...current.pressed]},'*');
      current.pressed.clear();
    },1000/30);
    return () => {
      window.clearInterval(ticker);
      window.removeEventListener('message',onMessage);
      window.removeEventListener('keydown',onKey);
      session.current = null;
      closeAudio();
    };
  },[closeAudio,saveKey,stop,stopTone]);

  return <Card variant="secondary"><Card.Content className="space-y-4">
    <canvas ref={canvas} width={width} height={height} aria-label="Procedural game display"
      className="mx-auto w-full max-w-xs rounded bg-black [image-rendering:pixelated]"/>
    <div className="flex flex-wrap gap-2">
      <Button onPress={running ? requestStop : start}>{running ? 'Stop demo' : 'Start demo'}</Button>
      <Button variant="secondary" onPress={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</Button>
      <Button variant="secondary" isDisabled={!running || status === 'Starting' || saving} onPress={savePosition}>Save position</Button>
    </div>
    <div className="flex flex-wrap gap-2">
      {Object.entries(controls).map(([label,action]) => <Button key={action} variant="secondary" isDisabled={!running}
        onPress={() => session.current?.pressed.add(action)}>{label.slice(5)}</Button>)}
    </div>
    <p role="status">{status}{saving ? ' · Saving position' : ''}{saved ? ' · Position saved' : ''}</p>
    {running && <iframe ref={frame} hidden title="Procedural game sandbox" sandbox="allow-scripts"
      referrerPolicy="no-referrer" srcDoc={SANDBOX_DOCUMENT}/>}
  </Card.Content></Card>;
}
