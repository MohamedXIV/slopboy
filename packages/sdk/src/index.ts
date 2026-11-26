/** Creator-facing types; the P1 sandbox will supply this host context. */
export type Button = 'UP'|'DOWN'|'LEFT'|'RIGHT'|'A'|'B'|'START'|'SELECT';
export interface GameContext {
  /** Per-cartridge local draft only, never authoritative global currency. */
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
   * pixel-v1 manual/manual-and-auto capability. Never copy an old autosave. */
  serialize?(context: GameContext): string;
  update(context: GameContext,dt: number): void;
  draw(context: GameContext): void;
}
