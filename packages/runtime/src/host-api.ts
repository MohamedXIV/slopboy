/**
 * Slopboy Shared Host API and Engine Adapter Contract.
 *
 * Provides the engine-neutral foundation for running cartridges across engines:
 * - Clean lifecycle: create -> init -> start -> pause/resume -> restart -> dispose.
 * - Host-mediated input handling without direct DOM/window leakage.
 * - Host-mediated guest save/load storage integrated with UUID-based envelopes.
 * - Display-only device constraints: logical resolution, aspect ratio, indexed colors.
 * - Strict frame validation and diagnostics.
 * - Reusable for KAPLAY, Phaser, Pixi, and Pixel-V1 adapters.
 */

import { validateFrame } from './protocol.ts';
import {
  type SaveDriver,
  createGameSaveService,
} from './save-store.ts';
import type { V2HardwareProfile, V2Button } from '../../hardware/src/v2.ts';
import { SLOPBOY_1000 } from '../../hardware/src/index.ts';

export type HostLifecycleState =
  | 'uninitialized'
  | 'created'
  | 'initializing'
  | 'ready'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'disposed'
  | 'error';

export type InputName = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'A' | 'B' | 'START' | 'SELECT';

export const VALID_INPUTS: ReadonlySet<InputName> = new Set([
  'UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'START', 'SELECT'
]);

export interface HostDisplayBridge {
  readonly width: number;
  readonly height: number;
  readonly indexedColors: number;
  submitFrame(pixels: Uint8Array): void;
}

export interface HostSaveBridge {
  load(): Promise<string | null>;
  save(data: string | null): Promise<void>;
  erase(): Promise<void>;
}

export interface HostDiagnosticsBridge {
  readonly engineId: string;
  readonly engineVersion: string;
  readonly gameId: string;
  readonly revisionId: string;
  reportError(error: Error | string): void;
  reportMetric(name: string, value: number): void;
}

export interface HostBridge {
  readonly display: HostDisplayBridge;
  readonly save: HostSaveBridge;
  readonly diagnostics: HostDiagnosticsBridge;
  getInput(): ReadonlySet<InputName>;
  isDown(button: InputName): boolean;
  isPressed(button: InputName): boolean;
}

export interface EngineAdapter {
  readonly engineId: string;
  readonly engineVersion: string;
  readonly protocolVersion: number;
  init(bridge: HostBridge): Promise<void> | void;
  start(): Promise<void> | void;
  pause(): void;
  resume(): void;
  restart(): Promise<void> | void;
  setInput(down: readonly InputName[], pressed?: readonly InputName[]): void;
  dispose(): Promise<void> | void;
}

export interface HostSessionMetrics {
  totalFrames: number;
  droppedFrames: number;
  lastFrameTimestamp: number;
  inputTransitions: number;
  saveOperations: number;
  stateTransitions: number;
}

export class HostSessionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'HostSessionError';
    this.code = code;
  }
}

export interface HostSessionOptions {
  readonly gameId: string;
  readonly revisionId: string;
  readonly legacySlug?: string;
  readonly hardware: V2HardwareProfile;
  readonly adapter: EngineAdapter;
  readonly saveDriver?: SaveDriver;
  readonly onFrame?: (pixels: Uint8Array) => void;
  readonly onStateChange?: (state: HostLifecycleState, detail?: string) => void;
  readonly onError?: (error: Error) => void;
}

/**
 * HostSession coordinates the complete lifecycle between the device host and
 * an EngineAdapter.
 */
export class HostSession {
  readonly gameId: string;
  readonly revisionId: string;
  readonly legacySlug?: string;
  readonly hardware: V2HardwareProfile;
  readonly adapter: EngineAdapter;

  private _state: HostLifecycleState = 'created';
  private _downButtons = new Set<InputName>();
  private _pressedButtons = new Set<InputName>();
  private readonly _onFrame?: (pixels: Uint8Array) => void;
  private readonly _onStateChange?: (state: HostLifecycleState, detail?: string) => void;
  private readonly _onError?: (error: Error) => void;
  private readonly _saveService: { read(): Promise<string | null>; write(value: string | null): Promise<void> };
  private readonly _metrics: HostSessionMetrics = {
    totalFrames: 0,
    droppedFrames: 0,
    lastFrameTimestamp: 0,
    inputTransitions: 0,
    saveOperations: 0,
    stateTransitions: 0,
  };

