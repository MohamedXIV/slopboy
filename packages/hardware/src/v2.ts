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
  moss:{name:'Classic Moss',colors:['#dce9b1','#9ec27d','#507d5c','#203b33']},
  pocket:{name:'Pocket Warm',colors:['#e5e0c5','#b8b292','#73705a','#2c2c23']},
  phosphor:{name:'Terminal Green',colors:['#c9f5b5','#76cf78','#2f8249','#0f2d1e']},
  paper:{name:'Ink & Paper',colors:['#f2efe4','#b6b8ae','#646c68','#1d2424']}
} as const;
export type V2PaletteId=keyof typeof V2_LCD_PALETTES;
export const V2_SHELLS={
  bone:{name:'Studio Bone',base:'#d9d1bc',shadow:'#9eaa9c',ink:'#283b3e',button:'#c36b5d'},
  moss:{name:'Field Moss',base:'#6f8776',shadow:'#43584b',ink:'#172521',button:'#d28f52'},
  graphite:{name:'Lab Graphite',base:'#3b484c',shadow:'#202a2d',ink:'#dbe3dc',button:'#ba5d50'},
  amber:{name:'Signal Clay',base:'#c78c65',shadow:'#87573c',ink:'#291f1b',button:'#375856'}
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
