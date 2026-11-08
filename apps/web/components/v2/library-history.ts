import {getCatalogGame,isGameUuid} from '@slopboy/catalog';

/** Guest-local telemetry only; never trust for entitlements or Slop Coins. */
export const HISTORY_PREFIX='slopboy:v2:history:v2:';
export const LEGACY_HISTORY_PREFIX='slopboy:v2:history:v1:';
export interface GameHistory{
  readonly gameId:string;
  readonly launches:number;
  readonly activeMs:number;
  readonly lastPlayedAt:number|null;
  readonly story?:{readonly completed:number;readonly total:number};
}
export interface KeyValueStorage{
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
}
const MAX_ELAPSED_MS=30000;
const MAX_SAFE=Number.MAX_SAFE_INTEGER;
const empty=(gameId:string):GameHistory=>({gameId,launches:0,activeMs:0,lastPlayedAt:null});
const nonnegative=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0?Number(value):0;
function parse(raw:string|null,gameId:string,legacy=false):GameHistory|null{
  if(!raw)return null;
  try{
    const value:unknown=JSON.parse(raw);
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const r=value as Record<string,unknown>;
    if(!legacy&&(r.schemaVersion!==2||r.gameId!==gameId))return null;
    const result:GameHistory={
      gameId,launches:nonnegative(r.launches),activeMs:nonnegative(r.activeMs),
      lastPlayedAt:Number.isSafeInteger(r.lastPlayedAt)&&Number(r.lastPlayedAt)>0?Number(r.lastPlayedAt):null
    };
    const story=r.story;
    if(story&&typeof story==='object'&&!Array.isArray(story)){
      const s=story as Record<string,unknown>;
      const total=nonnegative(s.total),completed=nonnegative(s.completed);
      if(total>0&&completed<=total)return {...result,story:{completed,total}};
    }
    return result;
  }catch{return null;}
}
function encode(record:GameHistory):string{return JSON.stringify({schemaVersion:2,...record});}
export function readGameHistory(storage:Pick<KeyValueStorage,'getItem'> & Partial<Pick<KeyValueStorage,'setItem'>>,gameId:string):GameHistory{
  if(!isGameUuid(gameId))throw Error('Invalid game UUID');
  const canonical=HISTORY_PREFIX+gameId;
  let current:string|null=null;
  try{current=storage.getItem(canonical);}catch{return empty(gameId);}
  const parsed=parse(current,gameId);
  if(parsed)return parsed;
  const legacySlug=getCatalogGame(gameId)?.legacySlug;
  if(!legacySlug)return empty(gameId);
  let original:GameHistory|null=null;
  try{original=parse(storage.getItem(LEGACY_HISTORY_PREFIX+legacySlug),gameId,true);}catch{/* storage denied */}
  if(!original)return empty(gameId);
  if(current===null){
    try{storage.setItem?.(canonical,encode(original));}
    catch{/* Read fallback keeps old stats visible even when copy fails. */}
  }
  return original;
}
export function recordGameLaunch(storage:KeyValueStorage,gameId:string,now=Date.now()):GameHistory{
  const original=readGameHistory(storage,gameId);
  const updated:GameHistory={...original,launches:Math.min(MAX_SAFE,original.launches+1),
    lastPlayedAt:Number.isSafeInteger(now)&&now>0?now:Date.now()};
  storage.setItem(HISTORY_PREFIX+gameId,encode(updated));
  return updated;
}
export function recordActivePlaytime(storage:KeyValueStorage,gameId:string,elapsedMs:number):GameHistory{
  const original=readGameHistory(storage,gameId);
  const amount=Number.isFinite(elapsedMs)?Math.max(0,Math.min(MAX_ELAPSED_MS,Math.floor(elapsedMs))):0;
  const updated:GameHistory={...original,activeMs:Math.min(MAX_SAFE,original.activeMs+amount)};
  if(amount)storage.setItem(HISTORY_PREFIX+gameId,encode(updated));
  return updated;
}
export function formatActiveTime(ms:number):string{
  const minutes=Math.floor(Math.max(0,ms)/60000);
  if(!minutes)return 'Under a minute';
  if(minutes<60)return minutes+' min';
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return rest?hours+' hr '+rest+' min':hours+' hr';
}
export function getBrowserHistory(gameId:string):GameHistory{
  try{return readGameHistory(window.localStorage,gameId);}catch{return empty(gameId);}
}
export function trackBrowserLaunch(gameId:string):void{
  try{recordGameLaunch(window.localStorage,gameId);}catch{/* Analytics must not block play. */}
}
export function trackBrowserPlaytime(gameId:string,elapsedMs:number):void{
  try{recordActivePlaytime(window.localStorage,gameId,elapsedMs);}catch{/* Analytics must not block play. */}
}
