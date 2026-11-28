/** Offline inventory comparison only. No DB/storage credentials, networking,
 * deletion, confirmation or quota release. Output contains hashed keys only. */
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const LIMIT=1000;
const MAX_INPUT_BYTES=4*1024*1024;
const MAX_CAPTURE_SKEW_MS=5*60_000;
const STALE_AFTER_MS=15*60_000;
const MAX_OBJECT_BYTES=5*1024**4;
const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const ID=new RegExp('^'+UUID+'$');
const DIGEST=/^[a-f0-9]{64}$/;
const OWNED_KEY=new RegExp('^backups/'+UUID+'/'+UUID+'/'+UUID+'/[a-f0-9]{64}\\.json$');
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const size=(v:unknown,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const timestamp=(v:unknown):number=>{
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v))throw Error('INVALID_TIMESTAMP');
  const t=Date.parse(v);if(!Number.isFinite(t))throw Error('INVALID_TIMESTAMP');return t;
};
type Lane='legacy'|'named'|'managed';
type Row={key:string;lane:Lane;status:'ready'|'pending';bytes:number;activity:number;retired:boolean};
type Stored={key:string;bytes:number;modified:number};
type Category='ready-size-match'|'ready-missing'|'ready-size-mismatch'|'pending-recent'|'pending-stale-present'|'pending-stale-missing'|'pending-stale-size-mismatch'|'orphan-recent'|'orphan-stale'|'unexpected-key'|'retired-present'|'retired-missing'|'retired-size-mismatch';
type Entry={keyRef:string;category:Category;lane:Lane|null;reservedBytes:number;objectBytes:number};
const keyRef=(key:string)=>createHash('sha256').update(key).digest('hex');
function parseMetadata(input:unknown){
  if(!obj(input)||input.complete!==true||!Array.isArray(input.rows)||input.rows.length>LIMIT)
    throw Error('INCOMPLETE_METADATA_INVENTORY');
  const captured=timestamp(input.capturedAt),rows=new Map<string,Row>();
  for(const row of input.rows){
    if(!obj(row)||typeof row.key!=='string'||typeof row.accountId!=='string'||!ID.test(row.accountId)||
      typeof row.gameId!=='string'||!ID.test(row.gameId)||typeof row.id!=='string'||!ID.test(row.id)||
      typeof row.digest!=='string'||!DIGEST.test(row.digest)||
      row.key!=='backups/'+row.accountId+'/'+row.gameId+'/'+row.id+'/'+row.digest+'.json'||
      (row.lane!=='legacy'&&row.lane!=='named'&&row.lane!=='managed')||(row.status!=='ready'&&row.status!=='pending')||
      !size(row.bytes,256*1024)||(row.lane!=='legacy'&&row.bytes===0)||rows.has(row.key))
      throw Error('INVALID_OR_DUPLICATE_METADATA');
    if(row.lane==='managed'&&(input.managedIncluded!==true||!Object.hasOwn(row,'retiredAt')))throw Error('INCOMPLETE_MANAGED_INVENTORY');
    const retired=row.retiredAt==null?null:timestamp(row.retiredAt);
    if(retired!==null&&(row.lane!=='managed'||row.status!=='ready'))throw Error('INVALID_RETIREMENT');
    const created=timestamp(row.createdAt);
    const attempted=row.lastAttemptAt==null?created:timestamp(row.lastAttemptAt);
    const ready=row.readyAt===null?null:timestamp(row.readyAt);
    if((row.status==='ready')!==(ready!==null)||attempted<created||
      (ready!==null&&ready<created)||(retired!==null&&(ready===null||retired<ready))||Math.max(created,attempted,ready??0,retired??0)>captured)
      throw Error('INVALID_METADATA_TIME');
    rows.set(row.key,{key:row.key,lane:row.lane,status:row.status,bytes:row.bytes,activity:Math.max(created,attempted,ready??0,retired??0),retired:retired!==null});
  }
  const transactionalRows=input.transactionalRows??0,transactionalBytes=input.transactionalBytes??0;
  if(!size(transactionalRows,1000)||!size(transactionalBytes,16*1024*1024)||
    (transactionalRows===0)!==(transactionalBytes===0)||((transactionalRows>0||transactionalBytes>0)&&input.managedIncluded!==true))throw Error('INVALID_TRANSACTIONAL_INVENTORY');
  const namedTransactionalRows=input.namedTransactionalRows??0,namedTransactionalBytes=input.namedTransactionalBytes??0;
  if(!size(namedTransactionalRows,1000)||!size(namedTransactionalBytes,16*1024*1024)||
    (namedTransactionalRows===0)!==(namedTransactionalBytes===0)||((namedTransactionalRows>0||namedTransactionalBytes>0)&&input.managedIncluded!==true))throw Error('INVALID_NAMED_TRANSACTIONAL_INVENTORY');
  return {captured,rows,managedIncluded:input.managedIncluded===true,transactionalRows,transactionalBytes,namedTransactionalRows,namedTransactionalBytes};
}
function parseObjects(input:unknown,captured:number){
  if(!obj(input)||input.IsTruncated!==false||input.Prefix!=='backups/'||input.NextContinuationToken||
    input.ContinuationToken||input.StartAfter||input.NextToken||input.Delimiter||
    (Array.isArray(input.CommonPrefixes)&&input.CommonPrefixes.length))
    throw Error('INCOMPLETE_STORAGE_INVENTORY');
  const entries=input.Contents??[];
  if(!Array.isArray(entries)||entries.length>LIMIT||input.KeyCount!==entries.length)
    throw Error('INVALID_STORAGE_INVENTORY');
  const objects=new Map<string,Stored>();
  for(const row of entries){
    if(!obj(row)||typeof row.Key!=='string'||!row.Key.startsWith('backups/')||row.Key.length>1024||
      !size(row.Size,MAX_OBJECT_BYTES)||objects.has(row.Key))throw Error('INVALID_OR_DUPLICATE_OBJECT');
    const modified=timestamp(row.LastModified);
    if(modified>captured+MAX_CAPTURE_SKEW_MS)throw Error('INVALID_STORAGE_TIME');
    objects.set(row.Key,{key:row.Key,bytes:row.Size,modified});
  }
  return objects;
}
export function compareCloudInventory(metadata:unknown,storage:unknown,storageCapturedAt:string){
  const {captured,rows,managedIncluded,transactionalRows,transactionalBytes,namedTransactionalRows,namedTransactionalBytes}=parseMetadata(metadata),storageCaptured=timestamp(storageCapturedAt);
  if(Math.abs(captured-storageCaptured)>MAX_CAPTURE_SKEW_MS)throw Error('INVENTORY_CAPTURE_SKEW');
  const objects=parseObjects(storage,storageCaptured);
  const cutoff=Math.min(captured,storageCaptured)-STALE_AFTER_MS;
  const entries:Entry[]=[];
  for(const [key,row] of rows){
    const stored=objects.get(key);
    let category:Category;
    if(row.retired)category=!stored?'retired-missing':stored.bytes!==row.bytes?'retired-size-mismatch':'retired-present';
    else if(row.status==='ready')category=!stored?'ready-missing':stored.bytes!==row.bytes?'ready-size-mismatch':'ready-size-match';
    else if(Math.max(row.activity,stored?.modified??0)>cutoff)category='pending-recent';
    else category=!stored?'pending-stale-missing':stored.bytes!==row.bytes?'pending-stale-size-mismatch':'pending-stale-present';
    entries.push({keyRef:keyRef(key),category,lane:row.lane,reservedBytes:row.bytes,objectBytes:stored?.bytes??0});
  }
  for(const [key,stored] of objects){
    if(rows.has(key))continue;
    entries.push({keyRef:keyRef(key),category:!OWNED_KEY.test(key)?'unexpected-key':
      stored.modified>cutoff?'orphan-recent':'orphan-stale',lane:null,reservedBytes:0,objectBytes:stored.bytes});
  }
  entries.sort((a,b)=>a.keyRef.localeCompare(b.keyRef));
  const counts:Partial<Record<Category,number>>={};
  for(const entry of entries)counts[entry.category]=(counts[entry.category]??0)+1;
  return {format:'slopboy-cloud-inventory-audit-v1',mode:'read-only-observations',integrityVerified:false,
    capturedAt:new Date(captured).toISOString(),storageCapturedAt:new Date(storageCaptured).toISOString(),
    metadataRows:rows.size,storageObjects:objects.size,managedIncluded,transactionalRows,transactionalBytes,namedTransactionalRows,namedTransactionalBytes,
    retiredReservedBytes:[...rows.values()].filter(row=>row.retired).reduce((n,row)=>n+row.bytes,0),
    reservedBytes:entries.reduce((n,e)=>n+e.reservedBytes,0),
    observedObjectBytes:entries.reduce((n,e)=>n+e.objectBytes,0),
    counts,entries};
}
async function readJson(path:string):Promise<unknown>{
  const info=await stat(path);
  if(!info.isFile()||info.size>MAX_INPUT_BYTES)throw Error('INVALID_INVENTORY_FILE');
  const raw=await readFile(path);if(raw.byteLength>MAX_INPUT_BYTES)throw Error('INVALID_INVENTORY_FILE');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)) as unknown;
}
async function main(){
  // Positional arguments avoid any ambiguous or ignored options.
  const [metadata,objects,captured,...extra]=process.argv.slice(2);
  if(!metadata||!objects||!captured||extra.length)throw Error('USAGE');
  const report=compareCloudInventory(await readJson(metadata),await readJson(objects),captured);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    // Never echo private keys, filesystem paths, raw JSON or provider responses.
    const message=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'AUDIT_INPUT_UNAVAILABLE';
    process.stderr.write('Cloud inventory audit refused: '+message+'\n');process.exitCode=1;
  });
}
