import {createHash,createHmac} from 'node:crypto';

const PREFIX='backups/';
export function cloudStorageReady():boolean {
  return process.env.CLOUD_SAVE_BACKUPS_ENABLED==='1'
    && process.env.CLOUD_SAVE_CONDITIONAL_PUT_VERIFIED==='1'
    && Boolean(process.env.CLOUD_SAVE_BUCKET?.startsWith('slopboy-cloud-backups-'))
    && Boolean(process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const hmac=(key:Buffer|string,value:string)=>createHmac('sha256',key).update(value).digest();
function owned(key:string,account:string,game:string,id:string,digest:string):boolean {
  return [account,game,id].every(value=>/^[a-f0-9-]{36}$/.test(value))
    && /^[a-f0-9]{64}$/.test(digest)
    && key===[PREFIX.slice(0,-1),account,game,id,digest+'.json'].join('/');
}
async function signed(method:'PUT'|'GET',key:string,body?:Uint8Array,
  conditional=false):Promise<Response> {
  if(!key.startsWith(PREFIX)||!/^[a-z0-9/-]+\.json$/.test(key))
    throw new Error('INVALID_STORAGE_KEY');
  const endpoint=process.env.AWS_ENDPOINT_URL_S3!,region=process.env.AWS_REGION!;
  const url=new URL(endpoint.replace(/\/$/,'')+'/'+process.env.CLOUD_SAVE_BUCKET+'/'+key);
  if(url.protocol!=='https:') throw new Error('INVALID_STORAGE_ENDPOINT');
  const bytes=body??new Uint8Array();
  const digest=hash(bytes);
  const stamp=new Date().toISOString().replace(/[-:]|\.\d{3}/g,'');
  const day=stamp.slice(0,8);
  const headers:Record<string,string>={
    host:url.host,'x-amz-content-sha256':digest,'x-amz-date':stamp,
  };
  if(method==='PUT'){
    headers['content-type']='application/octet-stream';
    headers['cache-control']='private, no-store';
  }
  if(conditional)headers['if-none-match']='*';
  const names=Object.keys(headers).sort();
  const canonical=[method,url.pathname,'',
    names.map(name=>name+':'+headers[name].trim()+'\n').join(''),
    names.join(';'),digest].join('\n');
  const scope=day+'/'+region+'/s3/aws4_request';
  const signedPayload=['AWS4-HMAC-SHA256',stamp,scope,
    createHash('sha256').update(canonical).digest('hex')].join('\n');
  const signingKey=hmac(hmac(hmac(hmac('AWS4'+process.env.AWS_SECRET_ACCESS_KEY!,day),region),'s3'),'aws4_request');
  const signature=createHmac('sha256',signingKey).update(signedPayload).digest('hex');
  const {host:_host,...outgoing}=headers;
  return fetch(url,{method,headers:{
    ...outgoing,
    authorization:'AWS4-HMAC-SHA256 Credential='+process.env.AWS_ACCESS_KEY_ID+
      '/'+scope+', SignedHeaders='+names.join(';')+', Signature='+signature,
  },body:method==='PUT'?Buffer.from(bytes):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10_000)});
}
export async function uploadCloudSave(key:string,account:string,game:string,id:string,
  digest:string,bytes:Uint8Array):Promise<void>{
  if(!cloudStorageReady()||!owned(key,account,game,id,digest))
    throw new Error('STORAGE_GATE_CLOSED');
  const write=await signed('PUT',key,bytes,true);
  if(!write.ok&&write.status!==412) throw new Error('STORAGE_WRITE_FAILED');
  const verification=await signed('GET',key);
  if(!verification.ok) throw new Error('STORAGE_READBACK_FAILED');
  const received=Buffer.from(await verification.arrayBuffer());
  if(received.byteLength!==bytes.byteLength||hash(received)!==digest||
    !received.equals(Buffer.from(bytes))) throw new Error('STORAGE_DIGEST_MISMATCH');
}
// Storage and Postgres are separate systems. If confirmation committed but its
// response was lost, a second confirmation is idempotent. Never compensate
// by deleting the object or releasing its reservation on an ambiguous error.
export async function completeCloudBackup<T>(
  upload:()=>Promise<void>,confirm:()=>Promise<T>,
):Promise<T>{
  await upload();
  try{return await confirm();}
  catch{return await confirm();}
}
