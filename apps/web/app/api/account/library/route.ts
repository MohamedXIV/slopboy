import {NextRequest,NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {isGameUuid} from '@slopboy/catalog';
import {sameOriginMutation} from '../../../../lib/auth/auth-contract';
import {currentSubject} from '../../../../lib/auth/server';
import {readBoundedJson} from '../../../../server/bounded-json';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const result=(error:string,status:number)=>NextResponse.json({error},{status,headers});
function database(){if(!process.env.DATABASE_URL)throw Error('DATABASE_UNAVAILABLE');return neon(process.env.DATABASE_URL);}
export async function GET(){
  const subject=await currentSubject();if(!subject)return result('UNAUTHENTICATED',401);
  if(!subject.emailVerified)return result('FORBIDDEN',403);
  try{
    const sql=database();
    const games=await sql`SELECT g.id::text AS id,g.title,g.genre FROM public.user_library l
      JOIN public.games g ON g.id=l.game_id JOIN public.game_revisions r
      ON r.id=g.current_published_revision_id AND r.game_id=g.id AND r.status='published'
      WHERE l.user_id=${subject.id}::uuid AND g.visibility='public' AND g.status='published'
      ORDER BY l.added_at DESC LIMIT 100`;
    return NextResponse.json({games},{headers});
  }catch{return result('DATABASE_UNAVAILABLE',503);}
}
export async function POST(request:NextRequest){
  if(!sameOriginMutation(request.headers.get('origin'),request.url,request.headers.get('sec-fetch-site'),request.headers.get('host')))return result('INVALID_ORIGIN',403);
  const subject=await currentSubject();if(!subject)return result('UNAUTHENTICATED',401);
  if(!subject.emailVerified)return result('FORBIDDEN',403);
  let body:unknown;try{body=await readBoundedJson(request,512);}catch{return result('INVALID_INPUT',400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).join(',')!=='gameId'||
    typeof (body as {gameId?:unknown}).gameId!=='string'||!isGameUuid((body as {gameId:string}).gameId))return result('INVALID_INPUT',400);
  const gameId=(body as {gameId:string}).gameId;
  try{
    const sql=database();
    const rows=await sql`INSERT INTO public.user_library(user_id,game_id)
      SELECT u.id,g.id FROM public.users u JOIN public.games g ON g.id=${gameId}::uuid
      JOIN public.game_revisions r ON r.id=g.current_published_revision_id AND r.game_id=g.id
      WHERE u.id=${subject.id}::uuid AND u.role<>'system' AND g.visibility='public' AND g.status='published' AND r.status='published'
      ON CONFLICT(user_id,game_id) DO UPDATE SET game_id=EXCLUDED.game_id RETURNING game_id::text AS id`;
    return rows.length?NextResponse.json({gameId},{headers}):result('NOT_FOUND',404);
  }catch{return result('DATABASE_UNAVAILABLE',503);}
}
