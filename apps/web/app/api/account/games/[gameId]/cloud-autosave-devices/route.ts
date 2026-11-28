import {neon} from '@neondatabase/serverless';
import {currentSubject} from '@/lib/auth/server';
import {readProfile} from '@/lib/auth/database';
import {cloudStorageReady} from '@/server/cloud-backup-storage';
import {managedCloudEnabled} from '@/server/named-cloud-api';
import {handleManagedDevices} from '@/server/managed-devices-api';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{gameId:string}>}){
  let verified:Awaited<ReturnType<typeof currentSubject>>=null;
  const sql=()=>{if(!process.env.DATABASE_URL)throw Error('DATABASE_UNAVAILABLE');return neon(process.env.DATABASE_URL);};
  return handleManagedDevices(request,(await params).gameId,{
    enabled:()=>managedCloudEnabled(process.env)&&cloudStorageReady(),
    subject:async()=>{verified=await currentSubject();return verified;},
    role:async actor=>verified&&verified.id===actor.id?(await readProfile(verified))?.role:null,
    consumeRequest:async account=>{const [row]=await sql()`SELECT public.consume_named_cloud_request(${account}::uuid) AS allowed`;return row?.allowed===true;},
    list:async(account,game)=>{const [row]=await sql()`SELECT public.list_atomic_managed_devices(${account}::uuid,${game}::uuid) AS result`;return row?.result??null;},
  });
}
