/**
 * Slopboy KAPLAY Production Engine Adapter.
 *
 * Implements the EngineAdapter interface for KAPLAY 3001.0.19 cartridges:
 * - Version-pinned runtime reference: kaplay@3001.0.19.
 * - Secure opaque-origin iframe sandbox with strict CSP (connect-src 'none').
 * - Host-mediated input forwarding (UP, DOWN, LEFT, RIGHT, A, B, START, SELECT).
 * - Host-mediated save/load persistence connected to guest UUID envelopes.
 * - Output frame quantization: 160x144 logical resolution and 4 indexed colors.
 * - Chromium occlusion mitigation: retains non-zero geometry and active compositor
 *   scheduling while presenting through the trusted handheld screen canvas.
 * - Explicit experimental status per ADR-004 until renderer isolation is fully proven.
 */

import type { EngineAdapter, HostBridge, InputName } from './host-api.ts';
import { validateFrame } from './protocol.ts';

export const KAPLAY_ENGINE_ID = 'kaplay';
export const KAPLAY_ENGINE_VERSION = '3001.0.19';
export const KAPLAY_ADAPTER_PROTOCOL = 1;
export const KAPLAY_SANDBOX_SCOPE = 'slopboy-v2-kaplay-spike';

export interface KaplayDiagnostics {
  readonly opaque: boolean;
  readonly webgl: boolean;
  readonly captureMs: number;
  readonly gameTicks: number;
  readonly framesDelivered: number;
  readonly averageCaptureMs: number;
}

export interface KaplayAdapterOptions {
  readonly sandboxUrl?: string;
  readonly sandboxHtml?: string;
  readonly container?: HTMLElement;
  readonly onDiagnostics?: (diagnostics: KaplayDiagnostics) => void;
  /** For non-DOM test environments */
  readonly messageChannelPort?: MessagePort;
}

export class KaplayEngineAdapter implements EngineAdapter {
  readonly engineId = KAPLAY_ENGINE_ID;
  readonly engineVersion = KAPLAY_ENGINE_VERSION;
  readonly protocolVersion = KAPLAY_ADAPTER_PROTOCOL;

  private _host: HostBridge | null = null;
  private _sessionKey = '';
  private _iframe: HTMLIFrameElement | null = null;
  private _options: KaplayAdapterOptions;
  private _running = false;
  private _messageListener: ((event: MessageEvent) => void) | null = null;
  private _totalCaptureMs = 0;
  private _totalFrames = 0;
  private _gameTicks = 0;
  private _lastCaptureMs = 0;
  private _isOpaque = false;
  private _isWebgl = false;
  private _booted = false;

  constructor(options: KaplayAdapterOptions = {}) {
    this._options = options;
  }

  get diagnostics(): KaplayDiagnostics {
    return {
      opaque: this._isOpaque,
      webgl: this._isWebgl,
      captureMs: this._lastCaptureMs,
      gameTicks: this._gameTicks,
      framesDelivered: this._totalFrames,
      averageCaptureMs: this._totalFrames > 0 ? this._totalCaptureMs / this._totalFrames : 0,
    };
  }

