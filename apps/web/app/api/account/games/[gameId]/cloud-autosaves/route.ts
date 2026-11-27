import {neon} from '@neondatabase/serverless';
import {readProfile} from '@/lib/auth/database';
import {currentSubject} from '@/lib/auth/server';
import {readPlayableGame} from '@/server/playable-catalog';
import {cloudStorageReady} from '@/server/cloud-backup-storage';
import {handleNamedCloud,managedCloudEnabled,type AtomicManagedDependencies,type ManagedCloudScope} from '@/server/named-cloud-api';

export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{gameId:string}>};
function dependencies(scope:ManagedCloudScope):AtomicManagedDependencies{
  const sql=()=>{
    if(!process.env.DATABASE_URL)throw Error('DATABASE_UNAVAILABLE');
    return neon(process.env.DATABASE_URL);
  };
  let verified:Awaited<ReturnType<typeof currentSubject>>=null;
  return {
    enabled:()=>managedCloudEnabled(process.env)&&cloudStorageReady(),
    subject:async()=>{verified=await currentSubject();return verified;},
    role:async actor=>verified&&verified.id===actor.id?(await readProfile(verified))?.role:null,
    game:readPlayableGame,
    consumeRequest:async account=>{
      const [row]=await sql()`SELECT public.consume_named_cloud_request(${account}::uuid) AS allowed`;
      return row?.allowed===true;
    },
    list:async(account,game)=>{
      const [row]=await sql()`SELECT public.list_managed_auto_snapshots(${account}::uuid,${game}::uuid,${scope.deviceId}::uuid) AS result`;
      return row?.result??null;
    },
    store:async(account,game,raw)=>{
      const [row]=await sql()`SELECT public.store_atomic_managed_autosave(${account}::uuid,${game}::uuid,${scope.deviceId}::uuid,${raw}) AS result`;
      return row?.result??null;
    },
    read:async(account,game,id)=>{
      const [row]=await sql()`SELECT public.read_atomic_managed_autosave(${account}::uuid,${game}::uuid,${scope.deviceId}::uuid,${id}::uuid) AS result`;
      return row?.result??null;
    },
  };
}
async function snapshots(request:Request,{params}:Context){
  const scope:ManagedCloudScope={expectedAccount:request.headers.get('x-slopboy-sync-account')??'',deviceId:(request.headers.get('x-slopboy-sync-device')??'').toLowerCase()};
  return handleNamedCloud(request,(await params).gameId,dependencies(scope),scope);
}
export const GET=snapshots;
export const POST=snapshots;
