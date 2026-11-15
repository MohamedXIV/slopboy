import {neon} from '@neondatabase/serverless';
import {isGameUuid} from '@slopboy/catalog';
import {
  LIST_OWNED_GAMES_SQL,OWNER_GAMES_PAGE_SIZE,
  OWNER_REVISION_HISTORY_LIMIT,READ_OWNED_REVISIONS_SQL,
} from '../../server/owner-revision-queries';
import type {Subject} from './auth-contract';

/** SQL is available only in the server runtime with an isolated Neon URL. */
function sqlClient(){
  const url=process.env.DATABASE_URL;
  if(!url)return null;
  try{
    const parsed=new URL(url);
    if(!['postgresql:','postgres:'].includes(parsed.protocol)||!parsed.hostname)return null;
    return neon(url);
  }catch{return null;}
}
export function databaseConfigured():boolean{return sqlClient()!==null;}
export interface DatabaseProfile{readonly id:string;readonly displayName:string;readonly role:'player'|'creator'|'admin'|'system'}
export interface OwnerRevision{
  readonly id:string;readonly revisionNumber:number;readonly releaseVersion:string|null;
  readonly status:string;readonly engineId:string;readonly engineVersion:string;
  readonly deviceProfile:string|null;readonly createdAt:string|null;
}
export interface OwnerGame{
  readonly id:string;readonly title:string;readonly status:string;readonly visibility:string;
  readonly latestRevision:OwnerRevision|null;
}
export interface OwnedGameHistory{
  readonly gameId:string;
  readonly revisions:readonly OwnerRevision[];
}
/** Source and storage locations are deliberately NEVER returned to browser clients. */
function parseOwnerRevision(row:Record<string,unknown>,prefix:string):OwnerRevision|null{
  const id=row[prefix+'revision_id'];
  if(id===null||id===undefined)return null;
  const revisionNumber=row[prefix+'revision_number'];
  if(!isGameUuid(String(id))||typeof revisionNumber!=='number'||
    !Number.isSafeInteger(revisionNumber)||revisionNumber<1||
    typeof row[prefix+'revision_status']!=='string'||
    typeof row[prefix+'engine_id']!=='string'||
    typeof row[prefix+'engine_version']!=='string'){
    throw Error('INVALID_REVISION_METADATA');
  }
  const nullable=(value:unknown):string|null=>typeof value==='string'?value:null;
  return {id:String(id),revisionNumber,releaseVersion:nullable(row[prefix+'release_version']),
    status:String(row[prefix+'revision_status']),
    engineId:String(row[prefix+'engine_id']),engineVersion:String(row[prefix+'engine_version']),
    deviceProfile:nullable(row[prefix+'device_profile']),
    createdAt:nullable(row[prefix+'revision_created_at'])};
}
function profile(row:Record<string,unknown>|undefined):DatabaseProfile|null{
  if(!row||typeof row.id!=='string'||typeof row.display_name!=='string'||
    !['player','creator','admin','system'].includes(String(row.role)))return null;
  return {id:row.id,displayName:row.display_name,role:row.role as DatabaseProfile['role']};
}

/** No role or ID is accepted from the request. Only a Neon-verified subject can bootstrap. */
export async function bootstrapProfile(subject:Subject):Promise<DatabaseProfile>{
  if(!subject.emailVerified)throw Error('EMAIL_NOT_VERIFIED');
  const sql=sqlClient();if(!sql)throw Error('DATABASE_UNAVAILABLE');
  const rows=await sql`
    INSERT INTO public.users(id,email,display_name)
    VALUES (${subject.id}::uuid,${subject.email},${subject.displayName})
    ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name
    RETURNING id,display_name,role
  `;
  const result=profile(rows[0]);if(!result||result.id!==subject.id)throw Error('PROFILE_FAILED');
  return result;
}
export async function readProfile(subject:Subject):Promise<DatabaseProfile|null>{
  const sql=sqlClient();if(!sql)throw Error('DATABASE_UNAVAILABLE');
  const rows=await sql`SELECT id,display_name,role FROM public.users WHERE id=${subject.id}::uuid LIMIT 1`;
  const result=profile(rows[0]);return result?.id===subject.id?result:null;
}
/** Only the verified server session subject is an owner; arbitrary query
 * parameters, roles and even admin users cannot widen access to other owners. */
export async function listOwnedGames(subject:Subject):Promise<readonly OwnerGame[]>{
  const sql=sqlClient();if(!sql)throw Error('DATABASE_UNAVAILABLE');
  const rows=await sql.query(LIST_OWNED_GAMES_SQL,[subject.id,OWNER_GAMES_PAGE_SIZE]);
  return rows.map(row=>{
    if(!isGameUuid(String(row.id))||typeof row.title!=='string'||
      typeof row.status!=='string'||typeof row.visibility!=='string')
      throw Error('INVALID_OWNED_GAME_METADATA');
    return {id:String(row.id),title:String(row.title),
      status:String(row.status),visibility:String(row.visibility),
      latestRevision:parseOwnerRevision(row as Record<string,unknown>,'latest_')};
  });
}

/** A real owned game with no revisions returns [], not 404.
 * An unknown or foreign game returns null, with no existence leak. */
export async function readOwnedGameRevisions(
  subject:Subject,gameId:string
):Promise<OwnedGameHistory|null>{
  if(!isGameUuid(gameId))return null;
  const sql=sqlClient();if(!sql)throw Error('DATABASE_UNAVAILABLE');
  const rows=await sql.query(READ_OWNED_REVISIONS_SQL,
    [gameId,subject.id,OWNER_REVISION_HISTORY_LIMIT]);
  if(rows.length===0)return null;
  const revisions:OwnerRevision[]=[];
  for(const row of rows){
    if(row.game_id!==gameId)throw Error('INVALID_OWNED_GAME_METADATA');
    const revision=parseOwnerRevision(row as Record<string,unknown>,'');
    if(revision)revisions.push(revision);
  }
  return {gameId,revisions};
}