  constructor(options: HostSessionOptions) {
    this.gameId = options.gameId;
    this.revisionId = options.revisionId;
    this.legacySlug = options.legacySlug;
    this.hardware = options.hardware;
    this.adapter = options.adapter;
    this._onFrame = options.onFrame;
    this._onStateChange = options.onStateChange;
    this._onError = options.onError;

    // Use memory fallback save driver if none provided
    const driver = options.saveDriver ?? createMemorySaveDriver();
    // Wrap with existing UUID-based guest save store
    const hwAdapter = {
      id: this.hardware.id,
      version: '0.1.0',
      display: this.hardware.display,
      input: { buttons: this.hardware.inputs as any },
      audio: { voices: 4 },
      budgets: {
        compressedBytes: 512 * 1024,
        extractedBytes: 2 * 1024 * 1024,
        codeBytes: 64 * 1024,
        saveBytes: 8 * 1024,
        maxFiles: 16,
      },
    };
    this._saveService = createGameSaveService(driver, hwAdapter, {
      gameId: this.gameId,
      legacySlug: this.legacySlug,
    });
  }

  get state(): HostLifecycleState {
    return this._state;
  }

  get metrics(): Readonly<HostSessionMetrics> {
    return { ...this._metrics };
  }

  private setState(newState: HostLifecycleState, detail?: string): void {
    this._state = newState;
    this._metrics.stateTransitions++;
    this._onStateChange?.(newState, detail);
  }

