import {currentSubject} from '@/lib/auth/server';
import {readProfile} from '@/lib/auth/database';
import {managedCloudEnabled} from '@/server/named-cloud-api';
import {cloudStorageReady} from '@/server/cloud-backup-storage';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const json=(value:object,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(request:Request){
  if(!managedCloudEnabled(process.env)||!cloudStorageReady())return json({error:'NOT_FOUND'},404);
  if(['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??''))return json({error:'INVALID_ORIGIN'},403);
  try{
    const actor=await currentSubject();
    if(!actor)return json({error:'UNAUTHENTICATED'},401);
    if(!actor.emailVerified)return json({error:'FORBIDDEN'},403);
    if((await readProfile(actor))?.role!=='admin')return json({error:'NOT_FOUND'},404);
    return json({accountId:actor.id.toLowerCase()});
  }catch{return json({error:'UNAVAILABLE'},503);}
}
