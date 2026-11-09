import {neon} from '@neondatabase/serverless';
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
export interface OwnerGame{readonly id:string;readonly title:string;readonly status:string;readonly visibility:string}
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
    INSERT INTO public.users(id,email,display_name,role)
    VALUES (${subject.id}::uuid,${subject.email},${subject.displayName},'player')
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
/** Only the authenticated owner is in the SQL predicate; no browser-supplied ID. */
export async function listOwnedGames(subject:Subject):Promise<readonly OwnerGame[]>{
  const sql=sqlClient();if(!sql)throw Error('DATABASE_UNAVAILABLE');
  const rows=await sql`
    SELECT id,title,status,visibility FROM public.games
    WHERE owner_id=${subject.id}::uuid ORDER BY created_at DESC,id DESC LIMIT 50
  `;
  return rows.filter(r=>typeof r.id==='string'&&typeof r.title==='string')
    .map(r=>({id:String(r.id),title:String(r.title),
      status:String(r.status),visibility:String(r.visibility)}));
}
