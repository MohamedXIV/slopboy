'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { V2_DEVICE_1000, V2_LCD_PALETTES, type V2PaletteId } from '@slopboy/hardware/v2';
import { rasterizeFrame } from '@slopboy/runtime/protocol';
import { HostSession, type InputName } from '@slopboy/runtime/host-api';
import { KaplayEngineAdapter, type KaplayDiagnostics } from '@slopboy/runtime/kaplay-adapter';
import { browserSaveDriver } from '@slopboy/runtime/save-store';
import './kaplay-host.css';

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
  const [presentFps, setPresentFps] = useState(0);
  const fpsWindow = useRef({ time: 0, frames: 0 });
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
          const now = performance.now();
          const previous = fpsWindow.current;
          if (previous.time === 0) fpsWindow.current = { time: now, frames: metric.framesDelivered };
          else if (now - previous.time >= 1000) {
            setPresentFps(Math.round((metric.framesDelivered - previous.frames) * 1000 / (now - previous.time)));
            fpsWindow.current = { time: now, frames: metric.framesDelivered };
          }
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

  return <main className="kaplay-host-lab">
    <header className="kaplay-host-header">
      <span className="kaplay-host-eyebrow">SLOPBOY ENGINE LAB · KAPLAY 3001.0.19</span>
      <h1>Gem Miner</h1>
      <p>HostSession + isolated KAPLAY renderer. This is a vetted local cartridge test, not public game publishing.</p>
    </header>

    <section className="kaplay-host-screens" aria-label="Presentation and renderer comparison">
      <div className="kaplay-host-stage">
        <span className="kaplay-host-screen-label">DEVICE DISPLAY <small>160 × 144 · 4 indexed shades</small></span>
        <div className="kaplay-host-display">
          <canvas ref={canvas} width={160} height={144} role="img" aria-label="Gem Miner indexed-color display" />
        </div>
        <p className="kaplay-host-help">This is the only player-facing image. Pixel-perfect output without a ghost overlay.</p>
      </div>
      <aside className="kaplay-host-raw">
        <span className="kaplay-host-screen-label">RAW WEBGL <small>Live diagnostic · separate viewport</small></span>
        <div ref={sandbox} className="kaplay-host-sandbox" aria-label="Live raw engine renderer, diagnostic only" />
        <p className="kaplay-host-help">The source stays visibly composited to avoid Chromium throttling. It never overlays the LCD.</p>
      </aside>
    </section>

    <section className="kaplay-host-panel" aria-label="Game controls">
      <h2>Controls <small>Keyboard: WASD / arrows · A: Space/Z</small></h2>
      <div className="kaplay-host-controls">
        {CONTROLS.map(key => <button key={key} type="button" aria-label={key + ' button'}
          onPointerDown={downPointer(key)} onPointerUp={upPointer(key)}
          onPointerCancel={upPointer(key)} onLostPointerCapture={upPointer(key)}
          className="kaplay-host-key">{key}</button>)}
      </div>
      <div className="kaplay-host-toolbar">
        <button type="button" onClick={togglePause} className="kaplay-host-action">Pause / Resume</button>
        <button type="button" onClick={restart} className="kaplay-host-action">Restart</button>
        <label className="kaplay-host-palette">LCD palette
          <select value={palette} onChange={e => setPalette(e.target.value as V2PaletteId)}>
            {Object.entries(V2_LCD_PALETTES).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
          </select>
        </label>
      </div>
    </section>

    <section className="kaplay-host-panel" aria-label="Runtime metrics">
      <h2>Runtime diagnostics</h2>
      <dl className="kaplay-host-metrics">
        <div><dt>Host</dt><dd data-testid="kaplay-host-state">{state}</dd></div>
        <div><dt>Frames received</dt><dd data-testid="kaplay-host-frames">{frames}</dd></div>
        <div><dt>Presentation FPS</dt><dd data-testid="kaplay-host-fps">{presentFps || '—'}</dd></div>
        <div><dt>Opaque origin</dt><dd>{String(diagnostics?.opaque ?? false)}</dd></div>
        <div><dt>WebGL</dt><dd>{String(diagnostics?.webgl ?? false)}</dd></div>
        <div><dt>Average capture</dt><dd>{diagnostics?.averageCaptureMs.toFixed(2) ?? '—'} ms</dd></div>
      </dl>
      {error && <p role="alert" className="kaplay-host-error">{error}</p>}
    </section>
  </main>;
}
