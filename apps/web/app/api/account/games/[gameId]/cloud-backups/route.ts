import {neon} from '@neondatabase/serverless';
import {isGameUuid} from '@slopboy/catalog';
import {readProfile} from '@/lib/auth/database';
import {currentSubject} from '@/lib/auth/server';
import {sameOriginMutation} from '@/lib/auth/auth-contract';
import {CLOUD_SAVE_REQUEST_MAX_BYTES,parseCloudSave} from '@/lib/cloud-save';
import {readBoundedJson} from '@/server/bounded-json';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (body:object,status=200) => Response.json(body,{
  status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'},
});
type Context = {params:Promise<{gameId:string}>};

async function backups(request:Request,{params}:Context,create:boolean) {
  if (process.env.CLOUD_SAVE_BACKUPS_ENABLED !== '1') return json({error:'NOT_FOUND'},404);
  if (create && !sameOriginMutation(request.headers.get('origin'),request.url,
    request.headers.get('sec-fetch-site'),request.headers.get('host'))) return json({error:'INVALID_ORIGIN'},403);
  const actor = await currentSubject();
  if (!actor) return json({error:'UNAUTHENTICATED'},401);
  if (!actor.emailVerified) return json({error:'FORBIDDEN'},403);
  const {gameId} = await params;
  if (!isGameUuid(gameId)) return json({error:'NOT_FOUND'},404);
  const database = process.env.DATABASE_URL;
  if (!database) return json({error:'UNAVAILABLE'},503);

  let save:string|null = null;
  if (create) {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
      return json({error:'EXPECTED_JSON'},415);
    try { save = parseCloudSave(await readBoundedJson(request,CLOUD_SAVE_REQUEST_MAX_BYTES)); }
    catch { return json({error:'INVALID_SAVE'},400); }
    if (save === null) return json({error:'INVALID_SAVE'},400);
  }

  try {
    if (!await readProfile(actor)) return json({error:'PROFILE_NOT_READY'},403);
    const sql = neon(database);
    const [row] = create
      ? await sql`SELECT public.create_cloud_save_backup(${actor.id}::uuid,${gameId}::uuid,${save}) AS result`
      : await sql`SELECT public.list_cloud_save_backups(${actor.id}::uuid,${gameId}::uuid) AS result`;
    const result = row?.result;
    if (!result || result.outcome === 'not_found') return json({error:'NOT_FOUND'},404);
    if (result.outcome === 'quota') return json({error:'BACKUP_QUOTA'},409);
    if (result.outcome === 'invalid') return json({error:'INVALID_SAVE'},400);
    return json({backups:result.backups,usedBytes:result.usedBytes},result.outcome === 'stored' ? 201 : 200);
  } catch {
    return json({error:'UNAVAILABLE'},503);
  }
}

export function GET(request:Request,context:Context){return backups(request,context,false);}
export function POST(request:Request,context:Context){return backups(request,context,true);}
