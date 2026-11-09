import {NextRequest,NextResponse} from 'next/server';
import {currentSubject} from '../../../../lib/auth/server';
import {sameOriginMutation} from '../../../../lib/auth/auth-contract';
import {bootstrapProfile,databaseConfigured} from '../../../../lib/auth/database';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function POST(request:NextRequest){
  if(!sameOriginMutation(request.headers.get('origin'),request.url,request.headers.get('sec-fetch-site')))
    return NextResponse.json({error:'INVALID_ORIGIN'},{status:403,headers});
  const subject=await currentSubject();
  if(!subject)return NextResponse.json({error:'UNAUTHENTICATED'},{status:401,headers});
  if(!subject.emailVerified)return NextResponse.json({error:'EMAIL_NOT_VERIFIED'},{status:403,headers});
  if(!databaseConfigured())return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});
  try{
    const profile=await bootstrapProfile(subject);
    return NextResponse.json({profile},{headers});
  }catch{return NextResponse.json({error:'PROFILE_UNAVAILABLE'},{status:503,headers});}
}
