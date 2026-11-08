/** Browser-only PWA control plane. Guest IndexedDB saves are never accessed. */
export interface InstalledGame{
  readonly gameId:string;
  readonly revisionId:string;
  readonly title:string;
}
export type OfflineMessageType='SL_OP_INSTALLED'|'SL_OP_INSTALL'|'SL_OP_REMOVE';
interface WorkerAnswer{
  readonly ok:boolean;
  readonly error?:string;
  readonly games?:InstalledGame[];
  readonly game?:InstalledGame;
  readonly removed?:boolean;
}
const TIMEOUT_MS=15000;
function isInstalledGame(value:unknown):value is InstalledGame{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const v=value as Record<string,unknown>;
  return typeof v.gameId==='string'&&typeof v.revisionId==='string'&&typeof v.title==='string';
}
export async function messageOfflineWorker(type:OfflineMessageType,gameId?:string):Promise<WorkerAnswer>{
  if(typeof navigator==='undefined'||!('serviceWorker' in navigator))
    throw Error('Offline installation requires a supported browser.');
  const registration=await navigator.serviceWorker.ready;
  const worker=navigator.serviceWorker.controller??registration.active;
  if(!worker)throw Error('Offline service worker is not ready.');
  return new Promise<WorkerAnswer>((resolve,reject)=>{
    const channel=new MessageChannel();
    let completed=false;
    const finish=(error?:Error,answer?:WorkerAnswer)=>{
      if(completed)return;
      completed=true;window.clearTimeout(timer);
      channel.port1.close();
      if(error)reject(error);else if(answer)resolve(answer);
    };
    const timer=window.setTimeout(()=>finish(Error('Offline operation timed out.')),TIMEOUT_MS);
    channel.port1.onmessage=event=>{
      const data=event.data as WorkerAnswer;
      if(!data||data.ok!==true)finish(Error(data?.error||'Offline installation failed.'));
      else finish(undefined,data);
    };
    channel.port1.onmessageerror=()=>finish(Error('Offline service worker response was invalid.'));
    worker.postMessage({type,gameId},[channel.port2]);
  });
}
export async function listOfflineGames():Promise<InstalledGame[]>{
  const answer=await messageOfflineWorker('SL_OP_INSTALLED');
  return Array.isArray(answer.games)?answer.games.filter(isInstalledGame):[];
}
export async function installOfflineGame(gameId:string):Promise<InstalledGame>{
  const answer=await messageOfflineWorker('SL_OP_INSTALL',gameId);
  if(!isInstalledGame(answer.game))throw Error('Offline install acknowledgment missing.');
  return answer.game;
}
export async function removeOfflineGame(gameId:string):Promise<void>{
  const result=await messageOfflineWorker('SL_OP_REMOVE',gameId);
  if(result.removed!==true)throw Error('Game was not marked installed.');
}
