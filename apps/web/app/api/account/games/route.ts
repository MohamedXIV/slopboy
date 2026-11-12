import {NextResponse} from 'next/server';
import {currentSubject} from '../../../../lib/auth/server';
import {databaseConfigured,listOwnedGames,readProfile} from '../../../../lib/auth/database';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(){
  const subject=await currentSubject();
  if(!subject)return NextResponse.json({error:'UNAUTHENTICATED'},{status:401,headers});
  if(!subject.emailVerified)return NextResponse.json({error:'EMAIL_NOT_VERIFIED'},{status:403,headers});
  if(!databaseConfigured())return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});
  try{
    const profile=await readProfile(subject);
    if(!profile)return NextResponse.json({error:'PROFILE_NOT_READY'},{status:403,headers});
    const games=await listOwnedGames(subject);
    return NextResponse.json({games},{headers});
  }catch{return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});}
}
