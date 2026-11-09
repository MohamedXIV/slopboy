import {NextResponse} from 'next/server';
import {serverAuth,currentSubject} from '../../../../lib/auth/server';
import {databaseConfigured,readProfile} from '../../../../lib/auth/database';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(){
  if(!serverAuth())return NextResponse.json({error:'AUTH_NOT_CONFIGURED'},{status:503,headers});
  const s=await currentSubject();
  if(!s)return NextResponse.json({error:'UNAUTHENTICATED'},{status:401,headers});
  let profile=null;
  if(databaseConfigured()){
    try{profile=await readProfile(s);}
    catch{return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});}
  }
  return NextResponse.json({user:{id:s.id,email:s.email,displayName:s.displayName,
    emailVerified:s.emailVerified},profile,expiresAt:s.expiresAt},{headers});
}
