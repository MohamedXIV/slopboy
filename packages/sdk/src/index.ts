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
  init?(context: GameContext): void;
  update(context: GameContext,dt: number): void;
  draw(context: GameContext): void;
}
