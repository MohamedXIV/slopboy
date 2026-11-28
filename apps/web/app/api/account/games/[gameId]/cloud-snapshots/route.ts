import {neon} from '@neondatabase/serverless';
import {readProfile} from '@/lib/auth/database';
import {currentSubject} from '@/lib/auth/server';
import {readPlayableGame} from '@/server/playable-catalog';
import {cloudStorageReady,uploadCloudSave,downloadCloudSave} from '@/server/cloud-backup-storage';
import {handleNamedCloud,namedCloudEnabled,managedCloudEnabled,type NamedCloudDependencies,type AtomicNamedDependencies,type CloudMutationTarget} from '@/server/named-cloud-api';

export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{gameId:string}>};
function dependencies(expectedAccount:string|null):NamedCloudDependencies|AtomicNamedDependencies{
  const sql=()=>{
    if(!process.env.DATABASE_URL)throw Error('DATABASE_UNAVAILABLE');
    return neon(process.env.DATABASE_URL);
  };
  let verified:Awaited<ReturnType<typeof currentSubject>>=null;
  const base:NamedCloudDependencies={
    enabled:()=>namedCloudEnabled(process.env)&&cloudStorageReady(),
    subject:async()=>{verified=await currentSubject();return verified;},
    role:async actor=>verified&&verified.id===actor.id&&(!expectedAccount||expectedAccount===actor.id.toLowerCase())?(await readProfile(verified))?.role:null,
    game:readPlayableGame,
    consumeRequest:async account=>{
      const [row]=await sql()`SELECT public.consume_named_cloud_request(${account}::uuid) AS allowed`;
      return row?.allowed===true;
    },
    list:async(account,game)=>{
      const [row]=await sql()`SELECT public.list_named_cloud_snapshots(${account}::uuid,${game}::uuid) AS result`;
      return row?.result??null;
    },
    reserve:async(account,game,digest,bytes,meta)=>{
      const [row]=await sql()`SELECT public.reserve_named_cloud_snapshot(${account}::uuid,${game}::uuid,${digest},${bytes},${JSON.stringify(meta)}::jsonb) AS result`;
      return row?.result??null;
    },
    confirm:async(account,game,id)=>{
      const [row]=await sql()`SELECT public.confirm_named_cloud_snapshot(${account}::uuid,${game}::uuid,${id}::uuid) AS result`;
      return row?.result??null;
    },
    lookup:async(account,game,id)=>{
      const [row]=await sql()`SELECT public.lookup_named_cloud_snapshot(${account}::uuid,${game}::uuid,${id}::uuid) AS result`;
      return row?.result??null;
    },
    upload:uploadCloudSave,download:downloadCloudSave,
  };
  if(!managedCloudEnabled(process.env))return base;
  const decorate=async<T extends {snapshots?:unknown[]}>(account:string,game:string,result:T|null):Promise<T|null>=>{
    if(!result||!Array.isArray(result.snapshots))return result;
    const [row]=await sql()`SELECT public.list_deleted_named_snapshot_ids(${account}::uuid,${game}::uuid) AS ids`;
    if(!Array.isArray(row?.ids))throw Error('INVALID_DELETION_LIST');
    return {...result,deletedSnapshotIds:row.ids};
  };
  return {...base,
    list:async(account,game)=>decorate(account,game,await base.list(account,game)),
    store:async(account,game,raw,target?:CloudMutationTarget)=>{
      const [row]=await sql()`SELECT public.store_atomic_named_snapshot(${account}::uuid,${game}::uuid,${raw},${target?.id??null}::uuid,${target?.digest??null}) AS result`;
      return decorate(account,game,row?.result??null);
    },
    remove:async(account,game,target)=>{
      const [row]=await sql()`SELECT public.delete_atomic_named_snapshot(${account}::uuid,${game}::uuid,${target.id}::uuid,${target.digest}) AS result`;
      return decorate(account,game,row?.result??null);
    },
    read:async(account,game,id)=>{
      const [row]=await sql()`SELECT public.read_atomic_named_snapshot(${account}::uuid,${game}::uuid,${id}::uuid) AS result`;
      return row?.result??null;
    },
  };
}
async function snapshots(request:Request,{params}:Context){
  return handleNamedCloud(request,(await params).gameId,dependencies(request.headers.get('x-slopboy-sync-account')));
}
export const GET=snapshots;
export const POST=snapshots;
export const DELETE=snapshots;
