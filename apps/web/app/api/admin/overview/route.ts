import {NextResponse} from 'next/server';
import {currentSubject} from '../../../../lib/auth/server';
import {databaseConfigured,readProfile} from '../../../../lib/auth/database';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(){
  const subject=await currentSubject();
  if(!subject)return NextResponse.json({error:'UNAUTHENTICATED'},{status:401,headers});
  if(!subject.emailVerified)return NextResponse.json({error:'FORBIDDEN'},{status:403,headers});
  if(!databaseConfigured())return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});
  try{
    const profile=await readProfile(subject);
    if(profile?.role!=='admin')return NextResponse.json({error:'FORBIDDEN'},{status:403,headers});
    return NextResponse.json({status:'authorized',adminId:subject.id},{headers});
  }catch{return NextResponse.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});}
}
