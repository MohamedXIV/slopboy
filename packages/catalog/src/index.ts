/**
 * Curated, immutable game catalog. Data only; no executable cartridge imports.
 * Additional games must pass validation and human review before landing here.
 */
export interface CatalogGame {
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  readonly description: string;
  readonly genre: 'Arcade' | 'Shooter' | 'Puzzle';
  readonly hardware: { readonly id: string; readonly version: string };
  readonly controls: readonly string[];
  readonly cartridge: `/cartridges/${string}.slop`;
  readonly artwork: { readonly background: string; readonly foreground: string; readonly emblem: string };
  readonly source: { readonly manifest: string; readonly game: string };
  readonly status: 'curated';
}
export const GAMES: readonly CatalogGame[] = [
  {
    id:'tiny-catcher',title:'Tiny Catcher',tagline:'Catch the falling pixels.',
    description:'Chase little falling squares across a tiny monochrome screen. Catch as many as you can!',
    genre:'Arcade',hardware:{id:'slopboy-1000',version:'0.1.0'},
    controls:['LEFT','RIGHT','A'],cartridge:'/cartridges/tiny-catcher.slop',
    artwork:{background:'#dce9a3',foreground:'#254637',emblem:'◆'},
    source:{manifest:'examples/tiny-catcher/manifest.json',game:'examples/tiny-catcher/src/game.ts'},status:'curated'
  },
  {
    id:'star-patrol',title:'Star Patrol',tagline:'Hold the line in deep space.',
    description:'Dodge incoming ships and blast them with your pulse cannon. A tiny, fast arcade shooter.',
    genre:'Shooter',hardware:{id:'slopboy-1000',version:'0.1.0'},
    controls:['LEFT','RIGHT','A','START'],cartridge:'/cartridges/star-patrol.slop',
    artwork:{background:'#293f3a',foreground:'#dce9a3',emblem:'✦'},
    source:{manifest:'examples/star-patrol/manifest.json',game:'examples/star-patrol/src/game.ts'},status:'curated'
  },
  {
    id:'circuit-slide',title:'Circuit Slide',tagline:'Solve the scrambled grid.',
    description:'Slide numbered circuit tiles into order in an original little logic puzzle. Press A to reshuffle.',
    genre:'Puzzle',hardware:{id:'slopboy-1000',version:'0.1.0'},
    controls:['UP','DOWN','LEFT','RIGHT','A','START'],cartridge:'/cartridges/circuit-slide.slop',
    artwork:{background:'#9fb7aa',foreground:'#243c42',emblem:'▦'},
    source:{manifest:'examples/circuit-slide/manifest.json',game:'examples/circuit-slide/src/game.ts'},status:'curated'
  }
] as const;
export function getCatalogGame(id:string): CatalogGame | undefined { return GAMES.find(game=>game.id===id); }
