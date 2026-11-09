'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { V2_DEVICE_1000, V2_LCD_PALETTES, type V2PaletteId } from '@slopboy/hardware/v2';
import { rasterizeFrame } from '@slopboy/runtime/protocol';
import { HostSession, type InputName } from '@slopboy/runtime/host-api';
import { KaplayEngineAdapter, type KaplayDiagnostics } from '@slopboy/runtime/kaplay-adapter';
import { browserSaveDriver } from '@slopboy/runtime/save-store';

// Exact immutable identifiers from the checked-in vetted example manifest.
// These are not public catalog entries and no untrusted source is accepted.
const GAME_ID = '39b1f7c2-9a4d-45e8-b8c1-6204d9c3a810';
const REVISION_ID = 'c8d9e0f1-2345-4678-9012-345678abcdef';
const KEYS: Record<string, InputName> = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  KeyW: 'UP', KeyS: 'DOWN', KeyA: 'LEFT', KeyD: 'RIGHT',
  Space: 'A', KeyZ: 'A', KeyX: 'B', Enter: 'START',
};
const CONTROLS: readonly InputName[] = ['UP', 'LEFT', 'RIGHT', 'DOWN', 'A', 'B', 'START', 'SELECT'];

export default function KaplayHostDemo() {
  const sandbox = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const session = useRef<HostSession | null>(null);
  const held = useRef(new Set<InputName>());
  const lastFrame = useRef<Uint8Array | null>(null);
  const paletteRef = useRef<V2PaletteId>('moss');
  const [palette, setPalette] = useState<V2PaletteId>('moss');
  const [state, setState] = useState('booting');
  const [error, setError] = useState('');
  const [frames, setFrames] = useState(0);
  const [diagnostics, setDiagnostics] = useState<KaplayDiagnostics | null>(null);

  const paint = useCallback((pixels: Uint8Array) => {
    const ctx = canvas.current?.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.putImageData(rasterizeFrame(pixels, V2_DEVICE_1000.display.width,
      V2_DEVICE_1000.display.height, V2_LCD_PALETTES[paletteRef.current].colors), 0, 0);
  }, []);

  useEffect(() => {
    paletteRef.current = palette;
    if (lastFrame.current) paint(lastFrame.current);
  }, [palette, paint]);

  useEffect(() => {
    const target = sandbox.current;
    if (!target) return;
    let live = true;
    const adapter = new KaplayEngineAdapter({
      container: target,
      sandboxUrl: '/v2/kaplay-gem-miner.html',
      onDiagnostics: metric => {
        if (!live) return;
        if (metric.framesDelivered % 5 === 0) {
          setFrames(metric.framesDelivered);
          setDiagnostics(metric);
        }
      },
    });
    const host = new HostSession({
      gameId: GAME_ID,
      revisionId: REVISION_ID,
      hardware: V2_DEVICE_1000,
      adapter,
      saveDriver: browserSaveDriver,
      onFrame: pixels => {
        lastFrame.current = new Uint8Array(pixels);
        paint(pixels);
      },
      onStateChange: next => { if (live) setState(next); },
      onError: e => { if (live) setError(e.message); },
    });
    session.current = host;
    void (async () => {
      try {
        await host.init();
        if (!live) return;
        await host.start();
      } catch (e) {
        if (live) setError(String(e));
      }
    })();
    return () => {
      live = false;
      held.current.clear();
      session.current = null;
      void host.dispose();
    };
  }, [paint]);

  const syncButtons = useCallback(() => session.current?.setButtons([...held.current]), []);
  const press = useCallback((key: InputName) => {
    held.current.add(key);
    syncButtons();
  }, [syncButtons]);
  const release = useCallback((key: InputName) => {
    held.current.delete(key);
    syncButtons();
  }, [syncButtons]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
          event.target instanceof HTMLElement && event.target.closest('input,textarea,select')) return;
      const key = KEYS[event.code];
      if (key) { event.preventDefault(); press(key); }
    };
    const up = (event: KeyboardEvent) => {
      const key = KEYS[event.code];
      if (key) { event.preventDefault(); release(key); }
    };
    const reset = () => {
      held.current.clear();
      syncButtons();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
    };
  }, [press, release, syncButtons]);

  const downPointer = (key: InputName) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    press(key);
  };
  const upPointer = (key: InputName) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    release(key);
  };
  const restart = () => {
    held.current.clear();
    void session.current?.restart();
  };
  const togglePause = () => {
    const host = session.current;
    if (host?.state === 'running') host.pause();
    else if (host?.state === 'paused') host.resume();
  };

  return <main className="kaplay-host-lab" style={{ padding: 24, maxWidth: 860, margin: 'auto' }}>
    <h1>Gem Miner — Engine Host Integration Lab</h1>
    <p>Vetted local KAPLAY cartridge through HostSession, an isolated iframe, and UUID-based guest saves. Experimental; not public game publishing.</p>
    <div className="kaplay-host-stage" style={{ position: 'relative', width: 320, height: 288, marginBottom: 12 }}>
      <canvas ref={canvas} width={160} height={144} role="img" aria-label="Gem Miner indexed-color display"
        style={{ width: 320, height: 288, imageRendering: 'pixelated', position: 'relative', zIndex: 1 }} />
      <div ref={sandbox} style={{ position: 'absolute', left: 0, top: 0, zIndex: 2, pointerEvents: 'none' }} />
    </div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 340 }}>
      {CONTROLS.map(key => <button key={key} type="button" aria-label={key + ' button'}
        onPointerDown={downPointer(key)} onPointerUp={upPointer(key)}
        onPointerCancel={upPointer(key)} onLostPointerCapture={upPointer(key)}
        style={{ padding: 12, minWidth: 55 }}>{key}</button>)}
    </div>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
      <button type="button" onClick={togglePause}>Pause / Resume</button>
      <button type="button" onClick={restart}>Restart</button>
      <label>LCD palette:
        <select value={palette} onChange={e => setPalette(e.target.value as V2PaletteId)}>
          {Object.entries(V2_LCD_PALETTES).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
        </select>
      </label>
    </div>
    <dl>
      <dt>Host</dt><dd data-testid="kaplay-host-state">{state}</dd>
      <dt>Frames</dt><dd data-testid="kaplay-host-frames">{frames}</dd>
      <dt>Opaque origin</dt><dd>{String(diagnostics?.opaque ?? false)}</dd>
      <dt>WebGL</dt><dd>{String(diagnostics?.webgl ?? false)}</dd>
      <dt>Average capture</dt><dd>{diagnostics?.averageCaptureMs.toFixed(2) ?? '—'} ms</dd>
    </dl>
    {error && <p role="alert">{error}</p>}
  </main>;
}
