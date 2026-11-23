import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {isGameUuid} from '@slopboy/catalog';
import {readProfile} from '@/lib/auth/database';
import {currentSubject} from '@/lib/auth/server';
import {sameOriginMutation} from '@/lib/auth/auth-contract';
import {CLOUD_SAVE_REQUEST_MAX_BYTES,parseCloudSave} from '@/lib/cloud-save';
import {cloudStorageReady,uploadCloudSave,removeUnconfirmedCloudSave} from '@/server/cloud-backup-storage';
import {readBoundedJson} from '@/server/bounded-json';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const json=(body:object,status=200)=>Response.json(body,{status,headers:{
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
}});
type Context={params:Promise<{gameId:string}>};
type Reservation={outcome:string;backupId?:string;storageKey?:string;backups?:unknown;usedBytes?:number};

async function backups(request:Request,{params}:Context,create:boolean){
  // Fail closed until real provider create-only PUT behavior is verified.
  if(!cloudStorageReady()) return json({error:'NOT_FOUND'},404);
  if(create&&!sameOriginMutation(request.headers.get('origin'),request.url,
    request.headers.get('sec-fetch-site'),request.headers.get('host')))
    return json({error:'INVALID_ORIGIN'},403);
  const actor=await currentSubject();
  if(!actor) return json({error:'UNAUTHENTICATED'},401);
  if(!actor.emailVerified) return json({error:'FORBIDDEN'},403);
  const {gameId}=await params;
  if(!isGameUuid(gameId)) return json({error:'NOT_FOUND'},404);
  const database=process.env.DATABASE_URL;
  if(!database) return json({error:'UNAVAILABLE'},503);
  let save:string|null=null;
  if(create){
    if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')
      return json({error:'EXPECTED_JSON'},415);
    try{save=parseCloudSave(await readBoundedJson(request,CLOUD_SAVE_REQUEST_MAX_BYTES));}
    catch{return json({error:'INVALID_SAVE'},400);}
    if(save===null) return json({error:'INVALID_SAVE'},400);
  }
  try{
    if(!await readProfile(actor)) return json({error:'PROFILE_NOT_READY'},403);
    const sql=neon(database);
    if(!create){
      const [row]=await sql`SELECT public.list_cloud_save_backups(${actor.id}::uuid,${gameId}::uuid) AS result`;
      return row?.result?json({backups:row.result.backups,usedBytes:row.result.usedBytes})
        :json({error:'NOT_FOUND'},404);
    }
    const bytes=Buffer.from(save!,'utf8');
    const digest=createHash('sha256').update(bytes).digest('hex');
    const [reserved]=await sql`SELECT public.reserve_cloud_save_backup(${actor.id}::uuid,${gameId}::uuid,${digest},${bytes.length}) AS result`;
    const reservation=reserved?.result as Reservation|undefined;
    if(!reservation||reservation.outcome==='not_found') return json({error:'NOT_FOUND'},404);
    if(reservation.outcome==='quota') return json({error:'BACKUP_QUOTA'},409);
    if(reservation.outcome==='in_progress') return json({error:'BACKUP_IN_PROGRESS'},409);
    if(reservation.outcome==='invalid') return json({error:'INVALID_SAVE'},400);
    if(reservation.outcome==='replayed')
      return json({backups:reservation.backups,usedBytes:reservation.usedBytes});
    if(reservation.outcome!=='reserved'||!reservation.backupId||!reservation.storageKey)
      return json({error:'UNAVAILABLE'},503);
    try{
      await uploadCloudSave(reservation.storageKey,actor.id,gameId,reservation.backupId,digest,bytes);
      const [confirmed]=await sql`SELECT public.confirm_cloud_save_backup(${actor.id}::uuid,${gameId}::uuid,${reservation.backupId}::uuid) AS result`;
      if(!['stored','replayed'].includes(confirmed?.result?.outcome??''))
        throw new Error('BACKUP_CONFIRMATION_FAILED');
      return json({backups:confirmed.result.backups,usedBytes:confirmed.result.usedBytes},
        confirmed.result.outcome==='stored'?201:200);
    }catch{
      // Interrupted calls need an orphan sweep before broad rollout.
      try{
        await sql`SELECT public.release_cloud_save_backup(${actor.id}::uuid,${gameId}::uuid,${reservation.backupId}::uuid)`;
      }catch{}
      try{
        await removeUnconfirmedCloudSave(reservation.storageKey,actor.id,gameId,reservation.backupId,digest);
      }catch{}
      return json({error:'UNAVAILABLE'},503);
    }
  }catch{return json({error:'UNAVAILABLE'},503);}
}
export function GET(request:Request,context:Context){return backups(request,context,false);}
export function POST(request:Request,context:Context){return backups(request,context,true);}
