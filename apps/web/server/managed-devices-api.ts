/** Private, bounded device discovery; contains no payloads, keys or user identifiers. */
import {isGameUuid} from '../../../packages/catalog/src/index.ts';
type Actor={id:string;emailVerified:boolean};
export interface ManagedDevicesDependencies {
  enabled():boolean;subject():Promise<Actor|null>;role(actor:Actor):Promise<unknown>;
  consumeRequest(account:string):Promise<boolean>;list(account:string,game:string):Promise<unknown>;
}
const json=(value:object,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const error=(code:string,status:number)=>json({error:code},status);
export type ManagedDevice={deviceId:string;count:number;lastSavedAt:string};
export function parseManagedDevices(value:unknown):ManagedDevice[]{
  if(!Array.isArray(value)||value.length>100)throw Error('INVALID_DEVICE_LIST');
  const ids=new Set<string>();let total=0;
  return value.map(row=>{
    if(!row||typeof row!=='object'||typeof row.deviceId!=='string'||!isGameUuid(row.deviceId)||ids.has(row.deviceId)||
      !Number.isSafeInteger(row.count)||row.count<1||row.count>5||typeof row.lastSavedAt!=='string'||!Number.isFinite(Date.parse(row.lastSavedAt)))throw Error('INVALID_DEVICE_LIST');
    ids.add(row.deviceId);total+=row.count;if(total>100)throw Error('INVALID_DEVICE_LIST');
    return {deviceId:row.deviceId,count:row.count,lastSavedAt:row.lastSavedAt};
  });
}
export async function handleManagedDevices(request:Request,gameId:string,deps:ManagedDevicesDependencies):Promise<Response>{
  try{
    if(!deps.enabled())return error('NOT_FOUND',404);
    if(request.method!=='GET')return error('METHOD_NOT_ALLOWED',405);
    if(['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??''))return error('INVALID_ORIGIN',403);
    if(new URL(request.url).search)return error('INVALID_QUERY',400);
    const actor=await deps.subject();
    if(!actor)return error('UNAUTHENTICATED',401);
    if(!actor.emailVerified)return error('FORBIDDEN',403);
    if(!isGameUuid(actor.id)||!isGameUuid(gameId))return error('NOT_FOUND',404);
    const account=actor.id.toLowerCase();
    if(request.headers.get('x-slopboy-sync-account')!==account)return error('SYNC_SCOPE_MISMATCH',403);
    if(await deps.role(actor)!=='admin')return error('NOT_FOUND',404);
    if(!await deps.consumeRequest(account))return error('CLOUD_RATE_LIMIT',429);
    const rows=await deps.list(account,gameId.toLowerCase());
    return rows===null?error('NOT_FOUND',404):json({devices:parseManagedDevices(rows)});
  }catch{return error('UNAVAILABLE',503);}
}