  /**
   * Initializes the session, binding the host bridge to the adapter.
   */
  async init(): Promise<void> {
    if (this._state !== 'created') {
      throw new HostSessionError('INVALID_STATE', `Cannot init from state "${this._state}"`);
    }
    this.setState('initializing');

    const bridge: HostBridge = {
      display: {
        width: this.hardware.display.width,
        height: this.hardware.display.height,
        indexedColors: this.hardware.display.indexedColors,
        submitFrame: (pixels: Uint8Array) => this.handleFrame(pixels),
      },
      save: {
        load: async () => {
          this._metrics.saveOperations++;
          return this._saveService.read();
        },
        save: async (data: string | null) => {
          this._metrics.saveOperations++;
          return this._saveService.write(data);
        },
        erase: async () => {
          this._metrics.saveOperations++;
          return this._saveService.write(null);
        },
      },
      diagnostics: {
        engineId: this.adapter.engineId,
        engineVersion: this.adapter.engineVersion,
        gameId: this.gameId,
        revisionId: this.revisionId,
        reportError: (err: Error | string) => {
          const error = err instanceof Error ? err : new Error(String(err));
          this.handleError(error);
        },
        reportMetric: (_name: string, _value: number) => {
          // Extension hook for telemetry
        },
      },
      getInput: () => new Set(this._downButtons),
      isDown: (btn: InputName) => this._downButtons.has(btn),
      isPressed: (btn: InputName) => this._pressedButtons.has(btn),
    };

    try {
      await this.adapter.init(bridge);
      this.setState('ready');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Starts running the session.
   */
  async start(): Promise<void> {
    if (this._state !== 'ready' && this._state !== 'stopped') {
      throw new HostSessionError('INVALID_STATE', `Cannot start from state "${this._state}"`);
    }
    this.setState('running');
    try {
      await this.adapter.start();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Pauses execution (e.g. when app tab is hidden or menu is opened).
   */
  pause(): void {
    if (this._state !== 'running') return;
    this.adapter.pause();
    this.setState('paused');
  }

  /**
   * Resumes execution.
   */
  resume(): void {
    if (this._state !== 'paused') return;
    this.adapter.resume();
    this.setState('running');
  }

  /**
   * Restarts the game cleanly.
   */
  async restart(): Promise<void> {
    if (this._state === 'disposed') {
      throw new HostSessionError('INVALID_STATE', 'Cannot restart disposed session');
    }
    this._downButtons.clear();
    this._pressedButtons.clear();
    try {
      await this.adapter.restart();
      this.setState('running');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Disposes the session and releases adapter resources.
   */
  async dispose(): Promise<void> {
    if (this._state === 'disposed') return;
    this._downButtons.clear();
    this._pressedButtons.clear();
    try {
      await this.adapter.dispose();
    } finally {
      this.setState('disposed');
    }
  }

  /**
   * Updates host input state and forwards to adapter.
   */
  setButtons(buttons: readonly InputName[]): void {
    if (this._state !== 'running' && this._state !== 'ready') return;

    const nextDown = new Set<InputName>();
    const newlyPressed = new Set<InputName>();

    for (const btn of buttons) {
      if (VALID_INPUTS.has(btn)) {
        nextDown.add(btn);
        if (!this._downButtons.has(btn)) {
          newlyPressed.add(btn);
        }
      }
    }

    if (nextDown.size !== this._downButtons.size || newlyPressed.size > 0) {
      this._metrics.inputTransitions++;
    }

    this._downButtons = nextDown;
    this._pressedButtons = newlyPressed;

    this.adapter.setInput(Array.from(nextDown), Array.from(newlyPressed));
  }

  private handleFrame(pixels: Uint8Array): void {
    if (this._state !== 'running') {
      this._metrics.droppedFrames++;
      return;
    }

    const { width, height, indexedColors } = this.hardware.display;
    if (!validateFrame(pixels, width, height, indexedColors)) {
      this.handleError(new HostSessionError('MALFORMED_FRAME', 'Adapter submitted frame with invalid dimensions or colors'));
      return;
    }

    this._metrics.totalFrames++;
    this._metrics.lastFrameTimestamp = Date.now();
    this._onFrame?.(pixels);
  }

  private handleError(error: Error): void {
    this.setState('error', error.message);
    this._onError?.(error);
  }
}

/** In-memory SaveDriver for tests and fallback. */
export function createMemorySaveDriver(): SaveDriver {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key);
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

/**
 * PixelV1Adapter maps pixel-v1 game modules to the shared EngineAdapter contract.
 */
export class PixelV1Adapter implements EngineAdapter {
  readonly engineId = 'pixel-v1';
  readonly engineVersion = '0.1.0';
  readonly protocolVersion = 1;

  private _host: HostBridge | null = null;
  private _gameModule: any = null;
  private _running = false;
  private _frameBuffer: Uint8Array | null = null;
  private _timer: any = null;

  constructor(gameModuleOrFactory: any) {
    this._gameModule = typeof gameModuleOrFactory === 'function' ? gameModuleOrFactory() : gameModuleOrFactory;
  }

  init(bridge: HostBridge): void {
    this._host = bridge;
    const { width, height } = bridge.display;
    this._frameBuffer = new Uint8Array(width * height);

    if (typeof this._gameModule?.init === 'function') {
      const context = this.createGameContext();
      this._gameModule.init(context);
    }
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.scheduleTick();
  }

  pause(): void {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  resume(): void {
    if (this._running) return;
    this._running = true;
    this.scheduleTick();
  }

  restart(): void {
    this.pause();
    if (this._frameBuffer) {
      this._frameBuffer.fill(0);
    }
    if (typeof this._gameModule?.init === 'function') {
      this._gameModule.init(this.createGameContext());
    }
    this.resume();
  }

  setInput(_down: readonly InputName[], _pressed?: readonly InputName[]): void {
    // Input is queried live via host bridge during update tick
  }

  dispose(): void {
    this.pause();
    this._host = null;
    this._gameModule = null;
    this._frameBuffer = null;
  }

  private scheduleTick(): void {
    if (!this._running || !this._host) return;
    this._timer = setTimeout(() => {
      this.tick();
      this.scheduleTick();
    }, 1000 / 60);
  }

  private tick(): void {
    if (!this._host || !this._frameBuffer) return;
    const context = this.createGameContext();

    if (typeof this._gameModule?.update === 'function') {
      this._gameModule.update(context, 1 / 60);
    }
    if (typeof this._gameModule?.draw === 'function') {
      this._gameModule.draw(context);
    }

    // Submit copy of frame
    this._host.display.submitFrame(new Uint8Array(this._frameBuffer));
  }

  private createGameContext(): any {
    const host = this._host!;
    const fb = this._frameBuffer!;
    const { width, height, indexedColors } = host.display;

    return {
      input: {
        down: (btn: InputName) => host.isDown(btn),
        pressed: (btn: InputName) => host.isPressed(btn),
      },
      storage: {
        load: () => null, // Sync convenience; real saves use host.save
        save: (val: string) => {
          host.save.save(val).catch(e => host.diagnostics.reportError(e));
        },
        erase: () => {
          host.save.erase().catch(e => host.diagnostics.reportError(e));
        },
      },
      screen: {
        clear: (shade: number) => {
          const s = Math.max(0, Math.min(indexedColors - 1, Math.trunc(shade)));
          fb.fill(s);
        },
        pixel: (x: number, y: number, shade: number) => {
          const px = Math.trunc(x);
          const py = Math.trunc(y);
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const s = Math.max(0, Math.min(indexedColors - 1, Math.trunc(shade)));
            fb[py * width + px] = s;
          }
        },
        rect: (x: number, y: number, w: number, h: number, shade: number) => {
          const s = Math.max(0, Math.min(indexedColors - 1, Math.trunc(shade)));
          const x0 = Math.max(0, Math.trunc(x));
          const y0 = Math.max(0, Math.trunc(y));
          const x1 = Math.min(width, Math.trunc(x + w));
          const y1 = Math.min(height, Math.trunc(y + h));
          for (let r = y0; r < y1; r++) {
            fb.fill(s, r * width + x0, r * width + x1);
          }
        },
      },
    };
  }
}
