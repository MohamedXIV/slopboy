import {NextRequest,NextResponse} from 'next/server';
import {readBoundedJson} from '../../../../server/bounded-json';
import {currentSubject} from '../../../../lib/auth/server';
import {sameOriginMutation} from '../../../../lib/auth/auth-contract';
import {readProfile} from '../../../../lib/auth/database';
import {canManagePlatformGames} from '../../../../server/game-ownership';
import {parseGameMetadata} from '../../../../server/game-management-contract';
import {createManagedGame,listManagedPlatformGames} from '../../../../server/game-management';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const result=(error:string,status:number)=>NextResponse.json({error},{status,headers});
export async function GET(){
  const subject=await currentSubject();
  if(!subject)return result('UNAUTHENTICATED',401);
  if(!subject.emailVerified)return result('FORBIDDEN',403);
  try{
    const profile=await readProfile(subject);
    if(!canManagePlatformGames(profile))return result('FORBIDDEN',403);
    return NextResponse.json({games:await listManagedPlatformGames(subject.id)},{headers});
  }catch{return result('DATABASE_UNAVAILABLE',503);}
}
export async function POST(request:NextRequest){
  if(!sameOriginMutation(request.headers.get('origin'),request.url,request.headers.get('sec-fetch-site'),request.headers.get('host')))return result('INVALID_ORIGIN',403);
  const subject=await currentSubject();
  if(!subject)return result('UNAUTHENTICATED',401);
  if(!subject.emailVerified)return result('FORBIDDEN',403);
  let body:unknown;try{body=await readBoundedJson(request,8192);}catch{return result('INVALID_INPUT',400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return result('INVALID_INPUT',400);
  const input=body as Record<string,unknown>;
  if(Object.keys(input).some(key=>key!=='metadata'&&key!=='platform')||typeof input.platform!=='boolean')return result('INVALID_INPUT',400);
  const metadata=parseGameMetadata(input.metadata);if(!metadata)return result('INVALID_INPUT',400);
  try{
    const profile=await readProfile(subject);
    if(!profile||profile.role==='system'||(input.platform&&!canManagePlatformGames(profile)))return result('FORBIDDEN',403);
    const game=await createManagedGame(subject.id,input.platform,metadata);
    return game?NextResponse.json({game},{status:201,headers}):result('FORBIDDEN',403);
  }catch{return result('DATABASE_UNAVAILABLE',503);}
}
