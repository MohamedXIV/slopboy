import {NextResponse} from 'next/server';
import {isGameUuid} from '@slopboy/catalog';
import {currentSubject} from '../../../../../../lib/auth/server';
import {
  databaseConfigured,readProfile,readOwnedGameRevisions
} from '../../../../../../lib/auth/database';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

/** Metadata only. No signed downloads, runnable drafts or storage keys. */
export async function GET(_request:Request,{params}:{params:Promise<{gameId:string}>}){
  const subject=await currentSubject();
  if(!subject)return NextResponse.json({error:'UNAUTHENTICATED'},{status:401,headers});
  if(!subject.emailVerified)return NextResponse.json({error:'EMAIL_NOT_VERIFIED'},{status:403,headers});
  const {gameId}=await params;
  if(!isGameUuid(gameId))return NextResponse.json({error:'NOT_FOUND'},{status:404,headers});
  if(!databaseConfigured())
    return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});
  try{
    const profile=await readProfile(subject);
    if(!profile)return NextResponse.json({error:'PROFILE_NOT_READY'},{status:403,headers});
    const result=await readOwnedGameRevisions(subject,gameId);
    if(!result)return NextResponse.json({error:'NOT_FOUND'},{status:404,headers});
    return NextResponse.json(result,{headers});
  }catch{
    return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});
  }
}
