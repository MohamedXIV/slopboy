/** Guest-local play history. Never use this data as trusted achievements or currency. */
export const HISTORY_PREFIX='slopboy:v2:history:v1:';
export interface GameHistory {
  readonly gameId:string;
  readonly launches:number;
  readonly activeMs:number;
  readonly lastPlayedAt:number|null;
  /** Optional future *verified* story milestones; current arcade games don't report this. */
  readonly story?:{readonly completed:number;readonly total:number};
}
export interface KeyValueStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
}
const VALID_ID=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ELAPSED_MS=30000;
const MAX_SAFE=Number.MAX_SAFE_INTEGER;
const empty=(gameId:string):GameHistory=>({gameId,launches:0,activeMs:0,lastPlayedAt:null});
const nonnegative=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0?Number(n):0;
export function readGameHistory(storage:Pick<KeyValueStorage,'getItem'>,gameId:string):GameHistory {
  if(!VALID_ID.test(gameId))throw Error('Invalid game ID');
  try {
    const data=storage.getItem(HISTORY_PREFIX+gameId);
    if(!data)return empty(gameId);
    const parsed:unknown=JSON.parse(data);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return empty(gameId);
    const r=parsed as Record<string,unknown>;
    const result:GameHistory={
      gameId,launches:nonnegative(r.launches),
      activeMs:nonnegative(r.activeMs),
      lastPlayedAt:Number.isSafeInteger(r.lastPlayedAt)&&Number(r.lastPlayedAt)>0?Number(r.lastPlayedAt):null
    };
    const story=r.story;
    if(story&&typeof story==='object'&&!Array.isArray(story)){
      const value=story as Record<string,unknown>;
      const total=nonnegative(value.total),completed=nonnegative(value.completed);
      if(total>0&&completed<=total)return {...result,story:{completed,total}};
    }
    return result;
  }catch{return empty(gameId);}
}
export function recordGameLaunch(storage:KeyValueStorage,gameId:string,now=Date.now()):GameHistory {
  const original=readGameHistory(storage,gameId);
  const updated:GameHistory={...original,launches:Math.min(MAX_SAFE,original.launches+1),
    lastPlayedAt:Number.isSafeInteger(now)&&now>0?now:Date.now()};
  storage.setItem(HISTORY_PREFIX+gameId,JSON.stringify(updated));
  return updated;
}
export function recordActivePlaytime(storage:KeyValueStorage,gameId:string,elapsedMs:number):GameHistory {
  const original=readGameHistory(storage,gameId);
  const amount=Number.isFinite(elapsedMs)?Math.max(0,Math.min(MAX_ELAPSED_MS,Math.floor(elapsedMs))):0;
  const updated:GameHistory={...original,activeMs:Math.min(MAX_SAFE,original.activeMs+amount)};
  if(amount)storage.setItem(HISTORY_PREFIX+gameId,JSON.stringify(updated));
  return updated;
}
export function formatActiveTime(ms:number):string {
  const minutes=Math.floor(Math.max(0,ms)/60000);
  if(!minutes)return 'Under a minute';
  if(minutes<60)return minutes+' min';
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return rest?hours+' hr '+rest+' min':hours+' hr';
}
export function getBrowserHistory(gameId:string):GameHistory {
  try{return readGameHistory(window.localStorage,gameId);}catch{return empty(gameId);}
}
export function trackBrowserLaunch(gameId:string):void{
  try{recordGameLaunch(window.localStorage,gameId);}catch{/* Private storage may be blocked. */}
}
export function trackBrowserPlaytime(gameId:string,elapsedMs:number):void{
  try{recordActivePlaytime(window.localStorage,gameId,elapsedMs);}catch{/* Play must not depend on analytics. */}
}
