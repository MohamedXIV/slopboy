/** Deterministic cover art for curated fallback cartridges (no network or AI needed). */
export interface CartridgeAppearance {
  readonly primary:string;
  readonly secondary:string;
  readonly highlight:string;
  readonly rotation:number;
  readonly stripes:number;
  readonly accentX:number;
  readonly accentY:number;
}
const PALETTES=[
  ['#315957','#132b34','#f6d88e'],
  ['#6d5a7c','#30283d','#e5c2ff'],
  ['#b65f55','#442b31','#f6df97'],
  ['#4b6a45','#203b39','#ccebb1'],
  ['#9b7c4e','#3b342c','#e6d5a1']
] as const;
export function makeCartridgeAppearance(id:string):CartridgeAppearance{
  let seed=2166136261;
  for(const char of id){seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;}
  const colors=PALETTES[seed%PALETTES.length];
  return {primary:colors[0],secondary:colors[1],highlight:colors[2],
    rotation:(seed>>>5)%140-70,stripes:3+(seed>>>10)%6,
    accentX:18+(seed>>>17)%64,accentY:18+(seed>>>23)%64};
}
