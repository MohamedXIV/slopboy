"use client";

import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from "react";
import {V2_DEVICE_1000, V2_LCD_PALETTES, type V2PaletteId, type V2Button} from "@slopboy/hardware/v2";
import {validateFrame, rasterizeFrame} from "@slopboy/runtime/protocol";

const SCOPE = "slopboy-v2-kaplay-spike";
const SOURCE_BUDGET = 8 * 1024 * 1024;
const KEYS: Record<string, V2Button> = {
  ArrowUp:"UP", ArrowDown:"DOWN", ArrowLeft:"LEFT", ArrowRight:"RIGHT",
  KeyW:"UP", KeyA:"LEFT", KeyS:"DOWN", KeyD:"RIGHT",
  Space:"A", KeyZ:"A"
};
type Stage = "loading"|"booting"|"running"|"error";
type Diagnostic = {opaque:boolean;webgl:boolean;preserveDrawingBuffer:boolean|null};
const INPUTS = [
  {key:"UP" as const, label:"↑"},
  {key:"LEFT" as const, label:"←"},
  {key:"RIGHT" as const, label:"→"},
  {key:"DOWN" as const, label:"↓"}
];

export default function KaplaySpikePlayer() {
  const [html, setHtml] = useState<string|null>(null);
  const [epoch, setEpoch] = useState(0);
  const [status, setStatus] = useState<Stage>("loading");
  const [reason, setReason] = useState("");
  const [frames, setFrames] = useState(0);
  const [captureMs, setCaptureMs] = useState(0);
  const [playerX, setPlayerX] = useState(0);
  const [gameTicks, setGameTicks] = useState(0);
  const [inputCount, setInputCount] = useState(0);
  const [assetProgress, setAssetProgress] = useState(0);
  const [diagnostic, setDiagnostic] = useState<Diagnostic|null>(null);
  const [palette, setPalette] = useState<V2PaletteId>("moss");
  const display = useRef<HTMLCanvasElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const nonce = useRef("");
  const pressed = useRef(new Set<V2Button>());
  const frameCount = useRef(0);
  const lastFrame = useRef(0);
  const paletteRef = useRef<V2PaletteId>("moss");
  const started = useRef(false);
  const currentStage = useRef<Stage>("loading");
  const pointerKeys = useRef(new Map<number,V2Button>());

  function setStage(stage: Stage, message = "") {
    currentStage.current = stage;
    setStatus(stage);
    setReason(message);
  }
  function send(type: string, extra: Record<string,unknown> = {}) {
    iframe.current?.contentWindow?.postMessage({scope:SCOPE, type, key:nonce.current, ...extra}, "*");
  }
  function syncInput() {
    send("input", {down:[...pressed.current]});
  }
  function press(button: V2Button) {pressed.current.add(button); syncInput();}
  function release(button: V2Button) {pressed.current.delete(button); syncInput();}

  useEffect(() => {
    let live = true;
    fetch("/v2/kaplay-spike.html", {credentials:"omit", redirect:"error", cache:"no-store"})
      .then(async response => {
        if (!response.ok || Number(response.headers.get("content-length") || 0) > SOURCE_BUDGET) throw Error("Sandbox bundle unavailable or too large");
        const document = await response.text();
        if (new TextEncoder().encode(document).byteLength > SOURCE_BUDGET ||
            !document.includes("Content-Security-Policy") ||
            !document.includes("connect-src 'none'")) throw Error("Invalid local KAPLAY sandbox document");
        return document;
      })
      .then(source => {if (live) {setHtml(source);setStage("booting");}})
      .catch(error => {if (live) setStage("error", String(error));});
    return () => {live=false;};
  }, []);

  useEffect(() => {
    nonce.current = crypto.randomUUID();
    frameCount.current = 0;
    lastFrame.current = Date.now();
    started.current = false;
    pressed.current.clear();
    function onMessage(event: MessageEvent) {
      if (event.source !== iframe.current?.contentWindow || event.origin !== "null") return;
      const message = event.data;
      if (!message || message.scope !== SCOPE) return;
      if (message.type === "boot") {
        if (!started.current) {started.current = true; send("start");}
        return;
      }
      if (message.key !== nonce.current) return;
      if (message.type === "error") {setStage("error", String(message.reason || "Unknown isolated runtime error").slice(0, 160));return;}
      if (message.type === "ready") {
        if (message.opaque !== true || message.webgl !== true ||
            !Array.isArray(message.dimensions) || message.dimensions[0] !== V2_DEVICE_1000.display.width ||
            message.dimensions[1] !== V2_DEVICE_1000.display.height) {
          setStage("error", "Sandbox origin, WebGL or hardware dimension check failed");
          send("stop");
          return;
        }
        setDiagnostic({opaque:true,webgl:true,preserveDrawingBuffer:message.preserveDrawingBuffer === true});
        lastFrame.current = Date.now();
        setStage("running");
        syncInput();
        return;
      }
      if (message.type === "frame" && currentStage.current === "running") {
        if (!validateFrame(message.pixels, V2_DEVICE_1000.display.width, V2_DEVICE_1000.display.height, V2_DEVICE_1000.display.indexedColors)) {
          setStage("error", "Untrusted framebuffer failed hardware validation");
          send("stop");
          return;
        }
        const ctx = display.current?.getContext("2d", {alpha:false});
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.putImageData(rasterizeFrame(message.pixels, V2_DEVICE_1000.display.width, V2_DEVICE_1000.display.height, V2_LCD_PALETTES[paletteRef.current].colors), 0, 0);
        lastFrame.current = Date.now();
        frameCount.current++;
        if (frameCount.current % 5 === 0) {
          setFrames(frameCount.current);
          if (Number.isFinite(message.captureMs)) setCaptureMs(Math.max(0, Number(message.captureMs)));
          if (Number.isFinite(message.playerX)) setPlayerX(Number(message.playerX));
          if (Number.isFinite(message.gameTicks)) setGameTicks(Number(message.gameTicks));
          if (Number.isFinite(message.inputCount)) setInputCount(Number(message.inputCount));
          if (Number.isFinite(message.assetProgress)) setAssetProgress(Number(message.assetProgress));
        }
      }
    }
    window.addEventListener("message", onMessage);
    const watchdog = window.setInterval(() => {
      if (currentStage.current === "running" && Date.now() - lastFrame.current > 3500) {
        setStage("error", "KAPLAY framebuffer heartbeat timed out; this does NOT guarantee recovery from a renderer-wide infinite loop");
        send("stop");
      }
    }, 400);
    return () => {
      send("stop");
      window.removeEventListener("message", onMessage);
      clearInterval(watchdog);
    };
  }, [html,epoch]);

  useEffect(() => {
    paletteRef.current = palette;
  }, [palette]);

  useEffect(() => {
    const down = (event:KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey ||
          event.target instanceof HTMLElement && event.target.closest("input,textarea,select")) return;
      const button = KEYS[event.code];
      if (!button) return;
      event.preventDefault();
      if (!event.repeat) press(button);
    };
    const up = (event:KeyboardEvent) => {
      const button = KEYS[event.code];
      if (!button) return;
      event.preventDefault();
      release(button);
    };
    const reset = () => {pressed.current.clear(); syncInput();};
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, []);

  const downPointer = (event:ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const button = event.currentTarget.dataset.button as V2Button;
    if (!V2_DEVICE_1000.inputs.includes(button)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerKeys.current.set(event.pointerId, button);
    press(button);
  };
  const upPointer = (event:ReactPointerEvent<HTMLButtonElement>) => {
    const button = pointerKeys.current.get(event.pointerId);
    if (!button) return;
    pointerKeys.current.delete(event.pointerId);
    if (![...pointerKeys.current.values()].includes(button)) release(button);
  };
  const reset = () => {
    setDiagnostic(null);setFrames(0);setPlayerX(0);setCaptureMs(0);
    setGameTicks(0);setInputCount(0);setAssetProgress(0);
    setStage("booting");setEpoch(e => e + 1);
  };
  const colors = V2_LCD_PALETTES[palette].colors;
  return <div className="kaplay-card">
    <div>
      <div className="kaplay-display-wrap">
        <canvas ref={display} width={V2_DEVICE_1000.display.width} height={V2_DEVICE_1000.display.height}
          role="img" aria-label="Orbit Dodge hardware-constrained framebuffer"/>
        {html && <iframe key={epoch} ref={iframe} sandbox="allow-scripts" referrerPolicy="no-referrer"
          title="Opaque KAPLAY engine sandbox" srcDoc={html}/>}
      </div>
      <div className="kaplay-controls">
        <div className="kaplay-control-pad">{INPUTS.map(({key,label}) =>
          <button key={key} type="button" aria-label={key} data-button={key} onPointerDown={downPointer}
            onPointerUp={upPointer} onPointerCancel={upPointer} onLostPointerCapture={upPointer}>{label}</button>)}</div>
        <button className="kaplay-action" type="button" aria-label="A button" data-button="A" onPointerDown={downPointer}
          onPointerUp={upPointer} onPointerCancel={upPointer} onLostPointerCapture={upPointer}>A</button>
      </div>
    </div>
    <div className="kaplay-stats">
      <h2>Runtime instrumentation</h2>
      <dl>
        <dt>State</dt><dd data-testid="kaplay-status">{status}</dd>
        <dt>Isolation</dt><dd>{diagnostic?.opaque ? "Opaque origin" : "Not verified"}</dd>
        <dt>Renderer</dt><dd>{diagnostic?.webgl ? "WebGL" : "Not verified"}</dd>
        <dt>Display</dt><dd>160 × 144 · 4 shades</dd>
        <dt>Frames received</dt><dd data-testid="kaplay-frames">{frames}</dd>
        <dt>Last readback</dt><dd data-testid="kaplay-capture">{captureMs.toFixed(1)} ms</dd>
        <dt>Player X</dt><dd data-testid="kaplay-player-x">{playerX.toFixed(0)}</dd>
        <dt>Engine update ticks</dt><dd data-testid="kaplay-ticks">{gameTicks}</dd>
        <dt>Inputs in cartridge</dt><dd data-testid="kaplay-input-count">{inputCount}</dd>
        <dt>Asset load</dt><dd data-testid="kaplay-asset-progress">{assetProgress.toFixed(2)}</dd>
        <dt>GPU preservation</dt><dd>{diagnostic ? String(diagnostic.preserveDrawingBuffer) : "unknown"}</dd>
        <dt>Pixel pipeline</dt><dd>WebGL → CPU quantize → 2D</dd>
        <dt>Transfer cap</dt><dd>30 FPS (60 target)</dd>
      </dl>
      {reason && <p className="kaplay-error" role="alert">{reason}</p>}
      <p><label htmlFor="kaplay-palette">LCD palette: </label>
        <select id="kaplay-palette" value={palette} onChange={event => setPalette(event.target.value as V2PaletteId)}>
          {Object.entries(V2_LCD_PALETTES).map(([id, entry]) => <option key={id} value={id}>{entry.name}</option>)}
        </select></p>
      <button type="button" onClick={reset}>Restart isolated engine</button>
      <p style={{fontSize:12,color:colors[3]}}>Keyboard: arrows/WASD; A = Space/Z. Touch buttons work without opening the iframe DOM.</p>
    </div>
  </div>;
}
