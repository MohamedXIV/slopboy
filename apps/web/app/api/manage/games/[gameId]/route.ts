import {NextRequest,NextResponse} from 'next/server';
import {isGameUuid} from '@slopboy/catalog';
import {readBoundedJson} from '../../../../../server/bounded-json';
import {currentSubject} from '../../../../../lib/auth/server';
import {sameOriginMutation} from '../../../../../lib/auth/auth-contract';
import {parseGameMetadata} from '../../../../../server/game-management-contract';
import {updateManagedGame,readManagedGame} from '../../../../../server/game-management';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const result=(error:string,status:number)=>NextResponse.json({error},{status,headers});
export async function PATCH(request:NextRequest,{params}:{params:Promise<{gameId:string}>}){
  if(!sameOriginMutation(request.headers.get('origin'),request.url,request.headers.get('sec-fetch-site'),request.headers.get('host')))return result('INVALID_ORIGIN',403);
  const subject=await currentSubject();if(!subject)return result('UNAUTHENTICATED',401);
  if(!subject.emailVerified)return result('FORBIDDEN',403);
  const {gameId}=await params;if(!isGameUuid(gameId))return result('NOT_FOUND',404);
  let body:unknown;try{body=await readBoundedJson(request,8192);}catch{return result('INVALID_INPUT',400);}
  const metadata=parseGameMetadata(body);if(!metadata)return result('INVALID_INPUT',400);
  try{
    const game=await updateManagedGame(subject.id,gameId,metadata);
    return game?NextResponse.json({game},{headers}):result('NOT_FOUND',404);
  }catch{return result('DATABASE_UNAVAILABLE',503);}
}

export async function GET(_request:NextRequest,{params}:{params:Promise<{gameId:string}>}){
  const subject=await currentSubject();if(!subject)return result('UNAUTHENTICATED',401);
  if(!subject.emailVerified)return result('FORBIDDEN',403);
  const {gameId}=await params;if(!isGameUuid(gameId))return result('NOT_FOUND',404);
  try{
    const game=await readManagedGame(subject.id,gameId);
    return game?NextResponse.json({game},{headers}):result('NOT_FOUND',404);
  }catch{return result('DATABASE_UNAVAILABLE',503);}
}
