/** Engine-independent, purely cosmetic screen presentation. No hardware resource caps. */
export type ScreenFxPreset = 'clean'|'lcd'|'phosphor'|'custom';
export type ScreenRefresh = 'native'|'30'|'20';
export type ScreenFxLevel = 'pixelGrid'|'glow'|'scanlines'|'ghosting'|'curvature'|'glass'|'noise'|'vignette';
export const SCREEN_FX_LEVELS:readonly {key:ScreenFxLevel;label:string}[]=[
  {key:'pixelGrid',label:'Pixel matrix'},
  {key:'glow',label:'Phosphor glow'},
  {key:'scanlines',label:'Scanlines'},
  {key:'ghosting',label:'Pixel persistence'},
  {key:'curvature',label:'Screen curvature'},
  {key:'glass',label:'Glass reflections'},
  {key:'noise',label:'Static grain'},
  {key:'vignette',label:'Edge shading'}
];
export type ScreenFxSettings = Readonly<{
  enabled:boolean;
  preset:ScreenFxPreset;
  refresh:ScreenRefresh;
  pixelGrid:number; glow:number; scanlines:number; ghosting:number;
  curvature:number; glass:number; noise:number; vignette:number;
}>;
export const SCREEN_FX_STORAGE_KEY='slopboy:v2:screen-fx:v1';
export const SCREEN_FX_PRESETS:Readonly<Record<Exclude<ScreenFxPreset,'custom'>,ScreenFxSettings>>={
  clean:{enabled:true,preset:'clean',refresh:'native',pixelGrid:0,glow:0,scanlines:0,ghosting:0,curvature:0,glass:0,noise:0,vignette:0},
  lcd:{enabled:true,preset:'lcd',refresh:'native',pixelGrid:42,glow:4,scanlines:0,ghosting:6,curvature:0,glass:14,noise:0,vignette:10},
  phosphor:{enabled:true,preset:'phosphor',refresh:'native',pixelGrid:12,glow:52,scanlines:25,ghosting:26,curvature:18,glass:30,noise:8,vignette:32}
};
export const DEFAULT_SCREEN_FX=SCREEN_FX_PRESETS.lcd;
const clamp=(n:number)=>Number.isFinite(n)?Math.min(100,Math.max(0,n)):0;
export function sanitizeScreenFx(input:unknown):ScreenFxSettings{
  if(!input||typeof input!=='object'||Array.isArray(input))return DEFAULT_SCREEN_FX;
  const value=input as Record<string,unknown>;
  const preset:ScreenFxPreset=['clean','lcd','phosphor','custom'].includes(String(value.preset))?value.preset as ScreenFxPreset:'custom';
  const refresh:ScreenRefresh=['native','30','20'].includes(String(value.refresh))?value.refresh as ScreenRefresh:'native';
  const result:Record<string,unknown>={enabled:typeof value.enabled==='boolean'?value.enabled:true,preset,refresh};
  for(const {key} of SCREEN_FX_LEVELS)result[key]=typeof value[key]==='number'?clamp(value[key]):DEFAULT_SCREEN_FX[key];
  return result as ScreenFxSettings;
}
export function isScreenFxActive(config:ScreenFxSettings):boolean{
  return config.enabled&&(config.refresh!=='native'||SCREEN_FX_LEVELS.some(({key})=>config[key]>0));
}
export function editScreenFx(config:ScreenFxSettings,key:ScreenFxLevel,value:number):ScreenFxSettings{
  return {...config,enabled:true,preset:'custom',[key]:clamp(value)};
}
