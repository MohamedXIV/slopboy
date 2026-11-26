/** Creator-facing types for the reviewed pixel-v1 host lifecycle.
 * Other adapters must explicitly implement their own approved lifecycle. */
export type {SaveCapabilities,SaveMode} from '../../runtime/src/save-capabilities.ts';
export type Button = 'UP'|'DOWN'|'LEFT'|'RIGHT'|'A'|'B'|'START'|'SELECT';
export interface GameContext {
  /** Local host storage, not cloud access or authoritative global currency.
   * Save at meaningful checkpoints for autosave; manual-only capture uses serialize.
   * The host owns persistence acknowledgment and active playthrough identity. */
  readonly storage: {load():string|null; save(value:string):void; erase():void};
  readonly input: {down(button: Button): boolean; pressed(button: Button): boolean};
  readonly screen: {
    clear(shade: number): void;
    pixel(x: number,y: number,shade: number): void;
    rect(x: number,y: number,width: number,height: number,shade: number): void;
  };
}
export interface GameModule {
  /** For reviewed manual-save cartridges, restore ctx.storage.load() in init. */
  init?(context: GameContext): void;
  /** Synchronous, side-effect-free capture of CURRENT state; required by the
   * pixel-v1 manual/manual-and-auto capability. Never copy an old autosave.
   * Do not write/erase storage, advance gameplay or perform async work here. */
  serialize?(context: GameContext): string;
  update(context: GameContext,dt: number): void;
  draw(context: GameContext): void;
}
