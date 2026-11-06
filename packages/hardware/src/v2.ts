/**
 * Slopboy 2.0 hardware contract, deliberately independent of any game engine.
 * Only logical resolution and indexed color count are emulated. Other hardware
 * properties (CPU, RAM, FPS, audio, ROM, saves) are NOT simulated.
 * Public v1 compatibility hardware remains unchanged.
 */
export type V2Button = 'UP'|'DOWN'|'LEFT'|'RIGHT'|'A'|'B'|'START'|'SELECT';
export type DeviceFamily = 'vertical-slab'|'wide-slab'|'compact-slab'|'folding-slab';
export interface V2HardwareProfile {
  readonly id: string;
  readonly revision: string;
  readonly family: DeviceFamily;
  readonly display: {
    readonly width: number;
    readonly height: number;
    readonly indexedColors: number;
  };
  /** Physical controls for input mapping only, not engine or resource limits. */
  readonly inputs: readonly V2Button[];
}
export const V2_DEVICE_1000: Readonly<V2HardwareProfile> = Object.freeze({
  id:'slopboy-1000',
  revision:'2.0.0-preview',
  family:'vertical-slab',
  display:{width:160,height:144,indexedColors:4},
  inputs:['UP','DOWN','LEFT','RIGHT','A','B','START','SELECT'] as const,
});
export const V2_DEVICE_FAMILIES: ReadonlyArray<{readonly id:DeviceFamily;readonly name:string;readonly status:'concept'|'active'}> = [
  {id:'vertical-slab',name:'Vertical slab',status:'active'},
  {id:'wide-slab',name:'Wide slab',status:'concept'},
  {id:'compact-slab',name:'Compact slab',status:'concept'},
  {id:'folding-slab',name:'Folding slab',status:'concept'}
];
/**
 * All palettes map the SAME four abstract shade indexes; they never alter the
 * number of colors available to game code.
 */
export const V2_LCD_PALETTES = {
  moss:{name:'Moss',colors:['#dce9b1','#aebf81','#648368','#29483e']},
  ocean:{name:'Ocean',colors:['#d9f1eb','#9bc7bb','#4a888d','#1c4557']},
  amber:{name:'Amber',colors:['#fff0ba','#e7bb75','#ad7448','#5e3d31']},
  graphite:{name:'Graphite',colors:['#f0eee7','#c3c9c5','#6e8583','#24393c']}
} as const;
export type V2PaletteId=keyof typeof V2_LCD_PALETTES;
export const V2_SHELLS={
  bone:{name:'Warm bone',base:'#d9d1bc',shadow:'#9eaa9c',ink:'#283b3e',button:'#c36b5d'},
  mint:{name:'Seafoam',base:'#b1d1c0',shadow:'#648d8b',ink:'#1e4340',button:'#dc8469'},
  ink:{name:'Graphite',base:'#424b53',shadow:'#232f35',ink:'#f1e9d6',button:'#e3b85a'},
  lilac:{name:'Lilac',base:'#beb7d7',shadow:'#8277ab',ink:'#302e47',button:'#9e6a7c'}
} as const;
export type V2ShellId=keyof typeof V2_SHELLS;
export function isV2PaletteId(value:string):value is V2PaletteId{return Object.hasOwn(V2_LCD_PALETTES,value);}
export function isV2ShellId(value:string):value is V2ShellId{return Object.hasOwn(V2_SHELLS,value);}
export function validateHardwareProfile(profile:V2HardwareProfile):void{
  const {display,inputs}=profile;
  if(!/^[a-z0-9-]+$/.test(profile.id)||!/^\d+\.\d+\.\d+(?:-[a-z0-9-]+)?$/.test(profile.revision))
    throw Error('Invalid hardware identity/version');
  if(!Number.isInteger(display.width)||!Number.isInteger(display.height)||display.width<=0||display.height<=0||
      display.width*display.height>512*512||!Number.isInteger(display.indexedColors)||
      display.indexedColors<2||display.indexedColors>256)
    throw Error('Invalid display capabilities');
  if(!inputs.length||new Set(inputs).size!==inputs.length||!inputs.every(x=>['UP','DOWN','LEFT','RIGHT','A','B','START','SELECT'].includes(x)))
    throw Error('Invalid input capabilities');
}
export function matchesCartridgeRequirements(
  hardware:V2HardwareProfile,
  required:Readonly<{display:{width:number;height:number;indexedColors:number}}>
):boolean{
  return required.display.width===hardware.display.width &&
    required.display.height===hardware.display.height &&
    required.display.indexedColors<=hardware.display.indexedColors;
}
