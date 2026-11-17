import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {isGameUuid} from '@slopboy/catalog';
import {currentSubject} from '../../../../../../lib/auth/server';
import {sameOriginMutation} from '../../../../../../lib/auth/auth-contract';
import {PLATFORM_OWNER_ID} from '../../../../../../server/game-ownership';
import {READ_SOURCE_DRAFT_SQL,CREATE_SOURCE_DRAFT_SQL} from '../../../../../../server/source-draft-queries';
import {readBoundedJson} from '../../../../../../server/bounded-json';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const result=(error:string,status:number)=>NextResponse.json({error},{status,headers});
function database(){if(!process.env.DATABASE_URL)throw Error('DATABASE_UNAVAILABLE');return neon(process.env.DATABASE_URL);}
export async function GET(_request:NextRequest,{params}:{params:Promise<{gameId:string}>}){
  const subject=await currentSubject();if(!subject)return result('UNAUTHENTICATED',401);
  if(!subject.emailVerified)return result('FORBIDDEN',403);
  const {gameId}=await params;if(!isGameUuid(gameId))return result('NOT_FOUND',404);
  try{
    const sql=database();
    const rows=await sql.query(READ_SOURCE_DRAFT_SQL,[subject.id,gameId,PLATFORM_OWNER_ID]);
    if(!rows.length)return result('NOT_FOUND',404);
    const row=rows[0];return NextResponse.json({draft:row.id?{id:row.id,language:row.language,source:row.source_text,createdAt:row.created_at}:null},{headers});
  }catch{return result('DATABASE_UNAVAILABLE',503);}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{gameId:string}>}){
  if(!sameOriginMutation(request.headers.get('origin'),request.url,request.headers.get('sec-fetch-site'),request.headers.get('host')))return result('INVALID_ORIGIN',403);
  const subject=await currentSubject();if(!subject)return result('UNAUTHENTICATED',401);
  if(!subject.emailVerified)return result('FORBIDDEN',403);
  const {gameId}=await params;if(!isGameUuid(gameId))return result('NOT_FOUND',404);
  let body:unknown;try{body=await readBoundedJson(request,100000);}catch{return result('INVALID_INPUT',400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return result('INVALID_INPUT',400);
  const data=body as Record<string,unknown>;
  if(Object.keys(data).sort().join(',')!=='language,source'||!['typescript','javascript'].includes(String(data.language))||
    typeof data.source!=='string'||data.source.includes('\0')||!data.source.trim()||new TextEncoder().encode(data.source).length>65536)return result('INVALID_INPUT',400);
  try{
    const sql=database(),id=randomUUID();
    const rows=await sql.query(CREATE_SOURCE_DRAFT_SQL,[subject.id,gameId,PLATFORM_OWNER_ID,id,String(data.language),data.source]);
    return rows.length?NextResponse.json({id:rows[0].id},{status:201,headers}):result('NOT_FOUND',404);
  }catch{return result('DATABASE_UNAVAILABLE',503);}
}