  async init(bridge: HostBridge): Promise<void> {
    this._host = bridge;
    this._sessionKey = crypto.randomUUID();
    this._booted = false;

    // If running in browser environment with DOM
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      await this.mountIframe();
    }
  }

  private async mountIframe(): Promise<void> {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('title', 'Slopboy KAPLAY Sandbox');

    // Mitigate Chromium hidden/occluded iframe throttling:
    // Retain 160x144 logical dimensions and place within layout with pointer-events: none.
    iframe.style.width = '160px';
    iframe.style.height = '144px';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    iframe.style.pointerEvents = 'none';
    iframe.style.position = 'absolute';
    iframe.style.opacity = '0.05';
    iframe.style.zIndex = '0';

    let documentSource = this._options.sandboxHtml;
    if (!documentSource && this._options.sandboxUrl) {
      const url = new URL(this._options.sandboxUrl, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/v2/')) {
        throw new Error('KAPLAY sandbox document must be a vetted, same-origin /v2/ resource');
      }
      const resp = await fetch(url.href, { credentials: 'omit', cache: 'no-store', redirect: 'error' });
      if (!resp.ok || Number(resp.headers.get('content-length') || 0) > 8 * 1024 * 1024) {
        throw new Error(`KAPLAY sandbox fetch rejected (${resp.status})`);
      }
      documentSource = await resp.text();
    }
    if (!documentSource || new TextEncoder().encode(documentSource).byteLength > 8 * 1024 * 1024 ||
        !documentSource.includes('Content-Security-Policy') ||
        !documentSource.includes("connect-src 'none'")) {
      throw new Error('Missing or unsafe KAPLAY sandbox document');
    }
    iframe.srcdoc = documentSource;
    const container = this._options.container || document.body;
    this._iframe = iframe;
    // Install listener first: srcdoc can post "boot" immediately on attachment.
    this.setupMessageListener();
    container.appendChild(iframe);
  }

  private setupMessageListener(): void {
    this._messageListener = (event: MessageEvent) => {
      if (!this._iframe || event.source !== this._iframe.contentWindow || event.origin !== 'null') return;
      const msg = event.data;
      if (!msg || msg.scope !== KAPLAY_SANDBOX_SCOPE) return;

      if (msg.type === 'boot') {
        this.handleBoot();
        return;
      }

      if (msg.key !== this._sessionKey) return;

      if (msg.type === 'ready') {
        const { width, height } = this._host?.display ?? { width: 0, height: 0 };
        if (msg.opaque !== true || msg.webgl !== true ||
            !Array.isArray(msg.dimensions) || msg.dimensions[0] !== width || msg.dimensions[1] !== height) {
          this._running = false;
          this.postToIframe('stop');
          this._host?.diagnostics.reportError('KAPLAY sandbox did not verify opaque origin, WebGL and display dimensions');
          return;
        }
        this._isOpaque = true;
        this._isWebgl = true;
        return;
      }

      if (msg.type === 'frame' && this._running) {
        this.handleFrameMessage(msg);
        return;
      }

      if (msg.type === 'save') {
        this.handleSaveMessage(msg.value);
        return;
      }

      if (msg.type === 'error') {
        this._host?.diagnostics.reportError(String(msg.reason || 'KAPLAY sandbox error'));
      }
    };

    window.addEventListener('message', this._messageListener);
  }

  private handleBoot(): void {
    if (!this._host || this._booted) return;
    this._booted = true;
    // Load initial save from host bridge and pass to start message
    this._host.save.load().then(initialSave => {
      this.postToIframe('start', {
        save: initialSave,
      });
    }).catch(err => {
      this._host?.diagnostics.reportError(err);
      this.postToIframe('start', { save: null });
    });
  }

  private handleFrameMessage(msg: any): void {
    if (!this._host) return;
    const pixels = msg.pixels;
    const { width, height, indexedColors } = this._host.display;

    if (!validateFrame(pixels, width, height, indexedColors)) {
      this._host.diagnostics.reportError('Invalid KAPLAY frame received');
      return;
    }

    this._totalFrames++;
    if (Number.isFinite(msg.captureMs)) {
      this._lastCaptureMs = Number(msg.captureMs);
      this._totalCaptureMs += this._lastCaptureMs;
    }
    if (Number.isFinite(msg.gameTicks)) {
      this._gameTicks = Number(msg.gameTicks);
    }

    this._host.display.submitFrame(pixels);
    this._options.onDiagnostics?.(this.diagnostics);
  }

  private handleSaveMessage(value: unknown): void {
    if (!this._host) return;
    if (value !== null && typeof value !== 'string') return;
    if (typeof value === 'string' && new TextEncoder().encode(value).byteLength > 8192) {
      this._host.diagnostics.reportError('KAPLAY save exceeded platform safety budget');
      return;
    }
    this._host.save.save(value).catch(err => {
      this._host?.diagnostics.reportError(err);
    });
  }

  private postToIframe(type: string, extra: Record<string, unknown> = {}): void {
    if (this._iframe?.contentWindow) {
      this._iframe.contentWindow.postMessage(
        {
          scope: KAPLAY_SANDBOX_SCOPE,
          type,
          key: this._sessionKey,
          ...extra,
        },
        '*'
      );
    }
  }

  start(): void {
    this._running = true;
    this.postToIframe('resume');
  }

  pause(): void {
    this._running = false;
    this.postToIframe('pause');
  }

  resume(): void {
    this._running = true;
    this.postToIframe('resume');
  }

  restart(): void {
    this._running = true;
    this.postToIframe('restart');
  }

  setInput(down: readonly InputName[], _pressed?: readonly InputName[]): void {
    this.postToIframe('input', {
      down: Array.from(down),
    });
  }

  dispose(): void {
    this._running = false;
    this.postToIframe('stop');

    if (this._messageListener && typeof window !== 'undefined') {
      window.removeEventListener('message', this._messageListener);
      this._messageListener = null;
    }

    if (this._iframe && this._iframe.parentNode) {
      this._iframe.parentNode.removeChild(this._iframe);
      this._iframe = null;
    }

    this._host = null;
    this._booted = false;
  }
}
