import {NextRequest,NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {isGameUuid} from '@slopboy/catalog';
import {currentSubject} from '../../../../../../lib/auth/server';
import {PLATFORM_OWNER_ID} from '../../../../../../server/game-ownership';
import {READ_SOURCE_DRAFT_SQL} from '../../../../../../server/source-draft-queries';
import {submitPrivateSource} from '../../../../../../server/private-source-request';
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
    const row=rows[0];return NextResponse.json({draft:row.id?{id:row.id,language:row.language,source:row.source_text,createdAt:row.created_at, manifest:row.engine_manifest, checksum:row.source_digest}:null},{headers});
  }catch{return result('DATABASE_UNAVAILABLE',503);}
}
export async function POST(request: NextRequest,{params}:{params:Promise<{gameId:string}>}){
  return submitPrivateSource(request,(await params).gameId);
}
