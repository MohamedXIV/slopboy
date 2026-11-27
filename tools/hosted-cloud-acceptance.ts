/**
 * Anonymous hosted production cloud acceptance. Intentionally no session
 * cookie, bypass token, secret, test account, storage access, or valid save.
 * An HTML 401 from deployment protection does NOT pass this test.
 */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const HOSTED_CLOUD_ORIGIN='https://slopboy.vercel.app';
export const HOSTED_CLOUD_ROUTE='/api/account/games/3ce74eec-ca3c-484b-8d16-2af4840c539b/cloud-snapshots';
const UNKNOWN_BACKUP='00000000-0000-4000-8000-000000000000';

export interface HostedCloudCheck{
  readonly name:string;
  readonly status:number;
}
export async function acceptAnonymousCloud(fetcher:typeof fetch=fetch):Promise<readonly HostedCloudCheck[]>{
  const checks:HostedCloudCheck[]=[];
  async function check(name:string,path:string,status:number,code:string,options:RequestInit={}){
    const response=await fetcher(HOSTED_CLOUD_ORIGIN+path,{
      ...options,redirect:'manual',cache:'no-store',credentials:'omit',
      signal:AbortSignal.timeout(15_000),
      headers:{'Accept':'application/json',...options.headers},
    });
    if(response.status!==status||!response.headers.get('content-type')?.includes('application/json'))
      throw Error('HOSTED_HTTP_MISMATCH '+name+' status='+response.status);
    const cache=response.headers.get('cache-control')??'';
    if(!cache.includes('private')||!cache.includes('no-store')||
      response.headers.get('x-content-type-options')!=='nosniff')throw Error('HOSTED_HEADERS_MISMATCH '+name);
    const body:unknown=await response.json();
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==1||!('error' in body)||body.error!==code)
      throw Error('HOSTED_ERROR_MISMATCH '+name);
    checks.push({name,status});
  }
  await check('anonymous list',HOSTED_CLOUD_ROUTE,401,'UNAUTHENTICATED');
  await check('anonymous restore',HOSTED_CLOUD_ROUTE+'?backupId='+UNKNOWN_BACKUP,401,'UNAUTHENTICATED');
  await check('cross-site read',HOSTED_CLOUD_ROUTE,403,'INVALID_ORIGIN',{
    headers:{'sec-fetch-site':'cross-site'},
  });
  await check('anonymous upload',HOSTED_CLOUD_ROUTE,401,'UNAUTHENTICATED',{
    method:'POST',headers:{origin:HOSTED_CLOUD_ORIGIN,'content-type':'application/json'},body:'{}',
  });
  await check('cross-origin upload',HOSTED_CLOUD_ROUTE,403,'INVALID_ORIGIN',{
    method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json','sec-fetch-site':'cross-site'},body:'{}',
  });
  return checks;
}
async function main(){
  const checks=await acceptAnonymousCloud();
  for(const check of checks)console.log('PASS',check.status,check.name);
  console.log('Anonymous hosted cloud acceptance PASS; signed-in upload/restore and multi-account isolation NOT tested.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error instanceof Error?error.message:'HOSTED_PROBE_FAILED');process.exitCode=1;});
}
