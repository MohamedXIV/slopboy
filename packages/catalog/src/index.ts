/**
 * Curated fixture catalog. UUIDs are assigned ONCE and must be seeded unchanged
 * when this catalog moves to the database. Pixel-v1 slugs identify old bundles
 * and bookmarks only; a title or revision never determines game identity.
 */
export interface CatalogGame {
  readonly gameId:string;
  readonly revisionId:string;
  readonly legacySlug:string;
  readonly title:string;
  readonly tagline:string;
  readonly description:string;
  readonly genre:'Arcade'|'Shooter'|'Puzzle';
  readonly hardware:{readonly id:string;readonly version:string};
  readonly controls:readonly string[];
  readonly mainStory?:{readonly milestoneCount:number};
  readonly cartridge:`/cartridges/${string}.slop`;
  readonly artwork:{readonly background:string;readonly foreground:string;readonly emblem:string};
  readonly source:{readonly manifest:string;readonly game:string};
  readonly status:'curated';
}
export const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isGameUuid(value:string):boolean{return UUID_PATTERN.test(value);}
export const GAMES:readonly CatalogGame[]=[
  {
    gameId:'5b0edbf4-644d-43f4-9ad3-5506eacd05d3',
    revisionId:'107d59b4-03d5-4a29-be33-f8246a2c4caa',
    legacySlug:'tiny-catcher',title:'Tiny Catcher',tagline:'Catch the falling pixels.',
    description:'Chase little falling squares across a tiny monochrome screen. Catch as many as you can!',
    genre:'Arcade',hardware:{id:'slopboy-1000',version:'0.1.0'},
    controls:['LEFT','RIGHT','A'],cartridge:'/cartridges/tiny-catcher.slop',
    artwork:{background:'#dce9a3',foreground:'#254637',emblem:'◆'},
    source:{manifest:'examples/tiny-catcher/manifest.json',game:'examples/tiny-catcher/src/game.ts'},status:'curated'
  },
  {
    gameId:'f8067e25-7c16-4e9d-b496-69b1b8fe7ccc',
    revisionId:'38ecff6f-6b60-40d1-81ab-c07ad0dc928e',
    legacySlug:'star-patrol',title:'Star Patrol',tagline:'Hold the line in deep space.',
    description:'Dodge incoming ships and blast them with your pulse cannon. A tiny, fast arcade shooter.',
    genre:'Shooter',hardware:{id:'slopboy-1000',version:'0.1.0'},
    controls:['LEFT','RIGHT','A','START'],cartridge:'/cartridges/star-patrol.slop',
    artwork:{background:'#293f3a',foreground:'#dce9a3',emblem:'✦'},
    source:{manifest:'examples/star-patrol/manifest.json',game:'examples/star-patrol/src/game.ts'},status:'curated'
  },
  {
    gameId:'3ce74eec-ca3c-484b-8d16-2af4840c539b',
    revisionId:'8b2c6f40-4684-4e6f-95d4-ce7cfca730f2',
    legacySlug:'circuit-slide',title:'Circuit Slide',tagline:'Solve the scrambled grid.',
    description:'Slide numbered circuit tiles into order in an original little logic puzzle. Press A to reshuffle.',
    genre:'Puzzle',hardware:{id:'slopboy-1000',version:'0.1.0'},
    controls:['UP','DOWN','LEFT','RIGHT','A','START'],cartridge:'/cartridges/circuit-slide.slop',
    artwork:{background:'#9fb7aa',foreground:'#243c42',emblem:'▦'},
    source:{manifest:'examples/circuit-slide/manifest.json',game:'examples/circuit-slide/src/game.ts'},status:'curated'
  }
] as const;
const byId=new Map(GAMES.map(game=>[game.gameId,game]));
const byLegacySlug=new Map(GAMES.map(game=>[game.legacySlug,game]));
/** Strict canonical lookup: future dynamic catalogs use the same contract. */
export function getCatalogGame(gameId:string):CatalogGame|undefined{return byId.get(gameId);}
/** Explicit compatibility lookup. Do not use as an authorization or game ID check. */
export function getLegacyCatalogGame(slug:string):CatalogGame|undefined{return byLegacySlug.get(slug);}
/** Only route boundaries accept historical aliases; runtime always receives UUID. */
export function resolveCatalogGame(routeId:string):CatalogGame|undefined{
  return getCatalogGame(routeId)??getLegacyCatalogGame(routeId);
}
