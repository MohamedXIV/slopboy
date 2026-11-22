import {neon} from '@neondatabase/serverless';
import {randomUUID} from 'node:crypto';
import {PLATFORM_OWNER_ID} from './game-ownership';
import {CREATE_GAME_SQL,UPDATE_GAME_SQL} from './game-management-queries';
import type {GameMetadata} from './game-management-contract';

function database(){
  const url=process.env.DATABASE_URL;
  if(!url)throw Error('DATABASE_UNAVAILABLE');
  return neon(url);
}

/** Authorization and audit occur in the same SQL statement as the mutation. */
export async function createManagedGame(actorId:string,platform:boolean,metadata:GameMetadata){
  const sql=database(),id=randomUUID();
  const rows=await sql.query(CREATE_GAME_SQL,[actorId,PLATFORM_OWNER_ID,id,platform,
    metadata.title,metadata.tagline,metadata.description,metadata.genre]);
  return rows[0]??null;
}

export async function updateManagedGame(actorId:string,gameId:string,metadata:GameMetadata){
  const sql=database();
  const rows=await sql.query(UPDATE_GAME_SQL,[actorId,PLATFORM_OWNER_ID,gameId,
    metadata.title,metadata.tagline,metadata.description,metadata.genre]);
  return rows[0]??null;
}

export async function listManagedPlatformGames(actorId:string){
  const sql=database();
  return sql`SELECT g.id::text AS id,g.title,g.tagline,g.description,g.genre,g.status,g.visibility,
    r.id::text AS revision_id,r.revision_number,r.status AS revision_status
    FROM public.games g
    LEFT JOIN LATERAL (SELECT id,revision_number,status FROM public.game_revisions
      WHERE game_id=g.id ORDER BY revision_number DESC LIMIT 1) r ON true
    WHERE g.owner_id=${PLATFORM_OWNER_ID}::uuid AND EXISTS
      (SELECT 1 FROM public.users u WHERE u.id=${actorId}::uuid AND u.role='admin' AND u.id<>${PLATFORM_OWNER_ID}::uuid)
    ORDER BY g.created_at DESC,g.id DESC LIMIT 100`;
}

/** Only the owner or a platform admin can see revision metadata. */
export async function readManagedGame(actorId:string,gameId:string){
  const sql=database();
  const rows=await sql`
    SELECT g.id::text AS id,g.title,g.tagline,g.description,g.genre,g.status,g.visibility,
      r.id::text AS revision_id,r.revision_number,r.release_version,r.status AS revision_status,
      r.engine_id,r.engine_version,r.created_at::text AS revision_created_at
    FROM public.games g JOIN public.users actor ON actor.id=${actorId}::uuid
    LEFT JOIN public.game_revisions r ON r.game_id=g.id
    WHERE g.id=${gameId}::uuid AND actor.role<>'system' AND actor.id<>${PLATFORM_OWNER_ID}::uuid AND
      ((g.owner_id=actor.id AND g.owner_id<>${PLATFORM_OWNER_ID}::uuid) OR
       (g.owner_id=${PLATFORM_OWNER_ID}::uuid AND actor.role='admin'))
    ORDER BY r.revision_number DESC NULLS LAST LIMIT 50`;
  if(!rows.length)return null;
  const row=rows[0];
  return {id:row.id,title:row.title,tagline:row.tagline,description:row.description,genre:row.genre,
    status:row.status,visibility:row.visibility,
    revisions:rows.filter(r=>r.revision_id).map(r=>({id:r.revision_id,number:r.revision_number,
      releaseVersion:r.release_version,status:r.revision_status,engine:r.engine_id,
      engineVersion:r.engine_version,createdAt:r.revision_created_at}))};
}

export async function readTrustedPreviewGame(actorId:string,gameId:string):Promise<{title:string}|null>{
  const sql=database();
  const [row]=await sql`
    SELECT g.title
    FROM public.games g JOIN public.users actor ON actor.id=g.owner_id
    WHERE g.id=${gameId}::uuid AND actor.id=${actorId}::uuid AND actor.role<>'system'
      AND g.visibility='private' AND g.status='draft'
    LIMIT 1`;
  return typeof row?.title==='string' ? {title:row.title} : null;
}
