import {neon} from '@neondatabase/serverless';
import {readProfile} from '@/lib/auth/database';
import {currentSubject} from '@/lib/auth/server';
import {readPlayableGame} from '@/server/playable-catalog';
import {cloudStorageReady,uploadCloudSave,downloadCloudSave} from '@/server/cloud-backup-storage';
import {handleNamedCloud,managedCloudEnabled,type NamedCloudDependencies,type ManagedCloudScope} from '@/server/named-cloud-api';

export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{gameId:string}>};
function dependencies(scope:ManagedCloudScope):NamedCloudDependencies{
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
    reserve:async(account,game,digest,bytes,meta)=>{
      const [row]=await sql()`SELECT public.reserve_managed_auto_snapshot(${account}::uuid,${game}::uuid,${scope.deviceId}::uuid,${digest},${bytes},${JSON.stringify(meta)}::jsonb) AS result`;
      return row?.result??null;
    },
    confirm:async(account,game,id)=>{
      const [row]=await sql()`SELECT public.confirm_managed_auto_snapshot(${account}::uuid,${game}::uuid,${scope.deviceId}::uuid,${id}::uuid) AS result`;
      return row?.result??null;
    },
    lookup:async(account,game,id)=>{
      const [row]=await sql()`SELECT public.lookup_managed_auto_snapshot(${account}::uuid,${game}::uuid,${scope.deviceId}::uuid,${id}::uuid) AS result`;
      return row?.result??null;
    },
    upload:uploadCloudSave,download:downloadCloudSave,
  };
}
async function snapshots(request:Request,{params}:Context){
  const scope:ManagedCloudScope={expectedAccount:request.headers.get('x-slopboy-sync-account')??'',deviceId:(request.headers.get('x-slopboy-sync-device')??'').toLowerCase()};
  return handleNamedCloud(request,(await params).gameId,dependencies(scope),scope);
}
export const GET=snapshots;
export const POST=snapshots;
